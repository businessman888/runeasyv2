import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import type { Theme as NavigationTheme } from '@react-navigation/native';

import { useThemeStore } from '../stores/themeStore';
import type { AppTheme, ResolvedThemeName, ThemePreference } from './contracts';
import { setRuntimeTheme } from './themeRuntime';
import { createNavigationTheme, darkTheme, themeRegistry } from './themes';

interface AppThemeContextValue {
  theme: AppTheme;
  navigationTheme: NavigationTheme;
  preference: ThemePreference;
  requestedThemeName: ResolvedThemeName;
  isRequestedThemeAvailable: boolean;
  setPreference: (preference: ThemePreference) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function resolveRequestedThemeName(
  preference: ThemePreference,
  systemScheme: ReturnType<typeof useColorScheme>,
): ResolvedThemeName {
  if (preference === 'system') {
    return systemScheme ?? 'dark';
  }

  return preference;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const preference = useThemeStore((state) => state.preference);
  const hasHydrated = useThemeStore((state) => state.hasHydrated);
  const setPreference = useThemeStore((state) => state.setPreference);

  const value = useMemo<AppThemeContextValue>(() => {
    const requestedThemeName = resolveRequestedThemeName(preference, systemScheme);
    const theme = themeRegistry[requestedThemeName] ?? darkTheme;

    setRuntimeTheme(theme);

    return {
      theme,
      navigationTheme: createNavigationTheme(theme),
      preference,
      requestedThemeName,
      isRequestedThemeAvailable: themeRegistry[requestedThemeName] != null,
      setPreference,
    };
  }, [preference, setPreference, systemScheme]);

  // The OS only knows two appearances, so tell it the resolved theme's polarity
  // rather than the preference name — `setColorScheme` accepts 'light' | 'dark'
  // | null, and an app-only appearance like `nebula` is not a value it can take.
  useEffect(() => {
    Appearance.setColorScheme(
      preference === 'system' ? null : value.theme.isDark ? 'dark' : 'light',
    );
  }, [preference, value.theme.isDark]);

  if (!hasHydrated) {
    return null;
  }

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

interface ThemeScopeProps {
  theme: AppTheme;
  children: ReactNode;
}

/**
 * Pins a subtree to one specific theme, whatever the user has selected.
 *
 * Used by the floating tab bar, which keeps the dark palette across every
 * appearance so the app's primary navigation reads as one fixed surface.
 * Because it re-provides the context, everything inside follows — including
 * `AppIcon`, which resolves its color from the theme context and has no color
 * prop to override.
 *
 * Note what it does NOT override: `preference` and `setPreference` pass through
 * untouched. A scoped visual override must not lie about what the user picked.
 *
 * Caveat: module-scope token proxies (`semanticColors`, `createThemeStyles`,
 * the `elevation` and `colors` adapters) read the global runtime, not this
 * context — a subtree that must honor the scope has to consume the theme
 * through `useAppTheme` / `useThemedStyles`.
 */
export function ThemeScope({ theme, children }: ThemeScopeProps) {
  const parent = useAppTheme();

  const value = useMemo<AppThemeContextValue>(
    () => ({
      ...parent,
      theme,
      navigationTheme: createNavigationTheme(theme),
    }),
    [parent, theme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }

  return context;
}

/** Subscribes compatibility consumers that still read legacy theme tokens. */
export function useThemeSubscription(): void {
  useAppTheme();
}
