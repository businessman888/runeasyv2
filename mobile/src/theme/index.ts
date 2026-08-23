import { semanticColors } from './semanticColors';

export * from './contracts';
export * from './lightColors';
export * from './mapTheme';
export * from './semanticColors';
export * from './themes';
export * from './ThemeProvider';
export * from './useThemedStyles';

// Design System Colors - Dark Theme (Figma design)
export const colors = {
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

// Shadows with neon glow effects
export const shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
    },
    neon: {
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 5,
    },
    neonStrong: {
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.24,
        shadowRadius: 16,
        elevation: 7,
    },
};

// Map visualization palette — premium map/tracking overlays (Stat Maps, GPS
// signal, elevation). Reuses the existing design-system tokens so the map stays
// visually coherent with the rest of the app; the few gradient stops that don't
// exist as semantic tokens are declared here once (single source of truth) and
// never hardcoded in screens. Mirrors the approach of theme/zoneColors.ts.
export const mapViz = {
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
        inactive: 'rgba(235, 235, 245, 0.15)', // empty bar
    },

    // OSM overlay (trilhas/paths + parques), realçado para corredores.
    osm: {
        trail: colors.primary, // dashed cyan paths/tracks
        parkFill: 'rgba(16, 185, 129, 0.12)', // success @ 12%
        parkOutline: 'rgba(16, 185, 129, 0.40)', // success @ 40%
    },
};

export default {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    fonts,
    mapViz,
};
