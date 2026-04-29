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

export function Card01_Compact({ data }: Props) {
  const typeLabel = workoutTypeLabel(data.workoutType).toUpperCase();

  return (
    <CardBase>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={cardText.badge}>{typeLabel}</Text>
        </View>

        <View style={styles.metricsBlock}>
          <Metric label="Distância" value={`${formatDistance(data.distanceKm)} Km`} />
          <Metric label="Pace" value={`${formatPace(data.paceSecondsPerKm)} /Km`} />
          <Metric label="Tempo" value={formatDuration(data.durationSeconds)} />
        </View>

        <View style={styles.bottomBlock}>
          {data.routePoints && data.routePoints.length >= 2 && (
            <RouteSvg
              points={data.routePoints}
              width={200}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={cardText.metricLabel}>{label}</Text>
      <Text style={cardText.metricValueLg}>{value}</Text>
    </View>
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
  metricsBlock: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  metric: {
    alignItems: 'center',
    gap: 4,
  },
  bottomBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
});
