import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { toneEmoji, workoutTypeLabel, formatDistance, formatPace } from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T05 — Feedback hero message card
 * Layout: tone emoji + hero message center, workout type + distance/pace footer
 */
export function T05_FeedbackHero({ data }: Props) {
  const fb = data.feedback;

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Tone emoji */}
        <Text style={styles.emoji}>{fb ? toneEmoji(fb.heroTone) : '🏃'}</Text>

        {/* Hero message */}
        <Text style={styles.heroMessage} numberOfLines={4}>
          {fb?.heroMessage || 'Treino concluído!'}
        </Text>

        {/* Positive chips */}
        {fb && fb.positives.length > 0 && (
          <View style={styles.chipsRow}>
            {fb.positives.slice(0, 2).map((p, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{p.title}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer metrics */}
        <View style={styles.footer}>
          <Text style={styles.footerType}>{workoutTypeLabel(data.workoutType)}</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerMetric}>{formatDistance(data.distanceKm)} km</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerMetric}>{formatPace(data.paceSecondsPerKm)} /km</Text>
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
  emoji: {
    fontSize: 40,
  },
  heroMessage: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    lineHeight: 32,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  chipText: {
    color: colors.success,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerType: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  footerDot: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  footerMetric: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
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
