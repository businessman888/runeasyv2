/**
 * Formatação/normalização de pace. Espelha o util do backend
 * (common/pace-calculator/pace-format.ts) — mantenha os dois em sincronia.
 *
 * Unidade de armazenamento: SEGUNDOS/KM inteiros (ex.: 300 = 5:00/km).
 * Unidade de exibição: sempre "m:ss".
 *
 * Tolerância ao formato legado: planos antigos gravaram pace em DECIMAL min/km
 * (ex.: 9.11 = 9:07/km). Heurística sem ambiguidade real:
 *   • min/km decimal está sempre em ~2.0–15.0 (< 20)
 *   • segundos/km está sempre em ~120–900 (>> 20)
 * Logo: valor < 20 → decimal min/km legado (×60); valor ≥ 20 → já em segundos/km.
 */

const LEGACY_DECIMAL_THRESHOLD = 20;

/** Normaliza um valor de pace (segundos/km novo OU decimal min/km legado) → segundos/km. */
export function paceValueToSecondsPerKm(v?: number | null): number | null {
  if (v == null || !isFinite(v) || v <= 0) return null;
  return v >= LEGACY_DECIMAL_THRESHOLD ? Math.round(v) : Math.round(v * 60);
}

/** Formata um valor de pace como "m:ss" (ex.: 300 → "5:00"). "--:--" se inválido. */
export function formatPaceLabel(v?: number | null): string {
  const s = paceValueToSecondsPerKm(v);
  if (s == null) return '--:--';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Formata uma faixa de pace como "m:ss–m:ss" (ex.: "5:08–5:27"). Colapsa para um
 * único valor quando min == max ou quando só um dos lados existe. Undefined se
 * nenhum lado for válido.
 */
export function formatPaceRangeLabel(
  min?: number | null,
  max?: number | null,
): string | undefined {
  const a = paceValueToSecondsPerKm(min);
  const b = paceValueToSecondsPerKm(max);
  if (a == null && b == null) return undefined;
  if (a == null) return formatPaceLabel(b);
  if (b == null || a === b) return formatPaceLabel(a);
  return `${formatPaceLabel(a)}–${formatPaceLabel(b)}`;
}
