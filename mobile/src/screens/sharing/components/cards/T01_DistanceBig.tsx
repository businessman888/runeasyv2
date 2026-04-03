import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration, workoutTypeLabel } from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T01 — Big distance hero card
 * Layout: workout type chip top-left, large distance center, pace + duration row, RunEasy branding
 */
export function T01_DistanceBig({ data }: Props) {
  return (
    <CardBase>
      <View style={styles.content}>
        {/* Top: workout type chip */}
        <View style={styles.chip}>
          <MaterialCommunityIcons name="run" size={14} color={colors.primary} />
          <Text style={styles.chipText}>{workoutTypeLabel(data.workoutType)}</Text>
        </View>

        {/* Center: large distance */}
        <View style={styles.center}>
          <Text style={styles.distanceValue}>{formatDistance(data.distanceKm)}</Text>
          <Text style={styles.distanceUnit}>km</Text>
        </View>

        {/* Bottom metrics row */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Pace</Text>
            <Text style={styles.metricValue}>{formatPace(data.paceSecondsPerKm)}</Text>
            <Text style={styles.metricSuffix}>/km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Tempo</Text>
            <Text style={styles.metricValue}>{formatDuration(data.durationSeconds)}</Text>
          </View>
        </View>

        {/* Branding */}
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    gap: 4,
  },
  chipText: {
    color: colors.primary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  distanceValue: {
    color: colors.white,
    fontSize: 72,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 80,
  },
  distanceUnit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.medium,
    marginTop: -4,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  metricSuffix: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
