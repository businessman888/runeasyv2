import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
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

  if (!hasHydrated) {
    return null;
  }

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
