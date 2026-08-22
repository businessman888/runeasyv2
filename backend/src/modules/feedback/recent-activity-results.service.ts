import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database';
import {
  formatPaceLabel,
  paceValueToSecondsPerKm,
} from '../../common/pace-calculator';
import type {
  ActivityResultBadgeDto,
  ActivityResultRoutePointDto,
  ActivityResultScope,
} from './dto/recent-activity-results.dto';

type DataRow = Record<string, unknown>;

interface NormalizedRoutePoint extends ActivityResultRoutePointDto {
  altitude: number | null;
  timestamp: number | null;
  speed: number | null;
}

interface SpeedSample {
  t: number;
  kmh: number;
}

const MAX_ROUTE_POINTS = 180;
const MAX_SERIES_POINTS = 24;
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function asRow(value: unknown): DataRow | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as DataRow)
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJsonObject(value: unknown): DataRow | null {
  if (typeof value !== 'string') return asRow(value);
  try {
    return asRow(JSON.parse(value));
  } catch {
    return null;
  }
}

function downsample<T>(values: T[], maxPoints: number): T[] {
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from(
    { length: maxPoints },
    (_, index) => values[Math.round(index * step)],
  );
}

function normalizeRoute(raw: unknown): NormalizedRoutePoint[] {
  if (!Array.isArray(raw)) return [];
  const points: NormalizedRoutePoint[] = [];

  for (const item of raw) {
    const row = asRow(item);
    if (!row) continue;
    const latitude = nullableNumber(row.latitude ?? row.lat);
    const longitude = nullableNumber(row.longitude ?? row.lng);
    if (latitude === null || longitude === null) continue;
    points.push({
      latitude,
      longitude,
      altitude: nullableNumber(row.altitude),
      timestamp: nullableNumber(row.timestamp),
      speed: nullableNumber(row.speed),
    });
  }

  return points;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  first: ActivityResultRoutePointDto,
  second: ActivityResultRoutePointDto,
): number {
  const earthRadius = 6_371_000;
  const latDelta = toRadians(second.latitude - first.latitude);
  const lngDelta = toRadians(second.longitude - first.longitude);
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

function routeMetricSeries(
  route: NormalizedRoutePoint[],
  averagePace: number | null,
  elevationProfile: unknown,
) {
  const distance: number[] = route.length > 0 ? [0] : [];
  const pace: number[] = [];
  let cumulativeKm = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const segmentMeters = distanceMeters(previous, current);
    cumulativeKm += segmentMeters / 1000;
    distance.push(cumulativeKm);

    let speed = current.speed;
    if ((!speed || speed <= 0) && previous.timestamp && current.timestamp) {
      const seconds = (current.timestamp - previous.timestamp) / 1000;
      if (seconds > 0) speed = segmentMeters / seconds;
    }
    if (speed && speed > 0) {
      const paceSeconds = 1000 / speed;
      if (paceSeconds >= 120 && paceSeconds <= 1200) pace.push(paceSeconds);
    }
  }

  const elevationFromProfile = Array.isArray(elevationProfile)
    ? elevationProfile
        .map((item) => {
          const row = asRow(item);
          return nullableNumber(row?.altitudeM ?? row?.altitude);
        })
        .filter((value): value is number => value !== null)
    : [];
  const elevationFromRoute = route
    .map((point) => point.altitude)
    .filter((value): value is number => value !== null);

  return {
    distance: downsample(distance, MAX_SERIES_POINTS),
    pace: downsample(
      pace.length > 0 ? pace : averagePace ? [averagePace] : [],
      MAX_SERIES_POINTS,
    ),
    elevation: downsample(
      elevationFromProfile.length > 0
        ? elevationFromProfile
        : elevationFromRoute,
      MAX_SERIES_POINTS,
    ),
    speed: [] as number[],
    time: [] as number[],
  };
}

