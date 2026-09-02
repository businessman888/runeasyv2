import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

import { darkColors } from './semanticColors';
import { lightColors } from './lightColors';
import { nebulaColors } from './nebulaColors';
import { createElevation } from './elevation';
import type { AppTheme, ResolvedThemeName } from './contracts';

export const darkTheme = {
  name: 'dark',
  isDark: true,
  colors: darkColors,
  elevation: createElevation(darkColors, true),
  mapLightPreset: 'night',
} as const satisfies AppTheme;

export const lightTheme = {
  name: 'light',
  isDark: false,
  colors: lightColors,
  elevation: createElevation(lightColors, false),
  mapLightPreset: 'day',
} as const satisfies AppTheme;

/**
 * Alternative dark appearance built on the app's original navy palette.
 *
 * `isDark: true` is what makes the whole mode work for free: every appearance
 * branch in the app keys off this boolean, never off the theme name — status
 * bar, blur tint, glass sheen, elevation ramp, the Aurora card glow and the map
 * overlay palette all resolve correctly with no per-theme code.
 *
 * The one thing `isDark` could NOT express is the basemap, since two dark
 * themes want different ones — hence `mapLightPreset` on the contract.
 */
export const nebulaTheme = {
  name: 'nebula',
  isDark: true,
  colors: nebulaColors,
  elevation: createElevation(nebulaColors, true),
  mapLightPreset: 'dusk',
} as const satisfies AppTheme;

export const themeRegistry: Record<ResolvedThemeName, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
  nebula: nebulaTheme,
};

export function createNavigationTheme(theme: AppTheme): NavigationTheme {
  const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;

  return {
    ...baseTheme,
    dark: theme.isDark,
    colors: {
      ...baseTheme.colors,
      primary: theme.colors.accent,
      background: theme.colors.canvas,
      card: theme.colors.surface1,
      text: theme.colors.textPrimary,
      border: theme.colors.borderSubtle,
      notification: theme.colors.accent,
    },
  };
}
