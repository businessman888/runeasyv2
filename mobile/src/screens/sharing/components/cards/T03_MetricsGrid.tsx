import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import {
  formatDistance, formatPace, formatDuration,
  formatElevation, formatHeartRate, workoutTypeLabel,
} from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T03 — Full metrics grid (2×3 grid of stat tiles)
 */
export function T03_MetricsGrid({ data }: Props) {
  const metrics = [
    { label: 'Distância', value: `${formatDistance(data.distanceKm)} km`, icon: 'map-marker-distance' as const },
    { label: 'Pace', value: `${formatPace(data.paceSecondsPerKm)} /km`, icon: 'speedometer' as const },
    { label: 'Tempo', value: formatDuration(data.durationSeconds), icon: 'timer-outline' as const },
    { label: 'Elevação', value: formatElevation(data.elevationGain), icon: 'trending-up' as const },
    { label: 'FC Média', value: formatHeartRate(data.averageHeartrate), icon: 'heart-pulse' as const },
    { label: 'Cadência', value: data.cadenceSpm ? `${data.cadenceSpm}spm` : '-spm', icon: 'shoe-sneaker' as const },
  ];

  return (
    <CardBase>
      <View style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="run" size={18} color={colors.primary} />
          <Text style={styles.headerText}>{workoutTypeLabel(data.workoutType)}</Text>
        </View>

        <View style={styles.grid}>
          {metrics.map((m, i) => (
            <View key={i} style={styles.tile}>
              <MaterialCommunityIcons name={m.icon} size={16} color={colors.primary} />
              <Text style={styles.tileValue}>{m.value}</Text>
              <Text style={styles.tileLabel}>{m.label}</Text>
            </View>
          ))}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  tile: {
    width: '47%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: 4,
  },
  tileValue: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  tileLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
