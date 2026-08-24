import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { gradientForCard } from './storyTheme';
import type { RetrospectiveData } from './types';

/**
 * Card compilado de compartilhamento — os destaques do ciclo num layout único,
 * pronto para screenshot.
 *
 * Renderizado FORA da tela (posicionado longe do viewport) e capturado sob
 * demanda por `captureRef`. As dimensões são FIXAS (não dependem da tela) para
 * a imagem sair igual em qualquer aparelho — mesmo motivo pelo qual o
 * `CardBase` do módulo de sharing existente usa 320×568.
 *
 * Só números reais da retrospectiva. Nada estimado, nada comparado com outros
 * corredores.
 */

export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640;

interface Props {
  data: RetrospectiveData;
}

export const ShareSummaryCard = forwardRef<View, Props>(
  function ShareSummaryCard({ data }, ref) {
    useThemeSubscription();
    // Reusa o tom do clímax — é o card mais vibrante da sequência, e o
    // compilado é a peça que representa o ciclo inteiro.
    const gradient = gradientForCard(5);

    return (
      <View ref={ref} collapsable={false} style={styles.wrapper}>
        <LinearGradient
          colors={gradient.colors}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <View style={styles.header}>
            <MaterialCommunityIcons name="run-fast" size={22} color={colors.primary} />
            <Text style={styles.brand}>RunEasy</Text>
          </View>

          <Text style={styles.title}>Meu ciclo{'\n'}de treino</Text>
          {data.planGoalLabel ? (
            <Text style={styles.subtitle}>
              {data.planGoalLabel}
              {data.planDurationWeeks ? ` · ${data.planDurationWeeks} semanas` : ''}
            </Text>
          ) : null}

          <View style={styles.stats}>
            <Stat
              value={fmt(data.totalDistanceKm)}
              unit="km"
              label="distância total"
              accent={gradient.accent}
            />
            {data.longestRunKm > 0 ? (
              <Stat
                value={fmt(data.longestRunKm)}
                unit="km"
                label="maior corrida"
                accent={gradient.accent}
              />
            ) : null}
            <Stat
              value={String(data.totalWorkoutsCompleted)}
              label="treinos concluídos"
              accent={gradient.accent}
            />
          </View>

          <Text style={styles.footer}>runeasy.com.br</Text>
        </LinearGradient>
      </View>
    );
  },
);

function Stat({
  value,
  unit,
  label,
  accent,
}: {
  value: string;
  unit?: string;
  label: string;
  accent: string;
}) {
  useThemeSubscription();
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, { color: accent }]} allowFontScaling={false}>
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function fmt(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

const styles = createThemeStyles(() => ({
  wrapper: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
  },
  card: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 40,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brand: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textLight,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 40,
    lineHeight: 46,
    color: colors.textLight,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: 'rgba(235,235,245,0.62)',
    marginTop: -16,
  },
  stats: {
    gap: 24,
  },
  stat: {
    gap: 2,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  statValue: {
    fontFamily: fonts.extrabold,
    fontSize: 52,
    lineHeight: 56,
  },
  statUnit: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: 'rgba(235,235,245,0.7)',
    paddingBottom: 8,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(235,235,245,0.6)',
  },
  footer: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(235,235,245,0.4)',
  },
}));
