import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import {
  formatDistance,
  formatPace,
  formatDuration,
  formatElevation,
  formatHeartRate,
  workoutTypeLabel,
} from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { CardBrand } from '../CardBrand';
import { CardBase, CARD_WIDTH, CARD_HEIGHT } from './CardBase';
import { cardText } from './cardTypography';

interface Props {
  data: ShareCardData;
}

type Tile = { label: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap };

function buildTiles(data: ShareCardData): Tile[] {
  const tiles: Tile[] = [
    { label: 'Distância', value: `${formatDistance(data.distanceKm)} km`, icon: 'map-marker-distance' },
    { label: 'Pace', value: `${formatPace(data.paceSecondsPerKm)} /km`, icon: 'speedometer' },
    { label: 'Tempo', value: formatDuration(data.durationSeconds), icon: 'timer-outline' },
  ];
  if (data.elevationGain != null) {
    tiles.push({ label: 'Elevação', value: formatElevation(data.elevationGain), icon: 'trending-up' });
  }
  if (data.averageHeartrate != null) {
    tiles.push({ label: 'FC Média', value: formatHeartRate(data.averageHeartrate), icon: 'heart-pulse' });
  }
  if (data.cadenceSpm != null) {
    tiles.push({ label: 'Cadência', value: `${data.cadenceSpm}spm`, icon: 'shoe-sneaker' });
  }
  return tiles;
}

export function Card04_MetricsFull({ data }: Props) {
  const typeLabel = workoutTypeLabel(data.workoutType).toUpperCase();
  const tiles = buildTiles(data);

  return (
    <CardBase>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={cardText.badge}>{typeLabel}</Text>
        </View>

        <View style={styles.grid}>
          {tiles.map((t, i) => (
            <View key={i} style={styles.tile}>
              <MaterialCommunityIcons name={t.icon} size={18} color={colors.primary} />
              <Text style={cardText.tileValue}>{t.value}</Text>
              <Text style={cardText.tileLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomBlock}>
          {data.routePoints && data.routePoints.length >= 2 && (
            <RouteSvg
              points={data.routePoints}
              width={240}
              height={64}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.lg,
  },
  tile: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bottomBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
});
