import { semanticColors, darkColors } from './semanticColors';
import type { ThemeColors, ThemeElevation } from './contracts';
import { createThemeObject } from './themeRuntime';
import { createElevation } from './elevation';

export * from './contracts';
export * from './lightColors';
export * from './nebulaColors';
export * from './mapTheme';
export * from './semanticColors';
export * from './themes';
export * from './ThemeProvider';
export * from './useThemedStyles';
export * from './themeRuntime';
export * from './elevation';
export * from './withAlpha';
export * from './gradients';

/**
 * Depth scale that follows the active appearance.
 *
 * Spread it into a style — `...elevation.md` — instead of hand-writing shadow
 * properties. Mirrors the `semanticColors` proxy so module-scope
 * `createThemeStyles` sheets pick up a theme change too.
 */
export const elevation = createThemeObject<ThemeElevation>(
    createElevation(darkColors, true),
    (theme) => theme.elevation,
);

// Design System Colors - Dark Theme (Figma design)
const darkLegacyColors = {
    // Backgrounds - Dark Navy
    background: semanticColors.canvas,
    backgroundLight: semanticColors.surface1,
    white: '#FFFFFF',
    card: semanticColors.surface2,
    cardDark: semanticColors.surface1,
    highlight: semanticColors.surface3,

    // Primary & Accent
    primary: semanticColors.accent,  // neon-cyan - electric blue
    primaryLight: '#3B82F6',  // electric-blue
    primaryDark: '#0099CC',
    accent: '#F59E0B',  // orange/amber for streak

    // Status Colors
    success: semanticColors.success,  // neon-success
    error: semanticColors.danger,
    warning: semanticColors.warning,  // neon-alert
    info: semanticColors.info,

    // Text - Light for dark theme
    text: semanticColors.textPrimary,
    textLight: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
    textMuted: semanticColors.textTertiary,

    // UI Elements  
    border: semanticColors.borderSubtle,
    borderLight: semanticColors.borderSubtle,

    // Streak Card (Figma)
    streakCard: semanticColors.surface1,
    streakDayCard: semanticColors.surface2,
    recovery: '#9747FF',
    missed: '#FF453A',
    completed: '#32CD32',

    // Glassmorphism overlay
    glassWhite: semanticColors.borderStrong,
    glassLight: semanticColors.glass,
    glassDark: 'rgba(0, 0, 0, 0.42)',

    // Upgrade Pro card (Figma node 1235:1300) — glass over bg image
    proGlassOverlay: 'rgba(13, 13, 15, 0.72)',
    proGlassOverlayStrong: 'rgba(5, 5, 6, 0.88)',
    proGlassBorder: semanticColors.borderStrong,
    proGlassBorderCyan: semanticColors.borderSubtle,
    proCardGlassFill: 'rgba(20, 20, 22, 0.72)',
    proCtaFill: semanticColors.surface3,
    proDivider: semanticColors.borderSubtle,
    proMutedText: semanticColors.textSecondary,

    // Floating tab bar — translucent navy veil over the frosted BlurView, so the
    // scroll content behind the pill blurs through while labels/icons stay legible
    // (matches the streakCard #15152A identity at ~55% opacity).
    tabBarGlassFill: 'rgba(13, 13, 15, 0.78)',
    tabBarIdleBorder: semanticColors.borderStrong,
};
export type LegacyThemeColors = typeof darkLegacyColors;

function createLegacyColors(themeColors: ThemeColors): LegacyThemeColors {
    return {
        ...darkLegacyColors,
        background: themeColors.canvas,
        backgroundLight: themeColors.surface1,
        card: themeColors.surface2,
        cardDark: themeColors.surface1,
        highlight: themeColors.surface3,
        primary: themeColors.accent,
        primaryLight: themeColors.info,
        primaryDark: themeColors.accent,
        accent: themeColors.warning,
        success: themeColors.success,
        error: themeColors.danger,
        warning: themeColors.warning,
        info: themeColors.info,
        text: themeColors.textPrimary,
        textLight: themeColors.textPrimary,
        textSecondary: themeColors.textSecondary,
        textMuted: themeColors.textTertiary,
        border: themeColors.borderSubtle,
        borderLight: themeColors.borderSubtle,
        streakCard: themeColors.surface1,
        streakDayCard: themeColors.surface2,
        recovery: themeColors.recovery,
        missed: themeColors.danger,
        completed: themeColors.success,
        glassWhite: themeColors.borderStrong,
        glassLight: themeColors.glass,
        glassDark: themeColors.overlayMedium,
        proGlassOverlay: themeColors.overlayMedium,
        proGlassOverlayStrong: themeColors.overlayStrong,
        proGlassBorder: themeColors.borderStrong,
        proGlassBorderCyan: themeColors.borderSubtle,
        proCardGlassFill: themeColors.glass,
        proCtaFill: themeColors.surface3,
        proDivider: themeColors.borderSubtle,
        proMutedText: themeColors.textSecondary,
        tabBarGlassFill: themeColors.glass,
        tabBarIdleBorder: themeColors.borderStrong,
    };
}

