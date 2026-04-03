import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { workoutTypeLabel } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S09 — Workout type label chip */
export function S09_WorkoutType({ data }: Props) {
  return (
    <StickerBase>
      <View style={styles.chip}>
        <MaterialCommunityIcons name="run" size={22} color={colors.primary} />
        <Text style={styles.text}>{workoutTypeLabel(data.workoutType)}</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    gap: 8,
  },
  text: {
    color: colors.primary,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
});
