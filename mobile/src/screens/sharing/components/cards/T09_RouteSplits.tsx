import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../../../theme';
import { ShareCardData } from '../../../../types/sharing.types';
import { formatDistance } from '../../utils/formatters';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { CardBase } from './CardBase';

interface Props {
  data: ShareCardData;
}

/**
 * T09 — Route + splits bar chart
 * Layout: route top, split bars bottom
 */
export function T09_RouteSplits({ data }: Props) {
  const splits = data.splitsMetric?.slice(0, 8) || [];
  const maxSpeed = Math.max(...splits.map((s) => s.average_speed), 1);

  return (
    <CardBase>
      <View style={styles.content}>
        {/* Route */}
        <View style={styles.routeContainer}>
          {data.routePoints ? (
            <RouteSvg points={data.routePoints} width={260} height={140} />
          ) : (
            <RouteNoData width={260} height={140} />
          )}
        </View>

        {/* Distance label */}
        <Text style={styles.distanceLabel}>{formatDistance(data.distanceKm)} km</Text>

        {/* Splits bars */}
        {splits.length > 0 ? (
          <View style={styles.barsContainer}>
            {splits.map((s, i) => {
              const heightPct = (s.average_speed / maxSpeed) * 100;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barWrapper}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.max(heightPct, 10)}%`,
                          backgroundColor:
                            heightPct > 70 ? colors.primary : 'rgba(0, 212, 255, 0.4)',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{s.split}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noSplits}>Sem dados de splits</Text>
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
  },
  distanceLabel: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginTop: spacing.xs,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 80,
    width: '100%',
    justifyContent: 'center',
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 28,
  },
  barWrapper: {
    height: 60,
    width: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
    minHeight: 6,
  },
  barLabel: {
    color: colors.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  noSplits: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
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
