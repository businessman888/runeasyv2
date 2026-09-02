import type { ThemeColors, ThemeElevation } from './contracts';

/**
 * Per-appearance depth scales.
 *
 * Light: short offset, tight radius, low opacity — a light UI reads elevation
 * almost entirely from the shadow, since the card is already the brightest
 * plane and cannot get lighter.
 *
 * Dark: wider and much more opaque, because a black shadow over `#050506` is
 * nearly invisible. Dark keeps carrying most of its depth through surface
 * luminance (`canvas → surface1 → surface2`) and `borderSubtle` hairlines; the
 * shadow only softens the edge.
 *
 * `shadowColor` is always `colors.shadow` (#000000 in both themes). The old
 * `shadowColor: colors.canvas` idiom glowed the near-black canvas in dark and
 * silently produced an invisible near-white shadow in light.
 */
export function createElevation(colors: ThemeColors, isDark: boolean): ThemeElevation {
    if (isDark) {
        return {
            sm: {
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.28,
                shadowRadius: 6,
                elevation: 2,
            },
            md: {
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.34,
                shadowRadius: 14,
                elevation: 5,
            },
            lg: {
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.42,
                shadowRadius: 28,
                elevation: 10,
            },
        };
    }

    return {
        sm: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 3,
            elevation: 2,
        },
        md: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 5,
        },
        lg: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.14,
            shadowRadius: 24,
            elevation: 10,
        },
    };
}
