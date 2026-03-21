// Design System Colors - Dark Theme (Figma design)
export const colors = {
    // Backgrounds - Dark Navy
    background: '#0A0A18',  // dark navy background
    backgroundLight: '#0E0E1F',  // slightly lighter
    white: '#FFFFFF',
    card: '#1A1A2E',  // dark card
    cardDark: '#0E0E1F',  // darker card variant
    highlight: '#1E1E32',  // dark highlight

    // Primary & Accent
    primary: '#00D4FF',  // neon-cyan - electric blue
    primaryLight: '#3B82F6',  // electric-blue
    primaryDark: '#0099CC',
    accent: '#F59E0B',  // orange/amber for streak

    // Status Colors
    success: '#10B981',  // neon-success
    error: '#EF4444',
    warning: '#FFC400',  // neon-alert
    info: '#3B82F6',

    // Text - Light for dark theme
    text: '#FFFFFF',  // white text
    textLight: '#EBEBF5',  // light text
    textSecondary: '#A0A0B2',  // muted light
    textMuted: '#6B6B7B',  // darker muted

    // UI Elements  
    border: '#2A2A3E',  // dark border
    borderLight: '#1E1E32',  // lighter dark border

    // Streak Card (Figma)
    streakCard: '#15152A',
    streakDayCard: '#1C1C2E',
    recovery: '#9747FF',
    missed: '#FF453A',
    completed: '#32CD32',

    // Glassmorphism overlay
    glassWhite: 'rgba(255, 255, 255, 0.1)',
    glassLight: 'rgba(255, 255, 255, 0.05)',
    glassDark: 'rgba(0, 0, 0, 0.3)',
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
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 6,
    },
    neonStrong: {
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 8,
    },
};

export default {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
};