function treadmillMetricSeries(
  treadmillData: DataRow | null,
  distanceKm: number,
  movingTime: number,
  averageSpeedKmh: number,
) {
  const rawSamples = Array.isArray(treadmillData?.speed_samples)
    ? treadmillData.speed_samples
    : [];
  const samples: SpeedSample[] = rawSamples
    .map((item) => {
      const row = asRow(item);
      return row
        ? { t: finiteNumber(row.t, -1), kmh: finiteNumber(row.kmh, -1) }
        : null;
    })
    .filter(
      (sample): sample is SpeedSample =>
        sample !== null && sample.t >= 0 && sample.kmh >= 0,
    )
    .sort((first, second) => first.t - second.t);

  let cumulativeKm = 0;
  const distances = samples.length > 0 ? [0] : [];
  for (let index = 1; index < samples.length; index += 1) {
    const seconds = Math.max(0, samples[index].t - samples[index - 1].t);
    cumulativeKm += (samples[index].kmh * seconds) / 3600;
    distances.push(cumulativeKm);
  }

  return {
    distance: downsample(
      distances.length > 0 ? distances : distanceKm ? [distanceKm] : [],
      MAX_SERIES_POINTS,
    ),
    pace: [] as number[],
    elevation: [] as number[],
    speed: downsample(
      samples.length > 0
        ? samples.map((sample) => sample.kmh)
        : averageSpeedKmh
          ? [averageSpeedKmh]
          : [],
      MAX_SERIES_POINTS,
    ),
    time: downsample(
      samples.length > 0
        ? samples.map((sample) => sample.t)
        : movingTime
          ? [movingTime]
          : [],
      MAX_SERIES_POINTS,
    ),
  };
}

function dateLabel(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const dayKey = (input: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(input);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayKey(date) === dayKey(today)) return 'hoje';
  if (dayKey(date) === dayKey(yesterday)) return 'ontem';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: '2-digit',
    month: 'short',
  }).format(date);
}

