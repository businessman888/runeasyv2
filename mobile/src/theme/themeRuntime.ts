import {
  StyleSheet,
  type ImageStyle,
  type StatusBarStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { AppTheme } from './contracts';

type ReactNativeStyle = ViewStyle | TextStyle | ImageStyle;
type NamedStyles<T> = { [P in keyof T]: ReactNativeStyle };

let activeTheme: AppTheme | null = null;
let runtimeVersion = 0;

/** Keeps compatibility adapters aligned with the resolved React theme. */
export function setRuntimeTheme(theme: AppTheme): void {
  if (activeTheme === theme) return;

  activeTheme = theme;
  runtimeVersion += 1;
}

export function getRuntimeTheme(): AppTheme | null {
  return activeTheme;
}

export function getRuntimeThemeVersion(): number {
  return runtimeVersion;
}

export function getThemeBlurTint(): 'dark' | 'light' {
  return activeTheme?.isDark === false ? 'light' : 'dark';
}

export function getThemeStatusBarStyle(): StatusBarStyle {
  return activeTheme?.isDark === false ? 'dark-content' : 'light-content';
}

export function getThemeExpoStatusBarStyle(): 'dark' | 'light' {
  return activeTheme?.isDark === false ? 'dark' : 'light';
}

/** Returns a balanced glass highlight/shade ramp for the active appearance. */
export function getThemeGlassSheenColors(): readonly [string, string, string] {
  return activeTheme?.isDark === false
    ? ['rgba(255,255,255,0.64)', 'rgba(255,255,255,0)', 'rgba(17,19,24,0.04)']
    : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.12)'];
}

/** Creates a read-only object whose properties follow the active theme. */
export function createThemeObject<T extends object>(
  fallback: T,
  select: (theme: AppTheme) => T,
): T {
  return new Proxy(fallback, {
    get(target, property, receiver) {
      const source = activeTheme ? select(activeTheme) : target;
      return Reflect.get(source, property, receiver);
    },
    has(target, property) {
      const source = activeTheme ? select(activeTheme) : target;
      return Reflect.has(source, property);
    },
    ownKeys(target) {
      const source = activeTheme ? select(activeTheme) : target;
      return Reflect.ownKeys(source);
    },
    getOwnPropertyDescriptor(target, property) {
      const source = activeTheme ? select(activeTheme) : target;
      const descriptor = Reflect.getOwnPropertyDescriptor(source, property);

      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set() {
      return false;
    },
  });
}

/**
 * Compatibility bridge for module-level StyleSheet declarations. The proxy
 * preserves `styles.foo` and rebuilds the native sheet after a theme change.
 */
export function createThemeStyles<T extends NamedStyles<T>>(factory: () => T): T {
  let cachedVersion = -1;
  let cachedStyles: T | null = null;

  const resolveStyles = (): T => {
    const currentVersion = getRuntimeThemeVersion();

    if (!cachedStyles || cachedVersion !== currentVersion) {
      cachedStyles = StyleSheet.create(factory());
      cachedVersion = currentVersion;
    }

    return cachedStyles;
  };

  return new Proxy({} as T, {
    get(_target, property, receiver) {
      return Reflect.get(resolveStyles(), property, receiver);
    },
    has(_target, property) {
      return Reflect.has(resolveStyles(), property);
    },
    ownKeys() {
      return Reflect.ownKeys(resolveStyles());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolveStyles(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set() {
      return false;
    },
  });
}
