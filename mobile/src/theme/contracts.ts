import type { ColorSchemeName } from 'react-native';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedThemeName = Exclude<ColorSchemeName, null | undefined>;

export interface ThemeColors {
  readonly canvas: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly glass: string;
  readonly fillSubtle: string;
  readonly fillMuted: string;
  readonly fillStrong: string;
  readonly borderSubtle: string;
  readonly borderStrong: string;
  readonly textPrimary: string;
  readonly textOnMedia: string;
  readonly textOnMediaMuted: string;
  readonly textOnAccentMuted: string;
  readonly onboardingIconInk: string;
  readonly onboardingIconInkAlt: string;
  readonly textSecondary: string;
  readonly recovery: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  readonly textTertiary: string;
  readonly accent: string;
  readonly textOnAccent: string;
  readonly accentSubtle: string;
  readonly successSubtle: string;
  readonly warningSubtle: string;
  readonly dangerSubtle: string;
  readonly overlaySoft: string;
  readonly overlayFaint: string;
  readonly overlayMedium: string;
  readonly overlayStrong: string;
  readonly scrim: string;
  readonly shadow: string;
  readonly transparent: string;
}

/**
 * One elevation step, shaped so it can be spread straight into a style object.
 * `elevation` is the Android counterpart of the iOS shadow triple.
 */
export interface ThemeElevationLevel {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
}

/**
 * Depth scale. Light and dark need genuinely different shadows — a light UI
 * separates layers with a short, fairly opaque shadow, while on a near-black
 * canvas a shadow barely reads and depth comes mostly from surface luminance
 * plus hairline borders. Keeping both in the theme is what stops components
 * from hardcoding a dark-only idiom.
 */
export interface ThemeElevation {
  readonly sm: ThemeElevationLevel;
  readonly md: ThemeElevationLevel;
  readonly lg: ThemeElevationLevel;
}

export interface AppTheme {
  readonly name: ResolvedThemeName;
  readonly isDark: boolean;
  readonly colors: ThemeColors;
  readonly elevation: ThemeElevation;
}
