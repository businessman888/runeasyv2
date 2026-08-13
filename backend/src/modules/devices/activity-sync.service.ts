import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { TrainingService } from '../training/training.service';
import { CreateWorkoutTrackingDto } from '../training/dto/workout-tracking.dto';
import { CompleteFreeWorkoutDto } from '../training/dto/complete-free-workout.dto';
import { paceValueToSecondsPerKm } from '../../common/pace-calculator';

/**
 * Standardized activity payload from any wearable provider.
 * Each provider adapter (Fitbit, Polar, Garmin) normalizes their data to this format.
 */
export interface WearableActivity {
  external_id: string; // Unique ID from provider
  source: string; // 'garmin' | 'fitbit' | 'polar' | 'apple_watch'
  user_id: string;
  name: string; // Activity name/title
  type: string; // 'Run', 'Walk', etc.
  start_date: string; // ISO timestamp
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time?: number; // seconds (total including pauses)
  // Unidade canônica do repo: SEGUNDOS por km (ver pace-format.ts). Os
  // normalizers (apple-health / health-connect) já entregam nessa unidade.
  average_pace?: number; // segundos/km
  max_pace?: number; // segundos/km
  elevation_gain?: number; // meters
  average_heartrate?: number; // bpm
  max_heartrate?: number; // bpm
  calories?: number;
  splits_metric?: any[]; // Provider-specific split data
}

/**
 * Device-local source payload — Apple HealthKit (iOS) or Google Health Connect
 * (Android). Same shape as WearableActivity plus the optional GPS route and an
 * explicit environment flag (treadmill runs never have GPS).
 */
export interface DeviceLocalActivity extends WearableActivity {
  gps_route?: Array<{
    lat: number;
    lng: number;
    altitude?: number;
    timestamp: number;
  }>;
  environment: 'outdoor' | 'treadmill';
}

// Deduplication window: activities within this range are considered overlapping
const DEDUP_WINDOW_MINUTES = 10;

// Stricter cross-provider window for device-local sources (Apple Health,
// Health Connect). Used to skip ingestion when another wearable (Garmin,
// Fitbit, Polar, Apple Watch, etc.) already wrote the same run.
const CROSS_PROVIDER_WINDOW_MINUTES = 5;
const CROSS_PROVIDER_DISTANCE_TOLERANCE = 0.1; // ±10%

const RECONCILE_DISTANCE_TOLERANCE = 0.1; // ±10%
const RECONCILE_AMBIGUITY_MARGIN = 0.05; // 5 percentage points
const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 (BRT)

export interface ReconciliationCandidate {
  id: string;
  source: 'plan' | 'manual';
  scheduled_date: string;
  distance_km: number | string | null;
}

/**
 * Selects only a high-confidence same-day match. When two candidates are
 * similarly close, returning null is intentional: silently completing the
 * wrong planned/manual workout is harder to recover from than importing a
 * free activity.
 */
export function selectReconciliationCandidate(
  activityDate: string,
  executedKm: number,
  candidates: ReconciliationCandidate[],
): ReconciliationCandidate | null {
  if (!Number.isFinite(executedKm) || executedKm <= 0) return null;

  const scored = candidates
    .filter((candidate) => candidate.scheduled_date === activityDate)
    .map((candidate) => {
      const plannedKm = Number(candidate.distance_km ?? 0);
      if (!Number.isFinite(plannedKm) || plannedKm <= 0) return null;
      return {
        candidate,
        distanceDiff: Math.abs(plannedKm - executedKm) / plannedKm,
      };
    })
    .filter(
      (entry): entry is {
        candidate: ReconciliationCandidate;
        distanceDiff: number;
      } =>
        entry !== null &&
        entry.distanceDiff <= RECONCILE_DISTANCE_TOLERANCE,
    )
    .sort((left, right) => left.distanceDiff - right.distanceDiff);

  if (scored.length === 0) return null;
  if (
    scored.length > 1 &&
    scored[1].distanceDiff - scored[0].distanceDiff <
      RECONCILE_AMBIGUITY_MARGIN
  ) {
    return null;
  }

  return scored[0].candidate;
}

