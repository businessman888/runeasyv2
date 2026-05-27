/**
 * Local cache for treadmill telemetry, keyed by workoutId.
 *
 * The backend stores `activities.treadmill_data` (JSONB), but we cannot
 * rely on the round-trip alone — the response payload depends on the
 * server build that's actually deployed, on network conditions, and on
 * the request hitting the right `activity_id` join. Any of those can
 * silently drop the field and the RunSummary "Velocidade na esteira"
 * card disappears when the user reopens the run.
 *
 * This cache makes the data survival local-first:
 * - `saveTreadmillCache` is called immediately after `completeWorkout`
 *   succeeds (or even when it only saved locally), so the dataset is on
 *   disk before the user leaves the Running screen.
 * - `loadTreadmillCache` is read by `RunSummary` / `CoachAnalysis`
 *   hydration *before* the network round-trip resolves, so the chart
 *   appears in the first paint when re-opening from Home/Calendar/
 *   History.
 *
 * Keying by workoutId ensures we never mix workouts, and the MMKV
 * instance is namespaced (`treadmill-data-cache`) so nothing else can
 * collide with it.
 */

import { createMMKV } from 'react-native-mmkv';

export interface TreadmillCachedData {
  is_smart: boolean;
  device_name?: string;
  avg_speed_kmh?: number;
  max_speed_kmh?: number;
  avg_incline?: number;
  total_calories?: number;
  speed_samples?: { t: number; kmh: number; incline?: number }[];
}

const storage = createMMKV({ id: 'treadmill-data-cache' });

/**
 * Persist the treadmill payload for a given workout. Safe to call with
 * partial data — missing fields are simply absent on read. No-op when
 * either argument is falsy.
 */
export function saveTreadmillCache(
  workoutId: string | undefined | null,
  data: TreadmillCachedData | null | undefined,
): void {
  if (!workoutId || !data) return;
  try {
    storage.set(workoutId, JSON.stringify(data));
  } catch (e) {
    if (__DEV__) console.warn('[treadmillCache] save error', e);
  }
}

/**
 * Read the cached treadmill payload for a workout. Returns null when
 * nothing is cached or the stored JSON is corrupt — callers should
 * treat null as "not in cache" and fall back to the network hydration.
 */
export function loadTreadmillCache(
  workoutId: string | undefined | null,
): TreadmillCachedData | null {
  if (!workoutId) return null;
  try {
    const raw = storage.getString(workoutId);
    if (!raw) return null;
    return JSON.parse(raw) as TreadmillCachedData;
  } catch (e) {
    if (__DEV__) console.warn('[treadmillCache] load error', e);
    return null;
  }
}

/**
 * Convenience: remove a single cached entry. Not currently used but
 * exposed in case we need to invalidate after server-side edits.
 */
export function clearTreadmillCache(workoutId: string): void {
  try {
    storage.remove(workoutId);
  } catch {
    // ignore
  }
}
