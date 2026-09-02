/**
 * Aurora — the app's single tinted-surface material.
 *
 * One place defines how brand color touches a surface, so the Level card and
 * the rest-day cards read as the same system instead of hand-rolled gradients.
 * Derived from theme tokens, so both appearances follow automatically.
 *
 * Shape: the card is a SOLID surface with a single glow entering from the
 * top-right corner and dying out well before the middle. The tint identifies
 * the card's state; the solid color is what the card actually looks like.
 *
 * Why the glow is strong but small: brand cyan (`#00D4FF`) has almost equal
 * green and blue, so spreading it thin over a near-black surface lands on a
 * muted slate-teal that reads green. Concentrating the same hue at high alpha
 * in a small corner is what makes it read as actual cyan.
 *
 * The tail stop uses a zero-alpha version of its OWN hue: `'transparent'` on
 * Android interpolates through transparent black and leaves a grey haze.
 */
import type { ThemeColors } from './contracts';
import { toTransparent, withAlpha } from './withAlpha';

/** Which semantic color tints the surface. `accent` = brand cyan, `recovery` = purple. */
export type AuroraTone = 'accent' | 'recovery';

export interface AuroraCardGradient {
    /** Flat surface color under everything — the card's dominant color. */
    surface: string;
    /** Corner glow, top-right → inward. */
    glow: readonly [string, string, string];
    glowLocations: readonly [number, number, number];
    /** Hairline edge, faintly carrying the hue. */
    border: string;
}

function toneColor(colors: ThemeColors, tone: AuroraTone): string {
    return tone === 'recovery' ? colors.recovery : colors.accent;
}

/**
 * Tinted card material.
 *
 * Light mode runs much lower alphas: the same tint over white reads far
 * stronger than over near-black, and the light `accent` token is already a
 * darkened teal chosen for text contrast.
 */
export function createAuroraCardGradient(
    colors: ThemeColors,
    tone: AuroraTone,
    isDark: boolean,
): AuroraCardGradient {
    const hue = toneColor(colors, tone);

    return {
        surface: colors.surface1,
        glow: isDark
            ? [withAlpha(hue, 0.5), withAlpha(hue, 0.14), toTransparent(hue)]
            : [withAlpha(hue, 0.22), withAlpha(hue, 0.06), toTransparent(hue)],
        // Tight ramp: fully gone by the time it reaches the middle of the card,
        // so the solid surface stays dominant.
        glowLocations: [0, 0.2, 0.5],
        border: withAlpha(hue, isDark ? 0.16 : 0.14),
    };
}

/** Diagonal for the corner glow — top-right, falling toward the lower-left. */
export const AURORA_GLOW_START = { x: 1, y: 0 } as const;
export const AURORA_GLOW_END = { x: 0.1, y: 0.9 } as const;
