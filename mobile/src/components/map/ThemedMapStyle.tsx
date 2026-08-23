import React, { memo } from 'react';
import Mapbox from '@rnmapbox/maps';

import { useAppTheme } from '../../theme/ThemeProvider';

/** Standard is the safe fallback because it supports runtime light presets. */
export const mapboxStyleURL =
  process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? 'mapbox://styles/mapbox/standard';

const basemapImportId =
  process.env.EXPO_PUBLIC_MAPBOX_BASEMAP_IMPORT_ID ?? 'basemap';

/**
 * Applies the active app theme to a Mapbox Standard basemap without replacing
 * the MapView or its route/location layers.
 */
export const ThemedMapStyle = memo(function ThemedMapStyle() {
  const { theme } = useAppTheme();

  return (
    <Mapbox.StyleImport
      id={basemapImportId}
      existing
      config={{ lightPreset: theme.isDark ? 'night' : 'day' }}
    />
  );
});
