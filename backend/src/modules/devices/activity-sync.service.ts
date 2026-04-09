import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

/**
 * Standardized activity payload from any wearable provider.
 * Each provider adapter (Fitbit, Polar, Garmin) normalizes their data to this format.
 */
export interface WearableActivity {
    external_id: string;         // Unique ID from provider
    source: string;              // 'garmin' | 'fitbit' | 'polar' | 'apple_watch'
    user_id: string;
    name: string;                // Activity name/title
    type: string;                // 'Run', 'Walk', etc.
    start_date: string;          // ISO timestamp
    distance: number;            // meters
    moving_time: number;         // seconds
    elapsed_time?: number;       // seconds (total including pauses)
    average_pace?: number;       // min/km
    max_pace?: number;           // min/km
    elevation_gain?: number;     // meters
    average_heartrate?: number;  // bpm
    max_heartrate?: number;      // bpm
    calories?: number;
    splits_metric?: any[];       // Provider-specific split data
}

// Deduplication window: activities within this range are considered overlapping
const DEDUP_WINDOW_MINUTES = 10;

// Stricter cross-provider window for HealthKit (Garmin + Apple Watch recording same run)
const CROSS_PROVIDER_WINDOW_MINUTES = 5;
const CROSS_PROVIDER_DISTANCE_TOLERANCE = 0.10; // ±10%

