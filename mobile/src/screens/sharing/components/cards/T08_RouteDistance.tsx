import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration, formatElevation } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T08 — Route + big distance overlay
 * Layout: route background, large distance overlay center, metrics grid bottom
 */
export function T08_RouteDistance({ data }: Props) {
  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route with distance overlay */}
        <View style={styles.routeArea}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={160} strokeColor="rgba(255,255,255,0.4)" />
          ) : (
            <RouteNoData width={260} height={160} />
          )}
          <View style={styles.overlay}>
            <Text style={styles.distanceValue}>{formatDistance(data.distanceKm)}</Text>
            <Text style={styles.distanceUnit}>km</Text>
          </View>
        </View>

        {/* Metrics grid */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Pace</Text>
            <Text style={styles.gridValue}>{formatPace(data.paceSecondsPerKm)} /km</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Tempo</Text>
            <Text style={styles.gridValue}>{formatDuration(data.durationSeconds)}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Elevação</Text>
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
  routeArea: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    alignItems: 'center',
  },
  distanceValue: {
    color: colors.white,
    fontSize: 52,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 58,
  },
  distanceUnit: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.medium,
    marginTop: -4,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  gridItem: {
    alignItems: 'center',
    gap: 2,
  },
  gridLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
  gridValue: {
    color: colors.textLight,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
