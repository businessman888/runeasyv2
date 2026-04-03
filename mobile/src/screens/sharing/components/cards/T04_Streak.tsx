import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration } from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T04 — Streak / Gamification card
 * Layout: streak flame top, level badge, distance + pace row, recent badges
 */
export function T04_Streak({ data }: Props) {
  const gam = data.gamification;

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Streak hero */}
        <View style={styles.streakRow}>
          <MaterialCommunityIcons name="fire" size={36} color={colors.accent} />
          <Text style={styles.streakValue}>{gam?.currentStreak ?? 0}</Text>
          <Text style={styles.streakLabel}>dias seguidos</Text>
        </View>

        {/* Level pill */}
        <View style={styles.levelPill}>
          <Ionicons name="star" size={14} color={colors.warning} />
          <Text style={styles.levelText}>Nível {gam?.currentLevel ?? 1}</Text>
          <Text style={styles.pointsText}>{gam?.totalPoints ?? 0} XP</Text>
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
            <Text style={styles.metricLabel}>pace</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatDuration(data.durationSeconds)}</Text>
            <Text style={styles.metricLabel}>tempo</Text>
          </View>
        </View>

        {/* Recent badges */}
        {gam?.recentBadges && gam.recentBadges.length > 0 && (
          <View style={styles.badgesRow}>
            {gam.recentBadges.map((b, i) => (
              <View key={i} style={styles.badgeChip}>
                <Text style={styles.badgeIcon}>{b.icon || '🏅'}</Text>
                <Text style={styles.badgeName}>{b.name}</Text>
              </View>
            ))}
          </View>
        )}

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
  streakRow: {
    alignItems: 'center',
    gap: 2,
  },
  streakValue: {
    color: colors.accent,
    fontSize: 56,
    fontWeight: typography.fontWeights.extrabold,
    lineHeight: 62,
  },
  streakLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.medium,
  },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 196, 0, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  levelText: {
    color: colors.warning,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  pointsText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
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
  badgesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  badgeIcon: {
    fontSize: 14,
  },
  badgeName: {
    color: colors.textLight,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
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
