/**
 * Jack Daniels VDOT reference table.
 *
 * Each row is a VDOT integer anchor; values are training paces in DECIMAL
 * MINUTES PER KILOMETER (e.g. 7:22/km → 7 + 22/60 ≈ 7.367).
 *
 * - e_min / e_max: Easy / Z1 pace range
 * - m: Marathon / Z2
 * - t: Threshold / Z3
 * - i: Interval / Z4 (VO2max)
 * - r: Repetition / Z5
 *
 * Values are taken from the Daniels Running Formula tables. For VDOT values
 * between anchors, PaceCalculatorService interpolates linearly.
 */

export interface VDOTRow {
  e_min: number;
  e_max: number;
  m: number;
  t: number;
  i: number;
  r: number;
}

export const VDOT_REFERENCE_TABLE: Record<number, VDOTRow> = {
  30: { e_min: 9.183, e_max: 10.3, m: 8.217, t: 7.7, i: 7.0, r: 6.4 },
  35: { e_min: 7.367, e_max: 8.133, m: 6.617, t: 6.217, i: 5.733, r: 5.317 },
  40: { e_min: 6.55, e_max: 7.233, m: 5.9, t: 5.517, i: 5.083, r: 4.7 },
  45: { e_min: 5.9, e_max: 6.517, m: 5.317, t: 4.967, i: 4.55, r: 4.183 },
  50: { e_min: 5.367, e_max: 5.917, m: 4.817, t: 4.5, i: 4.117, r: 3.767 },
  55: { e_min: 4.917, e_max: 5.4, m: 4.4, t: 4.1, i: 3.733, r: 3.417 },
  60: { e_min: 4.517, e_max: 4.967, m: 4.017, t: 3.75, i: 3.4, r: 3.133 },
  65: { e_min: 4.183, e_max: 4.583, m: 3.7, t: 3.467, i: 3.133, r: 2.883 },
  70: { e_min: 3.883, e_max: 4.233, m: 3.417, t: 3.217, i: 2.9, r: 2.65 },
};
