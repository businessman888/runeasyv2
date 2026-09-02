import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

import { darkColors } from './semanticColors';
import { lightColors } from './lightColors';
import { createElevation } from './elevation';
import type { AppTheme, ResolvedThemeName } from './contracts';

export const darkTheme = {
  name: 'dark',
  isDark: true,
  colors: darkColors,
  elevation: createElevation(darkColors, true),
} as const satisfies AppTheme;

export const lightTheme = {
  name: 'light',
  isDark: false,
  colors: lightColors,
  elevation: createElevation(lightColors, false),
} as const satisfies AppTheme;

export const themeRegistry: Record<ResolvedThemeName, AppTheme> = {
  dark: darkTheme,
  light: lightTheme,
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
