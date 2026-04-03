import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace } from '../../utils/formatters';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T06 — Feedback detail card with positives + warnings
 * Layout: hero message top, positives list, warnings list, distance/pace footer
 */
export function T06_FeedbackDetail({ data }: Props) {
  const fb = data.feedback;

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Hero message truncated */}
        <Text style={styles.heroMessage} numberOfLines={2}>
          {fb?.heroMessage || 'Treino concluído!'}
        </Text>

        {/* Positives */}
        {fb && fb.positives.length > 0 && (
          <View style={styles.section}>
            {fb.positives.slice(0, 2).map((p, i) => (
              <View key={i} style={styles.item}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{p.title}</Text>
                  <Text style={styles.itemDesc} numberOfLines={1}>{p.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Warnings */}
        {fb && fb.warnings.length > 0 && (
          <View style={styles.section}>
            {fb.warnings.slice(0, 2).map((w, i) => (
              <View key={i} style={styles.item}>
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{w.title}</Text>
                  <Text style={styles.itemDesc} numberOfLines={1}>{w.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerMetric}>{formatDistance(data.distanceKm)} km</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerMetric}>{formatPace(data.paceSecondsPerKm)} /km</Text>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="run" size={14} color={colors.primary} />
            <Text style={styles.brandText}>RunEasy</Text>
          </View>
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
  heroMessage: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: 24,
  },
  section: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    color: colors.textLight,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  itemDesc: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerMetric: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
  },
  footerDot: {
    color: colors.textMuted,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  brandText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
});
