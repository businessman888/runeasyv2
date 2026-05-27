/**
 * Helpers for rendering treadmill telemetry charts.
 *
 * The raw `speed_samples` array is one entry per second of the workout, so a
 * 30-minute run produces ~1800 points. Feeding that directly into
 * `react-native-gifted-charts` (LineChart) makes it allocate an SVG path
 * whose pixel-width is roughly `pointCount × spacing`. With the default
 * ~60px spacing, the resulting bitmap easily exceeds Android's draw budget
 * and the SvgView throws:
 *
 *   java.lang.RuntimeException:
 *     Canvas: trying to draw too large (510046560 bytes) bitmap.
 *
 * which kills the activity (observed on Android 14 with treadmill plan
 * workouts longer than ~10 min).
 *
 * Two-pronged fix:
 *
 *  1. `downsampleSpeedSamples` — picks at most `maxPoints` evenly-spaced
 *     samples, always keeping the first and last so the curve still starts
 *     and ends at the right values. Visually identical at chart scale
 *     because the chart is only ~340 px wide anyway.
 *
 *  2. `computeSpeedChartSpacing` — sizes `spacing` so the full curve fits
 *     exactly inside the available chart width. Without this the LineChart
 *     extrapolates to its default spacing and still tries to draw past the
 *     viewport, which keeps the bitmap large even after downsampling.
 */

export interface SpeedSample {
  t: number;
  kmh: number;
  incline?: number;
}

/**
 * Reduce `samples` to at most `maxPoints` entries (default 120), keeping
 * the first and last entries to preserve the curve's endpoints. Returns a
 * new array; the input is not mutated. Safe to call with empty / null-ish
 * arrays.
 */
export function downsampleSpeedSamples(
  samples: SpeedSample[] | null | undefined,
  maxPoints = 120,
): SpeedSample[] {
  if (!samples || samples.length === 0) return [];
  if (samples.length <= maxPoints) return samples;

  const step = (samples.length - 1) / (maxPoints - 1);
  const out: SpeedSample[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    out.push(samples[idx]);
  }
  // Ensure the very last sample is included even after rounding.
  const lastSrc = samples[samples.length - 1];
  if (out[out.length - 1] !== lastSrc) out.push(lastSrc);
  return out;
}

/**
 * Compute the per-point spacing so a `pointCount`-point line fills exactly
 * `availableWidth` px (after accounting for the leading/trailing padding).
 * Clamped to a sane minimum so very long workouts don't end up with
 * sub-pixel spacing that the chart library can't render.
 */
export function computeSpeedChartSpacing(
  pointCount: number,
  availableWidth: number,
  initialSpacing: number,
  endSpacing: number,
): number {
  if (pointCount <= 1) return 0;
  const usable = availableWidth - initialSpacing - endSpacing;
  const spacing = usable / (pointCount - 1);
  // Never go below 1px — anything smaller breaks the SVG path renderer.
  return Math.max(1, spacing);
}
