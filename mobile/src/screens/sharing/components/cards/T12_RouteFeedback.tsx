import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, toneEmoji } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T12 — Route + feedback combined
 * Layout: route top, hero message + positive chips + progression impact
 */
export function T12_RouteFeedback({ data }: Props) {
  const fb = data.feedback;

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route */}
        <View style={styles.routeContainer}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={120} strokeColor="rgba(255,255,255,0.35)" />
          ) : (
            <RouteNoData width={260} height={120} />
          )}
          <Text style={styles.distanceOverlay}>{formatDistance(data.distanceKm)} km</Text>
        </View>

        {/* Feedback section */}
        <View style={styles.feedbackSection}>
          <Text style={styles.emoji}>{fb ? toneEmoji(fb.heroTone) : '🏃'}</Text>
          <Text style={styles.heroMessage} numberOfLines={2}>
            {fb?.heroMessage || 'Treino concluído!'}
          </Text>
        </View>

        {/* Positive chips */}
        {fb && fb.positives.length > 0 && (
          <View style={styles.chipsRow}>
            {fb.positives.slice(0, 3).map((p, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{p.title}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Progression impact */}
        {fb?.progressionImpact && (
          <Text style={styles.progression} numberOfLines={1}>
            {fb.progressionImpact}
          </Text>
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
  routeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  distanceOverlay: {
    position: 'absolute',
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  feedbackSection: {
    alignItems: 'center',
    gap: 4,
  },
  emoji: {
    fontSize: 24,
  },
  heroMessage: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    lineHeight: 20,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  chipText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
  },
  progression: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    textAlign: 'center',
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
