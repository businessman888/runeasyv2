import { formatPaceLabel, paceValueToSecondsPerKm } from './pace.ts';

type UnknownRecord = Record<string, unknown>;

export interface ExecutedActivityMetrics {
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
}

export interface WatchActivityPresentation {
  id: string;
  source: 'free' | 'manual';
  title: string;
  status: 'pending' | 'completed';
  distanceKm: number;
  durationSeconds: number | null;
  pace: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function actualDistanceKm(workout: UnknownRecord): number {
  return positiveNumber(workout.distance_run)
    ?? positiveNumber(workout.distance_km)
    ?? 0;
}

function actualDurationSeconds(workout: UnknownRecord): number | null {
  return positiveNumber(workout.time_run_seconds)
    ?? positiveNumber(workout.duration_seconds);
}

function actualPaceSecondsPerKm(
  workout: UnknownRecord,
  distanceKm: number,
  durationSeconds: number | null,
): number | null {
  const explicit = positiveNumber(workout.pace_seconds_per_km)
    ?? positiveNumber(workout.avg_pace_seconds_per_km);
  const normalized = paceValueToSecondsPerKm(explicit);
  if (normalized != null) return normalized;
  if (durationSeconds == null || distanceKm <= 0) return null;
  return Math.round(durationSeconds / distanceKm);
}

/**
 * Resolve exclusivamente métricas EXECUTADAS. Nunca usa pace/duração-alvo: se
 * um registro legado estiver incompleto, o card deve mostrar ausência em vez de
 * fabricar 6:00/km ou estimar o tempo como se ainda fosse uma prescrição.
 */
export function resolveExecutedActivityMetrics(
  value: unknown,
): ExecutedActivityMetrics | null {
  if (!isRecord(value)) return null;
  const distanceKm = actualDistanceKm(value);
  const durationSeconds = actualDurationSeconds(value);
  const paceSecondsPerKm = actualPaceSecondsPerKm(
    value,
    distanceKm,
    durationSeconds,
  );

  if (distanceKm <= 0 || durationSeconds == null || paceSecondsPerKm == null) {
    return null;
  }

  return { distanceKm, durationSeconds, paceSecondsPerKm };
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function sourceRank(source: WatchActivityPresentation['source']): number {
  return source === 'manual' ? 0 : 1;
}

function activityTitle(
  workout: UnknownRecord,
  source: WatchActivityPresentation['source'],
): string {
  const rawTitle = trimmedString(workout.title);
  const isInternalFreeRunLabel = rawTitle?.toLowerCase() === 'free_run';
  if (source === 'free' && (!rawTitle || isInternalFreeRunLabel)) {
    return 'Corrida Livre';
  }
  return rawTitle ?? 'Treino Manual';
}

/**
 * Monta a aba Atividades do Watch a partir da shape canônica de `workouts`.
 * Mantém aliases antigos apenas para drenar registros legados.
 */
export function buildTodayActivities(
  workouts: readonly unknown[],
  now: Date = new Date(),
): WatchActivityPresentation[] {
  const today = localDateKey(now);

  return workouts
    .filter(isRecord)
    .filter((workout) => {
      const source = workout.source;
      const isManual = source === 'manual';
      const isCompletedFree = source === 'free' && workout.status === 'completed';
      return workout.scheduled_date === today && (isManual || isCompletedFree);
    })
    .map((workout) => {
      const source: WatchActivityPresentation['source'] =
        workout.source === 'manual' ? 'manual' : 'free';
      const status: WatchActivityPresentation['status'] =
        workout.status === 'completed' ? 'completed' : 'pending';
      const isCompleted = status === 'completed';
      const distanceKm = isCompleted
        ? actualDistanceKm(workout)
        : positiveNumber(workout.distance_km) ?? 0;
      const durationSeconds = isCompleted
        ? actualDurationSeconds(workout)
        : positiveNumber(workout.target_duration_seconds);
      const paceSeconds = isCompleted
        ? actualPaceSecondsPerKm(workout, distanceKm, durationSeconds)
        : paceValueToSecondsPerKm(positiveNumber(workout.target_pace_seconds));

      return {
        id: String(workout.id),
        source,
        title: activityTitle(workout, source),
        status,
        distanceKm,
        durationSeconds,
        pace: paceSeconds == null ? '' : formatPaceLabel(paceSeconds),
      };
    })
    .sort((left, right) => sourceRank(left.source) - sourceRank(right.source));
}