// Two device-local sources today; the cross-provider dedup query skips both
// of them so a user with iPhone + Android wearable in parallel doesn't dup.
const DEVICE_LOCAL_SOURCES = ['apple_health', 'health_connect'] as const;
type DeviceLocalSource = (typeof DEVICE_LOCAL_SOURCES)[number];

@Injectable()
export class ActivitySyncService {
  private readonly logger = new Logger(ActivitySyncService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => TrainingService))
    private readonly trainingService: TrainingService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Process an incoming wearable activity from a server-side webhook (Fitbit,
   * Polar, Garmin Connect API). Webhooks are fetched by the backend itself —
   * no reconciliation here; the activity just lands in `activities` and the
   * Calendar/Home derives the rest. (Plan-workout linking for those sources
   * happens through a separate path the mobile triggers.)
   *
   * Handles deduplication: if a phone-sourced activity overlaps, marks it as
   * redundant. Returns the inserted/existing activity.
   */
  async processWearableActivity(activity: WearableActivity) {
    // 1. Check if this exact external_id already exists (idempotency)
    const { data: existing } = await this.supabaseService
      .from('activities')
      .select('id, external_id')
      .eq('external_id', activity.external_id)
      .single();

    if (existing) {
      this.logger.log(
        `Activity ${activity.external_id} already synced, skipping`,
      );
      return { action: 'skipped', activityId: existing.id };
    }

    // 2. Check for overlapping phone-sourced activities (deduplication)
    const startTime = new Date(activity.start_date);
    const windowStart = new Date(
      startTime.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000,
    );
    const windowEnd = new Date(
      startTime.getTime() +
        activity.moving_time * 1000 +
        DEDUP_WINDOW_MINUTES * 60 * 1000,
    );

    const { data: overlapping } = await this.supabaseService
      .from('activities')
      .select('id, source, start_date')
      .eq('user_id', activity.user_id)
      .eq('source', 'phone')
      .gte('start_date', windowStart.toISOString())
      .lte('start_date', windowEnd.toISOString());

    // 3. Mark overlapping phone activities as redundant
    if (overlapping && overlapping.length > 0) {
      const redundantIds = overlapping.map((a) => a.id);
      this.logger.log(
        `Found ${redundantIds.length} overlapping phone activities for user ${activity.user_id}, marking as redundant`,
      );

      await this.supabaseService
        .from('activities')
        .update({ source: 'phone_redundant' })
        .in('id', redundantIds);
    }

    // 4. Insert the wearable activity
    const { data: inserted, error } = await this.supabaseService
      .from('activities')
      .insert({
        user_id: activity.user_id,
        external_id: activity.external_id,
        source: activity.source,
        name: activity.name,
        type: activity.type,
        start_date: activity.start_date,
        distance: activity.distance,
        moving_time: activity.moving_time,
        elapsed_time: activity.elapsed_time || activity.moving_time,
        // Segundos/km (canônico). O helper é no-op para valores já em segundos
        // e converte o decimal min/km de um provider legado que ainda o envie.
        average_pace: paceValueToSecondsPerKm(activity.average_pace),
        max_pace: paceValueToSecondsPerKm(activity.max_pace),
        elevation_gain: activity.elevation_gain || 0,
        average_heartrate: activity.average_heartrate || null,
        max_heartrate: activity.max_heartrate || null,
        calories: activity.calories || null,
        splits_metric: activity.splits_metric || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to insert wearable activity: ${error.message}`,
        error,
      );
      throw error;
    }

    this.logger.log(
      `Wearable activity synced: ${activity.source}/${activity.external_id} → ${inserted.id}` +
        (overlapping?.length
          ? ` (${overlapping.length} phone activities marked redundant)`
          : ''),
    );

    return {
      action: 'inserted',
      activityId: inserted.id,
      redundantCount: overlapping?.length || 0,
    };
  }

  /**
   * Process an activity that was extracted on the device itself — Apple
   * HealthKit (iOS) or Google Health Connect (Android). Both sources share
   * one pipeline since the only difference is the external_id prefix and the
   * permission model on the client.
   *
   * The full pipeline:
   *
   *  1. Idempotency check (exact `external_id` match).
   *  2. Cross-provider temporal/distance dedup (±5 min, ±10% distance): if
   *     another wearable (Garmin, Fitbit, Polar, Apple Watch) already wrote
   *     the same run, the device-local source is silently dropped.
   *  3. Phone-tracking redundant marker: any phone-sourced run inside the
   *     ±10 min window is flipped to `phone_redundant` (the wearable record
   *     replaces the GPS run as canonical).
   *  4. Conservative reconciliation with a pending workout on the exact São
   *     Paulo day and within ±10% distance. Manual candidates are available to
   *     every tier; plan candidates only to Pro. Similar candidates are treated
   *     as ambiguous and imported as free rather than silently misclassified.
   *
   * NOTE: The legacy direct INSERT into `activities` (used by the old
   * processAppleHealthActivity) is removed — both `completeWorkout` and
   * `completeFreeWorkout` already upsert the canonical activity row with all
   * fields (gps_route, environment, heartrate, calories) and trigger
   * gamification + feedback-queue automatically.
   */
  async processDeviceLocalActivity(
    activity: DeviceLocalActivity,
    source: DeviceLocalSource,
  ) {
    const userId = activity.user_id;

    // 1. Idempotency check — exact external_id match
    const { data: existing } = await this.supabaseService
      .from('activities')
      .select('id, external_id')
      .eq('external_id', activity.external_id)
      .single();

    if (existing) {
      this.logger.log(
        `[${source}] activity ${activity.external_id} already synced, skipping`,
      );
      return { action: 'skipped', activityId: existing.id };
    }

    // 2. Cross-provider temporal/distance dedup (±5 min, ±10% distance).
    //    Excludes other device-local sources too — Apple Health on iOS plus
    //    Health Connect on a paired Android (rare but possible) would
    //    otherwise duplicate.
    const startTime = new Date(activity.start_date);
    const crossWindowStart = new Date(
      startTime.getTime() - CROSS_PROVIDER_WINDOW_MINUTES * 60 * 1000,
    );
    const crossWindowEnd = new Date(
      startTime.getTime() + CROSS_PROVIDER_WINDOW_MINUTES * 60 * 1000,
    );

    let crossProviderQuery = this.supabaseService
      .from('activities')
      .select('id, source, start_date, distance')
      .eq('user_id', userId)
      .neq('source', 'phone')
      .neq('source', 'phone_redundant')
      .gte('start_date', crossWindowStart.toISOString())
      .lte('start_date', crossWindowEnd.toISOString());

    // Exclude every device-local source from cross-provider matching — they
    // can't be authoritative for each other; the dedup above (step 1) handles
    // re-sync of the same physical run.
    for (const localSource of DEVICE_LOCAL_SOURCES) {
      crossProviderQuery = crossProviderQuery.neq('source', localSource);
    }

    const { data: crossProviderMatches } = await crossProviderQuery;

    if (crossProviderMatches && crossProviderMatches.length > 0) {
      const minDistance =
        activity.distance * (1 - CROSS_PROVIDER_DISTANCE_TOLERANCE);
      const maxDistance =
        activity.distance * (1 + CROSS_PROVIDER_DISTANCE_TOLERANCE);
      const overlap = crossProviderMatches.find(
        (m) => m.distance >= minDistance && m.distance <= maxDistance,
      );

      if (overlap) {
        this.logger.log(
          `[${source}] activity ${activity.external_id} overlaps with ${overlap.source} activity ${overlap.id}, skipping`,
        );
        return { action: 'skipped_crossprovider', activityId: overlap.id };
      }
    }

    // 3. Mark overlapping phone-sourced activities as redundant — the
    //    device-local record replaces the in-app GPS run as canonical.
    const phoneWindowStart = new Date(
      startTime.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000,
    );
    const phoneWindowEnd = new Date(
      startTime.getTime() +
        activity.moving_time * 1000 +
        DEDUP_WINDOW_MINUTES * 60 * 1000,
    );

    const { data: overlappingPhone } = await this.supabaseService
      .from('activities')
      .select('id, source, start_date')
      .eq('user_id', userId)
      .eq('source', 'phone')
      .gte('start_date', phoneWindowStart.toISOString())
      .lte('start_date', phoneWindowEnd.toISOString());

    if (overlappingPhone && overlappingPhone.length > 0) {
      const redundantIds = overlappingPhone.map((a) => a.id);
      await this.supabaseService
        .from('activities')
        .update({ source: 'phone_redundant' })
        .in('id', redundantIds);
    }

    // 4. Reconciliation with plan workout (Pro) or fall back to free run.
    //    Builds the same payload the in-app completeWorkout/completeFreeWorkout
    //    expects, then delegates — that path owns activities upsert + workouts
    //    update + gamification + feedback-queue (only fires for source='plan').
    const trackingPayload = this.toTrackingPayload(activity, source);
    const freePayload = this.toFreePayload(activity, source);

    const isPro = await this.safeIsProUser(userId);

    // Manual workouts can belong to any tier. Plan candidates are considered
    // only for Pro users, so a stale/free subscription can never complete a
    // plan workout by inference.
    const matchedWorkout = await this.findMatchingWorkout(
      userId,
      activity,
      isPro,
    );

    if (matchedWorkout) {
      try {
        await this.trainingService.completeWorkout(
          userId,
          matchedWorkout.id,
          trackingPayload,
        );
        this.logger.log(
          `[${source}] activity ${activity.external_id} → ${matchedWorkout.source} workout ${matchedWorkout.id} completed` +
            (overlappingPhone?.length
              ? ` (${overlappingPhone.length} phone activities marked redundant)`
              : ''),
        );
        return {
          action: 'inserted',
          activityId: null, // resolved internally by completeWorkout
          workoutId: matchedWorkout.id,
          redundantCount: overlappingPhone?.length || 0,
          reconciliation: `${matchedWorkout.source}_match`,
        };
      } catch (err) {
        // If the plan link fails for any reason, degrade to free-run so the
        // user still sees the activity. This protects against rare cases like
        // the workout being deleted between query and update.
        this.logger.warn(
          `[${source}] completeWorkout failed for workout ${matchedWorkout.id}, falling back to free run: ${(err as Error).message}`,
        );
      }
    }

    const workout = await this.trainingService.completeFreeWorkout(
      userId,
      freePayload,
    );
    this.logger.log(
      `[${source}] activity ${activity.external_id} → free run (workout=${workout?.id}, no plan match)` +
        (overlappingPhone?.length
          ? ` (${overlappingPhone.length} phone activities marked redundant)`
          : ''),
    );
    return {
      action: 'inserted',
      activityId: workout?.activity_id ?? null,
      redundantCount: overlappingPhone?.length || 0,
      reconciliation: isPro ? 'no_workout_match' : 'free_user_no_manual_match',
    };
  }

  /**
   * Candidate search is deliberately conservative: pending workouts on the
   * exact São Paulo calendar day and within ±10% distance. Ambiguous matches
   * degrade to a free activity instead of mutating the wrong workout.
   */
  private async findMatchingWorkout(
    userId: string,
    activity: DeviceLocalActivity,
    includePlan: boolean,
  ): Promise<ReconciliationCandidate | null> {
    const activityStart = new Date(activity.start_date);
    const saoPauloDate = this.toSaoPauloDateString(activityStart);
    const allowedSources = includePlan ? ['plan', 'manual'] : ['manual'];

    const { data: candidates, error } = await this.supabaseService
      .from('workouts')
      .select('id, source, distance_km, scheduled_date, type')
      .eq('user_id', userId)
      .in('source', allowedSources)
      .eq('status', 'pending')
      .eq('scheduled_date', saoPauloDate);

    if (error || !candidates || candidates.length === 0) return null;

    const executedKm = activity.distance / 1000;
    return selectReconciliationCandidate(
      saoPauloDate,
      executedKm,
      candidates as ReconciliationCandidate[],
    );
  }

  /**
   * Wrap isProUser in a safe call: any failure (e.g., user row not found
   * during a sync from an orphaned device) degrades gracefully to "free"
   * — the activity still lands in the user's history, just without the
   * plan link.
   */
  private async safeIsProUser(userId: string): Promise<boolean> {
    try {
      return await this.subscriptionService.isProUser(userId);
    } catch (e) {
      this.logger.warn(
        `[reconcile] isProUser lookup failed for ${userId}, defaulting to FREE: ${(e as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Convert a DeviceLocalActivity into the CreateWorkoutTrackingDto shape
   * that TrainingService.completeWorkout expects. The DTOs accept the source
   * union (apple_health, health_connect) after the change in this PR.
   */
  private toTrackingPayload(
    activity: DeviceLocalActivity,
    source: DeviceLocalSource,
  ): CreateWorkoutTrackingDto {
    const routePoints = (activity.gps_route ?? []).map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
      altitude: p.altitude ?? null,
      timestamp: p.timestamp,
      speed: null,
      accuracy: null,
    }));

    return {
      route_points: routePoints,
      total_distance_meters: activity.distance,
      duration_seconds: activity.moving_time,
      source,
      external_id: activity.external_id,
      started_at: activity.start_date,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      calories: activity.calories,
      // `average_pace` já vem em segundos/km dos normalizers — só normalizamos
      // o formato legado (decimal min/km) por segurança, via o helper único.
      avg_pace_seconds_per_km:
        paceValueToSecondsPerKm(activity.average_pace) ?? undefined,
      environment: activity.environment,
    };
  }

  /**
   * Same as toTrackingPayload but shaped for completeFreeWorkout (no
   * pre-existing workout id; the service creates a free-run workout row).
   */
  private toFreePayload(
    activity: DeviceLocalActivity,
    source: DeviceLocalSource,
  ): CompleteFreeWorkoutDto {
    const routePoints = (activity.gps_route ?? []).map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
      altitude: p.altitude ?? null,
      timestamp: p.timestamp,
      speed: null,
      accuracy: null,
    }));

    return {
      route_points: routePoints,
      total_distance_meters: activity.distance,
      duration_seconds: activity.moving_time,
      started_at: activity.start_date,
      source,
      external_id: activity.external_id,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      calories: activity.calories,
      // `average_pace` já vem em segundos/km dos normalizers — só normalizamos
      // o formato legado (decimal min/km) por segurança, via o helper único.
      avg_pace_seconds_per_km:
        paceValueToSecondsPerKm(activity.average_pace) ?? undefined,
      environment: activity.environment,
    };
  }

  /** Convert a UTC Date into YYYY-MM-DD in São Paulo local time (UTC-3). */
  private toSaoPauloDateString(date: Date): string {
    const shifted = new Date(
      date.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Get sync status for a user — which providers are connected and last sync time.
   */
  async getSyncStatus(userId: string) {
    // Get connected devices
    const { data: devices } = await this.supabaseService
      .from('connected_devices')
      .select('provider, device_name, connected_at, updated_at')
      .eq('user_id', userId);

    // Get last synced activity per source
    const { data: lastActivities } = await this.supabaseService
      .from('activities')
      .select('source, start_date')
      .eq('user_id', userId)
      .neq('source', 'phone')
      .neq('source', 'phone_redundant')
      .order('start_date', { ascending: false })
      .limit(1);

    const connectedProviders = (devices || []).map((d) => ({
      provider: d.provider,
      deviceName: d.device_name,
      connectedAt: d.connected_at,
    }));

    const lastSyncedActivity = lastActivities?.[0] || null;

    return {
      hasConnectedDevice: connectedProviders.length > 0,
      connectedProviders,
      lastSyncedActivity: lastSyncedActivity
        ? {
            source: lastSyncedActivity.source,
            date: lastSyncedActivity.start_date,
          }
        : null,
    };
  }
}
