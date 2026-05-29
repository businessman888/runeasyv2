import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { mapViz, colors, fonts } from '../../theme';
import type { StatMapMetric } from '../../utils/runMetrics';

export type StatMapMode = StatMapMetric | 'default';

interface ChipDef {
  mode: StatMapMode;
  label: string;
  icon: string; // emoji — leve e sem dependência de fonte de ícone
}

const CHIPS: ChipDef[] = [
  { mode: 'default', label: 'Padrão', icon: '•' },
  { mode: 'pace', label: 'Pace', icon: '🏃' },
  { mode: 'elevation', label: 'Elevação', icon: '⛰️' },
];

interface StatMapSelectorProps {
  mode: StatMapMode;
  onChange: (mode: StatMapMode) => void;
  /** Esconde o chip de Elevação quando a corrida não tem dados de altitude. */
  hasElevation?: boolean;
}

/**
 * Seletor de coloração da rota (Stat Maps), estilo Strava: Padrão / Pace /
 * Elevação. Mostra a legenda de cores da métrica ativa. "Padrão" mantém a
 * polyline cyan original (estado inicial — não altera o que já existia).
 */
export function StatMapSelector({ mode, onChange, hasElevation = true }: StatMapSelectorProps) {
  const chips = CHIPS.filter((c) => c.mode !== 'elevation' || hasElevation);

  return (
    <View style={styles.container}>
      <View style={styles.chipsRow}>
        {chips.map((chip) => {
          const active = chip.mode === mode;
          return (
            <Pressable
              key={chip.mode}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(chip.mode)}
              accessibilityRole="button"
              accessibilityLabel={`Colorir rota por ${chip.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.chipIcon}>{chip.icon}</Text>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode !== 'default' && <Legend mode={mode} />}
    </View>
  );
}

function Legend({ mode }: { mode: StatMapMetric }) {
  const stops =
    mode === 'pace'
      ? [mapViz.pace.fast, mapViz.pace.midFast, mapViz.pace.mid, mapViz.pace.midSlow, mapViz.pace.slow, mapViz.pace.verySlow]
      : [mapViz.elevation.low, mapViz.elevation.mid, mapViz.elevation.high, mapViz.elevation.peak];
  const startLabel = mode === 'pace' ? 'Rápido' : 'Baixo';
  const endLabel = mode === 'pace' ? 'Lento' : 'Alto';

  return (
    <View style={styles.legend}>
      <Text style={styles.legendLabel}>{startLabel}</Text>
      <View style={styles.legendBar}>
        {stops.map((color, i) => (
          <View key={i} style={[styles.legendStop, { backgroundColor: color }]} />
        ))}
      </View>
      <Text style={styles.legendLabel}>{endLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 212, 255, 0.10)',
  },
  chipIcon: {
    fontSize: 13,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  chipTextActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  legendBar: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  legendStop: {
    flex: 1,
    height: '100%',
  },
});
