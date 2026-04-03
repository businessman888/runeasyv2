import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatElevation, formatHeartRate } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T10 — Route + elevation + heart rate focus
 * Layout: route top, elevation/HR stats center, distance bottom
 */
export function T10_RouteElevation({ data }: Props) {
  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route */}
        <View style={styles.routeContainer}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={150} />
          ) : (
            <RouteNoData width={260} height={150} />
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="trending-up" size={20} color={colors.success} />
            <Text style={styles.statValue}>{formatElevation(data.elevationGain)}</Text>
            <Text style={styles.statLabel}>elevação</Text>
          </View>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="heart-pulse" size={20} color={colors.error} />
            <Text style={styles.statValue}>{formatHeartRate(data.averageHeartrate)}</Text>
            <Text style={styles.statLabel}>FC média</Text>
          </View>
        </View>

        {/* Distance */}
        <Text style={styles.distance}>{formatDistance(data.distanceKm)} km</Text>

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
  routeContainer: {
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing['2xl'],
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  distance: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
