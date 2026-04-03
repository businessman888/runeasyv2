import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration, formatElevation } from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T02 — Pace highlight card
 * Layout: large pace center, secondary metrics grid (distance, duration, elevation)
 */
export function T02_PaceHighlight({ data }: Props) {
  return (
    <CardBase>
      <View style={styles.content}>
        <Text style={styles.label}>MEU PACE</Text>

        <View style={styles.center}>
          <Text style={styles.paceValue}>{formatPace(data.paceSecondsPerKm)}</Text>
          <Text style={styles.paceUnit}>min/km</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <MaterialCommunityIcons name="map-marker-distance" size={16} color={colors.primary} />
            <Text style={styles.gridValue}>{formatDistance(data.distanceKm)} km</Text>
          </View>
          <View style={styles.gridItem}>
            <MaterialCommunityIcons name="timer-outline" size={16} color={colors.primary} />
            <Text style={styles.gridValue}>{formatDuration(data.durationSeconds)}</Text>
          </View>
          <View style={styles.gridItem}>
            <MaterialCommunityIcons name="trending-up" size={16} color={colors.primary} />
            <Text style={styles.gridValue}>{formatElevation(data.elevationGain)}</Text>
          </View>
        </View>

        <View style={styles.branding}>
          <MaterialCommunityIcons name="run" size={16} color={colors.primary} />
          <Text style={styles.brandText}>RunEasy</Text>
        </View>
      </View>
    </CardBase>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 2,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  paceValue: {
    color: colors.primary,
    fontSize: 64,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 72,
  },
  paceUnit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
    marginTop: -2,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  gridItem: {
    alignItems: 'center',
    gap: 4,
  },
  gridValue: {
    color: colors.textLight,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
