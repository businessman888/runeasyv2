import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, borderRadius, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatElevation } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S06 — Elevation gain tag */
export function S06_ElevationTag({ data }: Props) {
  return (
    <StickerBase>
      <View style={styles.tag}>
        <MaterialCommunityIcons name="trending-up" size={22} color={colors.success} />
        <Text style={styles.value}>{formatElevation(data.elevationGain)}</Text>
        <Text style={styles.label}>elevação</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignItems: 'center',
    gap: 2,
  },
  value: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
});
