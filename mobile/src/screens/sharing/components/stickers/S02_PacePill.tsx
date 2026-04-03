import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatPace } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S02 — Pace in a pill/capsule shape */
export function S02_PacePill({ data }: Props) {
  return (
    <StickerBase>
      <View style={styles.pill}>
        <MaterialCommunityIcons name="speedometer" size={18} color={colors.primary} />
        <Text style={styles.value}>{formatPace(data.paceSecondsPerKm)}</Text>
        <Text style={styles.unit}>/km</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  value: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
  },
  unit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
  },
});
