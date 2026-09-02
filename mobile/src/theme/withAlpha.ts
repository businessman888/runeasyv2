/**
 * Alpha helper for token-derived gradients.
 *
 * A tinted gradient needs several stops of the SAME hue at different alphas
 * (e.g. accent @ 16% → 5% → 0%). Declaring six extra tokens per hue would bloat
 * the palette, so the ramps are derived here instead. This lives in `theme/`
 * on purpose: components keep consuming named tokens and never spell out a
 * color literal themselves.
 */

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function clampAlpha(alpha: number): number {
    if (Number.isNaN(alpha)) return 0;
    return Math.min(1, Math.max(0, alpha));
}

/**
 * Re-alphas any color the palette can hold (`#RGB`, `#RGBA`, `#RRGGBB`,
 * `#RRGGBBAA`, `rgb()`, `rgba()`) and returns an `rgba()` string.
 *
 * The source color's own alpha is IGNORED — the caller is stating the target
 * opacity explicitly, which is what makes the gradient ramps predictable even
 * when a token is already translucent (e.g. `accentSubtle`).
 */
export function withAlpha(color: string, alpha: number): string {
    const a = clampAlpha(alpha);

    if (color === 'transparent') return 'rgba(0,0,0,0)';

    const short = HEX_SHORT.exec(color);
    if (short) {
        const r = parseInt(short[1] + short[1], 16);
        const g = parseInt(short[2] + short[2], 16);
        const b = parseInt(short[3] + short[3], 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    const long = HEX_LONG.exec(color);
    if (long) {
        const r = parseInt(long[1], 16);
        const g = parseInt(long[2], 16);
        const b = parseInt(long[3], 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    const fn = RGB_FN.exec(color);
    if (fn) {
        const r = Math.round(Number(fn[1]));
        const g = Math.round(Number(fn[2]));
        const b = Math.round(Number(fn[3]));
        return `rgba(${r},${g},${b},${a})`;
    }

    // Unknown format (named color, gradient string). Returning it untouched is
    // safer than emitting a broken rgba() that React Native would drop.
    return color;
}

/** Fully transparent version of a color — used as the tail stop of a ramp. */
export function toTransparent(color: string): string {
    return withAlpha(color, 0);
}