/** @deprecated Prefer semantic colors from useAppTheme() in new code. */
export const colors = createThemeObject(
    darkLegacyColors,
    (theme) => createLegacyColors(theme.colors),
);

// Plus Jakarta Sans — loaded at runtime in App.tsx via @expo-google-fonts.
// Reference these instead of relying on fontWeight alone (custom fonts on RN
// need an explicit fontFamily per weight).
export const fonts = {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extrabold: 'PlusJakartaSans_800ExtraBold',
};

// Typography based on Plus Jakarta Sans
export const typography = {
    fontSizes: {
        xs: 10,
        sm: 12,
        md: 14,
        base: 14,
        lg: 16,
        xl: 18,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
    },
    fontWeights: {
        normal: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
        extrabold: '800' as const,
    },
    lineHeights: {
        none: 1,
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
    },
};

// Spacing scale
export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
};

// Border radius
export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 24,
    '3xl': 32,
    full: 9999,
};

/**
 * @deprecated Use the theme-aware `elevation` scale instead (`...elevation.md`).
 *
 * These are now thin aliases over `elevation` so existing call sites keep
 * working while they migrate. The old `neon` names described a dark-only idiom
 * (glow the near-black canvas) that produced an invisible near-white shadow in
 * light mode.
 */
export const shadows = {
    get sm() { return elevation.sm; },
    get md() { return elevation.md; },
    get lg() { return elevation.lg; },
    get neon() { return elevation.md; },
    get neonStrong() { return elevation.lg; },
};

// Map visualization palette — premium map/tracking overlays (Stat Maps, GPS
// signal, elevation). Reuses the existing design-system tokens so the map stays
// visually coherent with the rest of the app; the few gradient stops that don't
// exist as semantic tokens are declared here once (single source of truth) and
// never hardcoded in screens. Mirrors the approach of theme/zoneColors.ts.
function createMapViz() {
  return {
    // Route line — brand cyan with a glow halo behind it.
    routeColor: colors.primary,
    routeGlow: colors.primary,

    // Pace gradient (fast → slow). Vivid, high-saturation stops chosen to pop on
    // the dark basemap (the old deep-navy "fast" end vanished). Numeric
    // thresholds live in utils/runMetrics.
    pace: {
        fast: '#2979FF', // < 4:30 — vivid blue
        midFast: '#00D4FF', // 4:30–5:30 — cyan
        mid: '#00E676', // 5:30–6:00 — vivid green
        midSlow: '#FFD600', // 6:00–7:00 — vivid yellow
        slow: '#FF9100', // 7:00–8:00 — vivid orange
        verySlow: '#FF1744', // > 8:00 — vivid red
    },

    // Elevation gradient (low → high), normalized per-run min↔max. Vivid ramp.
    elevation: {
        low: '#00E676', // vivid green — lowest
        mid: '#FFD600', // vivid yellow
        high: '#FF9100', // vivid orange
        peak: '#B14BFF', // vivid purple — highest
    },

    // GPS signal quality buckets.
    gps: {
        excellent: colors.success,
        good: colors.success,
        weak: colors.warning,
        poor: colors.error,
        inactive: semanticColors.borderStrong,
    },

    // OSM overlay (trilhas/paths + parques), realçado para corredores.
    osm: {
        trail: colors.primary, // dashed cyan paths/tracks
        parkFill: 'rgba(16, 185, 129, 0.12)', // success @ 12%
        parkOutline: 'rgba(16, 185, 129, 0.40)', // success @ 40%
    },
  };
}

const darkMapViz = createMapViz();
export const mapViz = createThemeObject(
    darkMapViz,
    () => createMapViz(),
);

export default {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    fonts,
    mapViz,
};
