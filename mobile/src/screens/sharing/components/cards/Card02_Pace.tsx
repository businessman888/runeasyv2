import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance, formatPace, formatDuration, workoutTypeLabel } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { CardBrand } from '../CardBrand';
import { CardBase, CARD_WIDTH, CARD_HEIGHT } from './CardBase';
import { cardText } from './cardTypography';

interface Props {
  data: ShareCardData;
}

export function Card02_Pace({ data }: Props) {
  const typeLabel = workoutTypeLabel(data.workoutType).toUpperCase();

  return (
    <CardBase>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={cardText.badge}>{typeLabel}</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={cardText.metricLabel}>Pace</Text>
          <Text style={cardText.heroValue}>{formatPace(data.paceSecondsPerKm)}</Text>
          <Text style={cardText.heroUnit}>/Km</Text>
        </View>

        <View style={styles.subMetricsRow}>
          <View style={styles.subMetric}>
            <Text style={cardText.metricValueMd}>{formatDistance(data.distanceKm)}</Text>
            <Text style={cardText.tileLabel}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.subMetric}>
            <Text style={cardText.metricValueMd}>{formatDuration(data.durationSeconds)}</Text>
            <Text style={cardText.tileLabel}>tempo</Text>
          </View>
        </View>

        <View style={styles.bottomBlock}>
          {data.routePoints && data.routePoints.length >= 2 && (
            <RouteSvg
              points={data.routePoints}
              width={220}
              height={70}
              strokeColor={colors.primary}
            />
          )}
          <CardBrand size="lg" />
        </View>
      </View>
    </CardBase>
  );
}

const styles = StyleSheet.create({
  content: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderWidth: 1.2,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  heroBlock: {
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: 4,
  },
  subMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  subMetric: {
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  bottomBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
});