@Injectable()
export class RecentActivityResultsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getRecent(
    userId: string,
    scope: ActivityResultScope,
    requestedLimit = 5,
  ) {
    const limit = Math.min(5, Math.max(1, requestedLimit));
    const sourceValues = scope === 'plan' ? ['plan'] : ['manual', 'free'];
    const { data: workoutData, error: workoutError } =
      await this.supabaseService
        .from('workouts')
        .select(
          'id, activity_id, source, title, distance_km, target_pace_seconds, target_duration_seconds, created_at',
        )
        .eq('user_id', userId)
        .in('source', sourceValues)
        .not('activity_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(250);

    if (workoutError) throw workoutError;
    const workouts = (workoutData ?? []) as DataRow[];
    const activityIds = Array.from(
      new Set(
        workouts
          .map((workout) => String(workout.activity_id ?? ''))
          .filter(Boolean),
      ),
    );
    if (activityIds.length === 0) return [];

    const { data: activityData, error: activityError } =
      await this.supabaseService
        .from('activities')
        .select(
          'id, name, distance, moving_time, average_pace, elevation_gain, elevation_profile, start_date, gps_route, average_heartrate, environment, treadmill_data',
        )
        .eq('user_id', userId)
        .in('id', activityIds)
        .order('start_date', { ascending: false })
        .limit(limit);

    if (activityError) throw activityError;
    const activities = (activityData ?? []) as DataRow[];
    if (activities.length === 0) return [];
    const selectedIds = activities.map((activity) => String(activity.id));

    const [feedbackResult, routeResult, badgesResult] = await Promise.all([
      this.supabaseService
        .from('ai_feedbacks')
        .select(
          'id, activity_id, workout_id, hero_message, hero_tone, strengths, improvements, status, status_reason, created_at',
        )
        .eq('user_id', userId)
        .in('activity_id', selectedIds)
        .order('created_at', { ascending: false }),
      this.supabaseService
        .from('workout_routes')
        .select('workout_id, raw_data')
        .in(
          'workout_id',
          workouts.map((workout) => String(workout.id)),
        ),
      this.supabaseService
        .from('user_badges')
        .select('activity_id, badges(id, name, slug, icon)')
        .eq('user_id', userId)
        .in('activity_id', selectedIds),
    ]);

    if (feedbackResult.error) throw feedbackResult.error;
    if (routeResult.error) throw routeResult.error;
    if (badgesResult.error) throw badgesResult.error;

    const feedbackRows = (feedbackResult.data ?? []) as DataRow[];
    const routeRows = (routeResult.data ?? []) as DataRow[];
    const badgeRows = (badgesResult.data ?? []) as DataRow[];

    return activities.map((activity) => {
      const activityId = String(activity.id);
      const workout = workouts.find(
        (candidate) => String(candidate.activity_id) === activityId,
      );
      const workoutId = workout ? String(workout.id) : null;
      const activityFeedbackRows = feedbackRows.filter(
        (row) => String(row.activity_id) === activityId,
      );
      const completedFeedback = activityFeedbackRows.find(
        (row) => row.status === 'completed',
      );
      const latestFeedback = activityFeedbackRows[0];
      const feedbackStatus = completedFeedback
        ? 'completed'
        : String(latestFeedback?.status ?? 'none');

      const fallbackRoute = routeRows.find(
        (row) => String(row.workout_id) === workoutId,
      )?.raw_data;
      const route = normalizeRoute(activity.gps_route ?? fallbackRoute);
      const environment =
        activity.environment === 'treadmill' ? 'treadmill' : 'outdoor';
      const treadmillData = parseJsonObject(activity.treadmill_data);
      const distanceKm = finiteNumber(activity.distance) / 1000;
      const movingTime = finiteNumber(activity.moving_time);
      const averagePace = paceValueToSecondsPerKm(
        nullableNumber(activity.average_pace),
      );
      const averageSpeedKmh = finiteNumber(
        treadmillData?.avg_speed_kmh,
        movingTime > 0 ? (distanceKm / movingTime) * 3600 : 0,
      );
      const metricSeries =
        environment === 'treadmill'
          ? treadmillMetricSeries(
              treadmillData,
              distanceKm,
              movingTime,
              averageSpeedKmh,
            )
          : routeMetricSeries(route, averagePace, activity.elevation_profile);

      const badges = badgeRows
        .filter((row) => String(row.activity_id) === activityId)
        .flatMap((row) => {
          const raw = Array.isArray(row.badges) ? row.badges : [row.badges];
          return raw
            .map(asRow)
            .filter((badge): badge is DataRow => badge !== null)
            .map(
              (badge): ActivityResultBadgeDto => ({
                id: String(badge.id),
                name: String(badge.name ?? ''),
                slug: String(badge.slug ?? ''),
                icon: badge.icon ? String(badge.icon) : null,
              }),
            );
        });

      return {
        activity: {
          id: activityId,
          name: String(activity.name ?? 'Corrida'),
          distance: finiteNumber(activity.distance),
          distance_km: distanceKm.toFixed(2),
          moving_time: movingTime,
          average_pace: averagePace ?? 0,
          formatted_pace: formatPaceLabel(averagePace),
          average_speed_kmh: averageSpeedKmh,
          elevation_gain: finiteNumber(activity.elevation_gain),
          average_heartrate: nullableNumber(activity.average_heartrate),
          start_date: String(activity.start_date),
          date_label: dateLabel(activity.start_date),
          environment,
          treadmill_data: treadmillData,
          route_preview:
            environment === 'outdoor'
              ? downsample(route, MAX_ROUTE_POINTS).map(
                  ({ latitude, longitude }) => ({ latitude, longitude }),
                )
              : [],
          metric_series: metricSeries,
        },
        feedback: completedFeedback
          ? {
              id: String(completedFeedback.id),
              hero_message: String(completedFeedback.hero_message ?? ''),
              hero_tone: String(completedFeedback.hero_tone ?? ''),
              strengths: Array.isArray(completedFeedback.strengths)
                ? completedFeedback.strengths
                : [],
              improvements: Array.isArray(completedFeedback.improvements)
                ? completedFeedback.improvements
                : [],
            }
          : null,
        feedback_status: feedbackStatus,
        feedback_status_reason: latestFeedback?.status_reason ?? null,
        efficiency_percent: 0,
        vo2_max: null,
        workout_id: workoutId,
        workout_source: workout?.source ?? null,
        workout_title: workout?.title ?? null,
        target_pace_seconds: nullableNumber(workout?.target_pace_seconds),
        target_duration_seconds: nullableNumber(
          workout?.target_duration_seconds,
        ),
        achievements: { count: badges.length, badges },
        conquest: {
          goal_met:
            finiteNumber(workout?.distance_km) > 0 &&
            distanceKm >= finiteNumber(workout?.distance_km) * 0.9,
          planned_distance_km: finiteNumber(workout?.distance_km),
          executed_distance_km: distanceKm,
          xp_earned: 0,
          has_linked_workout: Boolean(workout),
        },
      };
    });
  }
}
