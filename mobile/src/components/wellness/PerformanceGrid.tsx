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
                <Text style={styles.subheading}>Esta semana</Text>
            </View>

            <View style={styles.grid}>
                <PerformanceCard
                    label="Distância"
                    value={performance.distance.value.toFixed(1)}
                    unit=" km"
                    deltaPct={performance.distance.deltaPct}
                    sparkline={performance.distance.sparkline}
                    accentColor={colors.primary}
                />
                <PerformanceCard
                    label="Treinos"
                    value={`${performance.frequency.value}${frequencyPlanned > 0 ? `/${frequencyPlanned}` : ''}`}
                    deltaPct={performance.frequency.deltaPct}
                    sparkline={performance.frequency.sparkline}
                    accentColor={colors.success}
                />
                <PerformanceCard
                    label="Pace médio"
                    value={formatPace(performance.pace.value)}
                    unit=" /km"
                    deltaPct={performance.pace.deltaPct}
                    sparkline={performance.pace.sparkline}
                    invertDelta
                    accentColor={colors.warning}
                />
                <PerformanceCard
                    label="Volume"
                    value={String(performance.duration.value)}
                    unit=" min"
                    deltaPct={performance.duration.deltaPct}
                    sparkline={performance.duration.sparkline}
                    accentColor={colors.primaryLight}
                />
                <PerformanceCard
                    label="Calorias"
                    value={performance.calories.value.toLocaleString('pt-BR')}
                    unit=" cal"
                    deltaPct={performance.calories.deltaPct}
                    sparkline={performance.calories.sparkline}
                    accentColor={colors.accent}
                />
                <PerformanceCard
                    label="Elevação"
                    value={String(performance.elevation.value)}
                    unit=" m"
                    deltaPct={performance.elevation.deltaPct}
                    sparkline={performance.elevation.sparkline}
                    accentColor={colors.recovery}
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
        alignItems: 'baseline',
        justifyContent: 'space-between',
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        letterSpacing: -0.3,
    },
    subheading: {
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        fontWeight: typography.fontWeights.medium,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        rowGap: spacing.sm,
    },
});
