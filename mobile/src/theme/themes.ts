import { DarkTheme, type Theme as NavigationTheme } from '@react-navigation/native';

import { darkColors } from './semanticColors';
import type { AppTheme, ResolvedThemeName } from './contracts';

export const darkTheme = {
  name: 'dark',
  isDark: true,
  colors: darkColors,
} as const satisfies AppTheme;

// Light is deliberately absent until its palette and contrast matrix are approved.
export const themeRegistry: Partial<Record<ResolvedThemeName, AppTheme>> = {
  dark: darkTheme,
};

export function createNavigationTheme(theme: AppTheme): NavigationTheme {
  return {
    ...DarkTheme,
    dark: theme.isDark,
    colors: {
      ...DarkTheme.colors,
      primary: theme.colors.accent,
      background: theme.colors.canvas,
      card: theme.colors.surface1,
      text: theme.colors.textPrimary,
      border: theme.colors.borderSubtle,
      notification: theme.colors.accent,
    },
  };
}
