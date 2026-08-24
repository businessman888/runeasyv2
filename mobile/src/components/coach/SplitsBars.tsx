/**
 * Splits em barras horizontais (Figma componentSplits 1604:1934), estilo Strava.
 * Uma barra por km JÁ COMPLETADO — pace acima, altura ∝ pace (mais lento = mais
 * alta). Barra atual (mais recente) em ciano. NÃO exibe slots de km futuros.
 *
 * Corrida longa (ex.: 42 km): as barras vivem numa ScrollView HORIZONTAL — quando
 * não cabem, rolam lateralmente (não quebram em várias linhas nem estouram). O
 * auto-scroll mantém o km mais recente visível. Quando cabem, ficam centradas.
 *
 * A entrada de um split novo é animada (Reanimated) sem "pulo" de layout.
 */

import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { LiveSplit } from '../../utils/livePace';
import { semanticColors, createThemeStyles, useThemeSubscription } from '../../theme';


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
  useThemeSubscription();
  const scrollRef = useRef<ScrollView>(null);

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
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.barsRow}
        // Mantém o km mais recente visível quando a lista cresce além da largura.
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {splits.map((s, i) => {
          const isCurrent = i === lastIdx;
          const color = isCurrent ? semanticColors.accent : semanticColors.textSecondary;
          return (
            <Animated.View key={s.km} entering={FadeIn.duration(300)} style={styles.barCol}>
              <Text style={[styles.pace, { color }]} allowFontScaling={false}>
                {paceLabel(s.paceSecPerKm)}
              </Text>
              <View
                style={[styles.bar, { height: heightFor(s.paceSecPerKm), backgroundColor: color }]}
              />
              <Text style={styles.km} allowFontScaling={false}>
                {s.km}
              </Text>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
});

SplitsBars.displayName = 'SplitsBars';

const styles = createThemeStyles(() => ({
  container: {
    marginTop: 28,
    alignSelf: 'stretch', // ocupa a largura para a ScrollView poder rolar
  },
  title: {
    color: semanticColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
  },
  barsRow: {
    flexGrow: 1, // centra quando cabem; permite rolar quando não cabem
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
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
    color: semanticColors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
}));
