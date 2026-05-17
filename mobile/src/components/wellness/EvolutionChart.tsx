import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors, typography, spacing, borderRadius } from '../../theme';
import type { EvolutionBlock, EvolutionMetric, WeekPoint } from '../../types/wellness.types';

const TABS: Array<{ key: EvolutionMetric; label: string; unit: string; invert?: boolean }> = [
    { key: 'distance', label: 'Distância', unit: 'km' },
    { key: 'pace', label: 'Pace', unit: '/km', invert: true },
    { key: 'volume', label: 'Volume', unit: 'min' },
    { key: 'heartRate', label: 'FC', unit: 'bpm' },
];

interface EvolutionChartProps {
    evolution: EvolutionBlock;
    activeTab: EvolutionMetric;
    onChangeTab: (tab: EvolutionMetric) => void;
}

function formatLabel(weekStart: string): string {
    const [, m, d] = weekStart.split('-');
    return `${d}/${m}`;
}

function formatPace(seconds: number): string {
    if (!seconds || seconds <= 0) return '--';
    const min = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${min}:${String(s).padStart(2, '0')}`;
}

export function EvolutionChart({ evolution, activeTab, onChangeTab }: EvolutionChartProps) {
    const screenWidth = Dimensions.get('window').width;
    const chartWidth = screenWidth - spacing.base * 2 - spacing.lg * 2 - 40;

    const series: WeekPoint[] = evolution[activeTab];
    const tabMeta = TABS.find((t) => t.key === activeTab)!;

    const data = useMemo(() => {
        return series.map((p, i) => ({
            value: p.value ?? 0,
            label: i % 2 === 0 ? formatLabel(p.weekStart) : '',
            dataPointText: p.value !== null && p.value > 0 ? '' : undefined,
        }));
    }, [series]);

    const hasData = data.some((d) => d.value > 0);
    const maxValue = Math.max(...data.map((d) => d.value), 1);
    const niceMax = Math.ceil(maxValue * 1.15);

    return (
        <View style={styles.section}>
            <Text style={styles.heading}>Evolução</Text>

            <View style={styles.tabs}>
                {TABS.map((tab) => {
                    const active = tab.key === activeTab;
                    return (
                        <Pressable
                            key={tab.key}
                            onPress={() => onChangeTab(tab.key)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={[styles.tab, active && styles.tabActive]}
                        >
                            <Text style={[styles.tabText, active && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.card}>
                {hasData ? (
                    <LineChart
                        data={data}
                        height={170}
                        width={chartWidth}
                        thickness={2}
                        color={colors.primary}
                        areaChart
                        curved
                        startFillColor={colors.primary}
                        endFillColor={colors.primary}
                        startOpacity={0.4}
                        endOpacity={0.04}
                        initialSpacing={10}
                        endSpacing={10}
                        spacing={Math.max(20, chartWidth / 8)}
                        yAxisColor="transparent"
                        xAxisColor="rgba(255,255,255,0.08)"
                        rulesType="solid"
                        rulesColor="rgba(255,255,255,0.06)"
                        yAxisTextStyle={styles.axisText}
                        xAxisLabelTextStyle={styles.axisText}
                        noOfSections={4}
                        maxValue={niceMax}
                        hideDataPoints={false}
                        dataPointsRadius={3}
                        dataPointsColor={colors.text}
                    />
                ) : (
                    <View style={styles.emptyChart}>
                        <Text style={styles.emptyText}>
                            Sem dados suficientes para esta métrica
                        </Text>
                    </View>
                )}

                <View style={styles.footer}>
                    <Text style={styles.footerLabel}>Últimas 8 semanas</Text>
                    <Text style={styles.footerUnit}>
                        {tabMeta.key === 'pace' && hasData
                            ? `${formatPace(series[series.length - 1]?.value ?? 0)} ${tabMeta.unit}`
                            : `${tabMeta.unit}`}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    tabs: {
        flexDirection: 'row',
        gap: spacing.xs,
        backgroundColor: colors.card,
        padding: 4,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: borderRadius.full,
    },
    tabActive: {
        backgroundColor: 'rgba(0,212,255,0.14)',
    },
    tabText: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.semibold,
        letterSpacing: 0.3,
    },
    tabTextActive: {
        color: colors.primary,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        paddingRight: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    axisText: {
        color: colors.textMuted,
        fontSize: typography.fontSizes.xs,
    },
    emptyChart: {
        height: 170,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: spacing.sm,
    },
    footerLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    footerUnit: {
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        fontWeight: typography.fontWeights.semibold,
    },
});
