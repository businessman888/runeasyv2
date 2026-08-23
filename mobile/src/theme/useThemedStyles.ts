import { useMemo } from 'react';

import type { ThemeColors } from './contracts';
import { useAppTheme } from './ThemeProvider';

/** Memoizes theme-aware styles and recreates them only when the palette changes. */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { theme } = useAppTheme();

  return useMemo(() => factory(theme.colors), [factory, theme.colors]);
}
