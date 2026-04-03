import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T07 — Route minimal card
 * Layout: SVG route top half, distance + pace + duration bottom
 */
export function T07_RouteMinimal({ data }: Props) {
  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route area */}
        <View style={styles.routeContainer}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={180} />
          ) : (
            <RouteNoData width={260} height={180} />
          )}
        </View>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDistance(data.distanceKm)}</Text>
            <Text style={styles.metricLabel}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatPace(data.paceSecondsPerKm)}</Text>
            <Text style={styles.metricLabel}>/km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDuration(data.durationSeconds)}</Text>
            <Text style={styles.metricLabel}>tempo</Text>
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
  routeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
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
