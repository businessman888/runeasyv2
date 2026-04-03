import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S04 — Level badge with star */
export function S04_LevelBadge({ data }: Props) {
  const gam = data.gamification;
  return (
    <StickerBase>
      <View style={styles.badge}>
        <Ionicons name="star" size={28} color={colors.warning} />
        <Text style={styles.level}>Nível {gam?.currentLevel ?? 1}</Text>
        <Text style={styles.xp}>{gam?.totalPoints ?? 0} XP</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.1)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.xl,
    gap: 2,
  },
  level: {
    color: colors.warning,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  xp: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
  },
});
