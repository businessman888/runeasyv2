import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S03 — Streak fire with count */
export function S03_StreakFlame({ data }: Props) {
  return (
    <StickerBase>
      <MaterialCommunityIcons name="fire" size={48} color={colors.accent} />
      <Text style={styles.value}>{data.gamification?.currentStreak ?? 0}</Text>
      <Text style={styles.label}>dias</Text>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  value: {
    color: colors.accent,
    fontSize: 36,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 40,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
  },
});
