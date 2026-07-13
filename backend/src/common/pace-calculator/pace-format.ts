/**
 * Formatação/normalização de pace com UNIDADE ÚNICA de armazenamento: segundos/km
 * inteiros (ex.: 300 = 5:00/km). Exibição sempre em "m:ss".
 *
 * Tolerância ao formato legado: planos antigos gravaram pace em DECIMAL min/km
 * (ex.: 9.11 = 9:07/km). A heurística separa os dois sem ambiguidade real:
 *   • pace em min/km decimal está sempre em ~2.0–15.0 (< 20)
 *   • pace em segundos/km está sempre em ~120–900 (>> 20)
 * Logo: valor < 20 → decimal min/km legado (×60); valor ≥ 20 → já em segundos/km.
 *
 * Isto mantém os planos Easy antigos exibindo certo até a regeneração, sem crash.
 */

const LEGACY_DECIMAL_THRESHOLD = 20;

/** Normaliza um valor de pace (segundos/km novo OU decimal min/km legado) → segundos/km. */
export function paceValueToSecondsPerKm(v?: number | null): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v >= LEGACY_DECIMAL_THRESHOLD ? Math.round(v) : Math.round(v * 60);
}

/** Formata um valor de pace como "m:ss" (ex.: 300 → "5:00"). "—" se inválido. */
export function formatPaceLabel(v?: number | null): string {
  const s = paceValueToSecondsPerKm(v);
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Formata uma faixa de pace como "m:ss–m:ss" (ex.: "5:08–5:27"). Colapsa para um
 * único valor quando min == max ou quando só um dos lados existe.
 */
export function formatPaceRangeLabel(
  min?: number | null,
  max?: number | null,
): string {
  const a = formatPaceLabel(min);
  const b = formatPaceLabel(max);
  if (a === '—') return b;
  if (b === '—' || a === b) return a;
  return `${a}–${b}`;
}
