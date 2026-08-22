import type { ColorSchemeName } from 'react-native';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedThemeName = Exclude<ColorSchemeName, null | undefined>;

export interface ThemeColors {
  readonly canvas: string;
  readonly surface1: string;
  readonly surface2: string;
  readonly surface3: string;
  readonly glass: string;
  readonly borderSubtle: string;
  readonly borderStrong: string;
  readonly textPrimary: string;
  readonly textOnAccentMuted: string;
  readonly onboardingIconInk: string;
  readonly onboardingIconInkAlt: string;
  readonly textSecondary: string;
  readonly recovery: string;
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
  readonly transparent: string;
}

export interface AppTheme {
  readonly name: ResolvedThemeName;
  readonly isDark: boolean;
  readonly colors: ThemeColors;
}
