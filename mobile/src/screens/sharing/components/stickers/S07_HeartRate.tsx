import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatHeartRate } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S07 — Heart rate with pulse icon */
export function S07_HeartRate({ data }: Props) {
  return (
    <StickerBase>
      <MaterialCommunityIcons name="heart-pulse" size={36} color={colors.error} />
      <Text style={styles.value}>{formatHeartRate(data.averageHeartrate)}</Text>
      <Text style={styles.label}>FC média</Text>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  value: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
    marginTop: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
});
