/**
 * Heart-rate / workout-type → training zone helpers.
 *
 * Two strategies (in order of preference):
 *  1. Real HR available → classify by %MaxHR (Karvonen-lite)
 *  2. No HR → infer zone from workout type
 */

export type TrainingZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

/**
 * Classic %MaxHR thresholds:
 *  Z1 (Easy)         <80%
 *  Z2 (Marathon)     80-85%
 *  Z3 (Threshold)    86-90%
 *  Z4 (Interval)     91-95%
 *  Z5 (Repetition)   >95%
 */
export function getZoneFromHR(hr: number, maxHR: number): TrainingZone {
  if (!hr || !maxHR || maxHR <= 0) return 'Z2';
  const pct = hr / maxHR;
  if (pct < 0.8) return 'Z1';
  if (pct < 0.86) return 'Z2';
  if (pct < 0.91) return 'Z3';
  if (pct < 0.96) return 'Z4';
  return 'Z5';
}

/**
 * Fallback when no HR data is available. Maps the most common workout
 * type labels used across the codebase to their dominant zone.
 *
 * Unknown / free runs default to Z2 (general aerobic).
 */
export const ZONE_BY_TYPE: Record<string, TrainingZone> = {
  recovery: 'Z1',
  easy_run: 'Z1',
  rodagem: 'Z1',
  free_run: 'Z2',
  long_run: 'Z2',
  longao: 'Z2',
  fartlek: 'Z3',
  tempo: 'Z3',
  tempo_run: 'Z3',
  threshold: 'Z3',
  intervals: 'Z4',
  intervalado: 'Z4',
  repeticao: 'Z5',
  repetition: 'Z5',
  progressivo: 'Z2',
};

export function inferZoneFromType(
  type: string | null | undefined,
): TrainingZone {
  if (!type) return 'Z2';
  return ZONE_BY_TYPE[type.toLowerCase()] || 'Z2';
}

/**
 * Calculate max HR from age. Uses the classic 220-age formula.
 * Returns a safe default (190 bpm) if birth_date is missing or invalid.
 */
export function maxHRFromAge(age: number | null | undefined): number {
  if (!age || age <= 0 || age > 120) return 190;
  return 220 - age;
}

export function ageFromBirthDate(
  birthDate: { day?: number; month?: number; year?: number } | null | undefined,
): number | null {
  if (!birthDate?.year) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.year;
  const month = (birthDate.month ?? 1) - 1;
  const day = birthDate.day ?? 1;
  const hadBirthday =
    now.getUTCMonth() > month ||
    (now.getUTCMonth() === month && now.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;
  return age > 0 && age < 120 ? age : null;
}