@Injectable()
export class ActivitySyncService {
    private readonly logger = new Logger(ActivitySyncService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    /**
     * Process an incoming wearable activity.
     * Handles deduplication: if a phone-sourced activity overlaps, marks it as redundant.
     * Returns the inserted/existing activity.
     */
    async processWearableActivity(activity: WearableActivity) {
        // 1. Check if this exact external_id already exists (idempotency)
        const { data: existing } = await this.supabaseService
            .from('activities')
            .select('id, external_id')
            .eq('external_id', activity.external_id)
            .single();

        if (existing) {
            this.logger.log(`Activity ${activity.external_id} already synced, skipping`);
            return { action: 'skipped', activityId: existing.id };
        }

        // 2. Check for overlapping phone-sourced activities (deduplication)
        const startTime = new Date(activity.start_date);
        const windowStart = new Date(startTime.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000);
        const windowEnd = new Date(startTime.getTime() + (activity.moving_time * 1000) + DEDUP_WINDOW_MINUTES * 60 * 1000);

        const { data: overlapping } = await this.supabaseService
            .from('activities')
            .select('id, source, start_date')
            .eq('user_id', activity.user_id)
            .eq('source', 'phone')
            .gte('start_date', windowStart.toISOString())
            .lte('start_date', windowEnd.toISOString());

        // 3. Mark overlapping phone activities as redundant
        if (overlapping && overlapping.length > 0) {
            const redundantIds = overlapping.map(a => a.id);
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
                average_pace: activity.average_pace || null,
                max_pace: activity.max_pace || null,
                elevation_gain: activity.elevation_gain || 0,
                average_heartrate: activity.average_heartrate || null,
                max_heartrate: activity.max_heartrate || null,
                calories: activity.calories || null,
                splits_metric: activity.splits_metric || null,
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to insert wearable activity: ${error.message}`, error);
            throw error;
        }

        this.logger.log(
            `Wearable activity synced: ${activity.source}/${activity.external_id} → ${inserted.id}` +
            (overlapping?.length ? ` (${overlapping.length} phone activities marked redundant)` : ''),
        );

        return {
            action: 'inserted',
            activityId: inserted.id,
            redundantCount: overlapping?.length || 0,
        };
    }

    /**
     * Process an Apple HealthKit activity.
     *
     * Unlike Fitbit/Polar (which are fetched server-side from the provider API),
     * HealthKit data is extracted and pre-normalized on the mobile device, then
     * posted here. The extra behaviors vs. processWearableActivity:
     *
     * 1. Cross-provider dedup: if the user already has a Garmin/Fitbit/Polar run
     *    within ±5 min and ±10% distance of this HealthKit run, skip it — the
     *    other provider is the source of truth.
     * 2. Stores the GPS route (HKWorkoutRoute) into activities.gps_route jsonb.
     */
    async processAppleHealthActivity(activity: {
        external_id: string;
        source: string;
        user_id: string;
        name: string;
        type: string;
        start_date: string;
        distance: number;
        moving_time: number;
        elapsed_time?: number;
        average_pace?: number;
        max_pace?: number;
        elevation_gain?: number;
        average_heartrate?: number;
        max_heartrate?: number;
        calories?: number;
        gps_route?: Array<{ lat: number; lng: number; altitude?: number; timestamp: number }>;
    }) {
        // 1. Idempotency check — exact external_id match
        const { data: existing } = await this.supabaseService
            .from('activities')
            .select('id, external_id')
            .eq('external_id', activity.external_id)
            .single();

        if (existing) {
            this.logger.log(`Apple Health activity ${activity.external_id} already synced, skipping`);
            return { action: 'skipped', activityId: existing.id };
        }

        // 2. Cross-provider temporal/distance dedup (±5 min, ±10% distance)
        const startTime = new Date(activity.start_date);
        const crossWindowStart = new Date(startTime.getTime() - CROSS_PROVIDER_WINDOW_MINUTES * 60 * 1000);
        const crossWindowEnd = new Date(startTime.getTime() + CROSS_PROVIDER_WINDOW_MINUTES * 60 * 1000);

        const { data: crossProviderMatches } = await this.supabaseService
            .from('activities')
            .select('id, source, start_date, distance')
            .eq('user_id', activity.user_id)
            .neq('source', 'phone')
            .neq('source', 'phone_redundant')
            .neq('source', 'apple_health')
            .gte('start_date', crossWindowStart.toISOString())
            .lte('start_date', crossWindowEnd.toISOString());

        if (crossProviderMatches && crossProviderMatches.length > 0) {
            const minDistance = activity.distance * (1 - CROSS_PROVIDER_DISTANCE_TOLERANCE);
            const maxDistance = activity.distance * (1 + CROSS_PROVIDER_DISTANCE_TOLERANCE);
            const overlap = crossProviderMatches.find(
                (m) => m.distance >= minDistance && m.distance <= maxDistance,
            );

            if (overlap) {
                this.logger.log(
                    `Apple Health activity ${activity.external_id} overlaps with existing ${overlap.source} activity ${overlap.id}, skipping`,
                );
                return { action: 'skipped_crossprovider', activityId: overlap.id };
            }
        }

        // 3. Mark overlapping phone-sourced activities as redundant (same behavior
        //    as processWearableActivity — the HealthKit run replaces the GPS run).
        const phoneWindowStart = new Date(startTime.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000);
        const phoneWindowEnd = new Date(startTime.getTime() + (activity.moving_time * 1000) + DEDUP_WINDOW_MINUTES * 60 * 1000);

        const { data: overlappingPhone } = await this.supabaseService
            .from('activities')
            .select('id, source, start_date')
            .eq('user_id', activity.user_id)
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

        // 4. Insert the Apple Health activity with gps_route
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
                average_pace: activity.average_pace || null,
                max_pace: activity.max_pace || null,
                elevation_gain: activity.elevation_gain || 0,
                average_heartrate: activity.average_heartrate || null,
                max_heartrate: activity.max_heartrate || null,
                calories: activity.calories || null,
                gps_route: activity.gps_route || null,
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to insert Apple Health activity: ${error.message}`, error);
            throw error;
        }

        this.logger.log(
            `Apple Health activity synced: ${activity.external_id} → ${inserted.id}` +
            (overlappingPhone?.length ? ` (${overlappingPhone.length} phone activities marked redundant)` : ''),
        );

        return {
            action: 'inserted',
            activityId: inserted.id,
            redundantCount: overlappingPhone?.length || 0,
        };
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

        const connectedProviders = (devices || []).map(d => ({
            provider: d.provider,
            deviceName: d.device_name,
            connectedAt: d.connected_at,
        }));

        const lastSyncedActivity = lastActivities?.[0] || null;

        return {
            hasConnectedDevice: connectedProviders.length > 0,
            connectedProviders,
            lastSyncedActivity: lastSyncedActivity
                ? { source: lastSyncedActivity.source, date: lastSyncedActivity.start_date }
                : null,
        };
    }
}
