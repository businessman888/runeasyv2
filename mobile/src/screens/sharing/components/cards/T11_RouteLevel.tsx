import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T11 — Route + level/XP overlay
 * Layout: route background, level badge + distance + pace
 */
export function T11_RouteLevel({ data }: Props) {
  const gam = data.gamification;

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route */}
        <View style={styles.routeContainer}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={160} strokeColor="rgba(255,255,255,0.3)" />
          ) : (
            <RouteNoData width={260} height={160} />
          )}
        </View>

        {/* Level badge overlay */}
        <View style={styles.levelBadge}>
          <Ionicons name="star" size={18} color={colors.warning} />
          <Text style={styles.levelText}>Nível {gam?.currentLevel ?? 1}</Text>
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
            <Text style={styles.metricValue}>{gam?.totalPoints ?? 0}</Text>
            <Text style={styles.metricLabel}>XP</Text>
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
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  levelText: {
    color: colors.warning,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
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
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
