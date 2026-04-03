import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDuration } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S08 — Duration with clock icon */
export function S08_DurationClock({ data }: Props) {
  return (
    <StickerBase>
      <View style={styles.container}>
        <MaterialCommunityIcons name="timer-outline" size={28} color={colors.primary} />
        <Text style={styles.value}>{formatDuration(data.durationSeconds)}</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    gap: 4,
  },
  value: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
  },
});
