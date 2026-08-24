import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { mapViz, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

export type GpsQuality = 'excellent' | 'good' | 'weak' | 'poor' | 'acquiring';

/**
 * Mapeia a precisão crua do GPS (em metros) para um nível de qualidade.
 * accuracy < 0 → ainda adquirindo sinal (GPS não reportou nada).
 */
export function getGpsQuality(accuracy: number): GpsQuality {
  if (accuracy < 0) return 'acquiring';
  if (accuracy <= 5) return 'excellent'; // < 5m
  if (accuracy <= 15) return 'good'; // 5–15m
  if (accuracy <= 30) return 'weak'; // 15–30m
  return 'poor'; // > 30m
}

const FILLED_BARS: Record<GpsQuality, number> = {
  excellent: 4,
  good: 3,
  weak: 2,
  poor: 1,
  acquiring: 0,
};



const QUALITY_LABEL: Record<GpsQuality, string> = {
  excellent: 'excelente',
  good: 'bom',
  weak: 'fraco',
  poor: 'ruim',
  acquiring: 'buscando',
};

interface GpsSignalBarsProps {
  /** Precisão crua do GPS em metros (-1 quando desconhecida). */
  accuracy: number;
  style?: ViewStyle;
}

/**
 * Indicador de qualidade do sinal GPS — 4 barrinhas tipo sinal de celular,
 * inspirado no Runna. Coloração via tokens `mapViz.gps`. Não-interativo.
 */
export const GpsSignalBars = memo(({ accuracy, style }: GpsSignalBarsProps) => {
  useThemeSubscription();
  const quality = useMemo(() => getGpsQuality(accuracy), [accuracy]);
  const filled = FILLED_BARS[quality];
  const color = ({
  excellent: mapViz.gps.excellent,
  good: mapViz.gps.good,
  weak: mapViz.gps.weak,
  poor: mapViz.gps.poor,
  acquiring: mapViz.gps.inactive,
})[quality];

  return (
    <View
      style={[styles.container, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sinal GPS: ${QUALITY_LABEL[quality]}`}
    >
      <Text style={[styles.label, { color }]}>GPS</Text>
      <View style={styles.barsRow}>
        {[1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            style={[
              styles.bar,
              { height: bar * 3 + 5 },
              { backgroundColor: bar <= filled ? color : mapViz.gps.inactive },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

GpsSignalBars.displayName = 'GpsSignalBars';

const styles = createThemeStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: semanticColors.surface1,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
}));
