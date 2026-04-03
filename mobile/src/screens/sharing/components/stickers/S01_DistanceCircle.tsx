import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance } from '../../utils/formatters';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S01 — Distance in a circular badge */
export function S01_DistanceCircle({ data }: Props) {
  return (
    <StickerBase>
      <View style={styles.circle}>
        <Text style={styles.value}>{formatDistance(data.distanceKm)}</Text>
        <Text style={styles.unit}>km</Text>
      </View>
    </StickerBase>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: colors.white,
    fontSize: 32,
    fontWeight: typography.fontWeights.extrabold,
  },
  unit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    marginTop: -4,
  },
});
