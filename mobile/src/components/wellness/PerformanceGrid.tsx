import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { PerformanceCard } from './PerformanceCard';
import type { PerformanceBlock } from '../../types/wellness.types';

interface PerformanceGridProps {
    performance: PerformanceBlock;
    frequencyPlanned: number;
}

function formatPace(seconds: number): string {
    if (!seconds || seconds <= 0) return '--';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function PerformanceGrid({ performance, frequencyPlanned }: PerformanceGridProps) {
    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={styles.heading}>Performance</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Esta semana</Text>
                </View>
            </View>

            <View style={styles.grid}>
                <PerformanceCard
                    label="Distância"
                    value={performance.distance.value.toFixed(1)}
                    unit="km"
                    deltaPct={performance.distance.deltaPct}
                    sparkline={performance.distance.sparkline}
                    iconName="map-outline"
                    iconColor={colors.primary}
                />
                <PerformanceCard
                    label="Treinos"
                    value={`${performance.frequency.value}${frequencyPlanned > 0 ? `/${frequencyPlanned}` : ''}`}
                    deltaPct={performance.frequency.deltaPct}
                    sparkline={performance.frequency.sparkline}
                    iconName="bar-chart-outline"
                    iconColor={colors.success}
                />
                <PerformanceCard
                    label="Pace médio"
                    value={formatPace(performance.pace.value)}
                    unit="/km"
                    deltaPct={performance.pace.deltaPct}
                    sparkline={performance.pace.sparkline}
                    invertDelta
                    iconName="speedometer-outline"
                    iconColor={colors.warning}
                />
                <PerformanceCard
                    label="Volume"
                    value={String(performance.duration.value)}
                    unit="min"
                    deltaPct={performance.duration.deltaPct}
                    sparkline={performance.duration.sparkline}
                    iconName="time-outline"
                    iconColor={colors.primaryLight}
                />
                <PerformanceCard
                    label="Calorias"
                    value={performance.calories.value.toLocaleString('pt-BR')}
                    unit="cal"
                    deltaPct={performance.calories.deltaPct}
                    sparkline={performance.calories.sparkline}
                    iconName="flame-outline"
                    iconColor={colors.accent}
                />
                <PerformanceCard
                    label="Elevação"
                    value={String(performance.elevation.value)}
                    unit="m"
                    deltaPct={performance.elevation.deltaPct}
                    sparkline={performance.elevation.sparkline}
                    iconName="trending-up-outline"
                    iconColor={colors.recovery}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    badge: {
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(0,212,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.25)',
    },
    badgeText: {
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
        letterSpacing: 0.3,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        rowGap: spacing.sm,
    },
});
