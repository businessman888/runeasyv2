/**
 * Splits em barras horizontais (Figma componentSplits 1604:1934), estilo Strava.
 * Uma barra por km JÁ COMPLETADO — pace acima, altura ∝ pace (mais lento = mais
 * alta). Barra atual (mais recente) em ciano. NÃO exibe slots de km futuros
 * (exigiria distância-alvo, que não existe em corrida livre → manter só o que
 * aconteceu é consistente em todos os tipos de treino).
 *
 * A entrada de um split novo é animada (Reanimated) sem "pulo" de layout.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { LiveSplit } from '../../utils/livePace';

const T = {
  textPrimary: '#EBEBF5',
  textCompleted: 'rgba(235, 235, 245, 0.60)',
  cyan: '#00D4FF',
};

const BAR_MIN_H = 8;
const BAR_MAX_H = 30;
const BAR_WIDTH = 40;

function paceLabel(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  splits: LiveSplit[];
}

export const SplitsBars = memo(({ splits }: Props) => {
  if (!splits || splits.length === 0) return null;

  // Normaliza a altura pela faixa de pace da própria corrida (mais lento = mais alto).
  const paces = splits.map((s) => s.paceSecPerKm).filter((p) => isFinite(p) && p > 0);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const range = max - min;
  const heightFor = (pace: number): number => {
    if (range <= 0) return (BAR_MIN_H + BAR_MAX_H) / 2;
    const t = (pace - min) / range; // 0 (mais rápido) → 1 (mais lento)
    return BAR_MIN_H + t * (BAR_MAX_H - BAR_MIN_H);
  };

  const lastIdx = splits.length - 1;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Splits</Text>
      <View style={styles.barsRow}>
        {splits.map((s, i) => {
          const isCurrent = i === lastIdx;
          const color = isCurrent ? T.cyan : T.textCompleted;
          return (
            <Animated.View key={s.km} entering={FadeIn.duration(300)} style={styles.barCol}>
              <Text style={[styles.pace, { color }]} allowFontScaling={false}>
                {paceLabel(s.paceSecPerKm)}
              </Text>
              <View
                style={[
                  styles.bar,
                  { height: heightFor(s.paceSecPerKm), backgroundColor: color },
                ]}
              />
              <Text style={styles.km} allowFontScaling={false}>
                {s.km}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
});

SplitsBars.displayName = 'SplitsBars';

const styles = StyleSheet.create({
  container: {
    marginTop: 28,
    alignItems: 'center',
  },
  title: {
    color: T.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  barCol: {
    width: BAR_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pace: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 4,
  },
  km: {
    color: 'rgba(235, 235, 245, 0.40)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
});
