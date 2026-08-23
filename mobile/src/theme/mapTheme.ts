import { lightColors } from './lightColors';
import { darkColors } from './semanticColors';
import { useAppTheme } from './ThemeProvider';

export interface MapThemePalette {
  readonly route: string;
  readonly routeGlow: string;
  readonly trail: string;
  readonly parkFill: string;
  readonly parkOutline: string;
}

const darkMapPalette: MapThemePalette = {
  route: darkColors.accent,
  routeGlow: darkColors.accent,
  trail: darkColors.accent,
  parkFill: 'rgba(16,185,129,0.12)',
  parkOutline: 'rgba(16,185,129,0.40)',
};

const lightMapPalette: MapThemePalette = {
  route: lightColors.accent,
  routeGlow: lightColors.accent,
  trail: lightColors.accent,
  parkFill: 'rgba(8,122,85,0.10)',
  parkOutline: 'rgba(8,122,85,0.38)',
};

/** Domain palette for map overlays; location indicators are intentionally excluded. */
export function useMapThemePalette(): MapThemePalette {
  const { theme } = useAppTheme();

  return theme.isDark ? darkMapPalette : lightMapPalette;
}
