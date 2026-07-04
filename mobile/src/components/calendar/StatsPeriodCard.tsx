import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../theme';
import { useWorkoutScopeStore } from '../../stores';
import {
    useStatsStore,
    type StatsPeriod,
    type PeriodBreakdownItem,
} from '../../stores/statsStore';
import { StatsBarChart } from './StatsBarChart';

/**
 * Calendar stats card — Distância / Tempo / Freq + animated bar chart, scoped
 * by the active Treinos/Atividades tab (via useWorkoutScopeStore) and by its
 * OWN local Semana/Mês dropdown (independent from the calendar's toggle).
 * Solid #15152A card, no border, no glass (clean/minimal per design).
 */

const WEEK_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function formatDuration(min: number): string {
    if (min <= 0) return '0 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
}

function Tile({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.tile}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

function StatsPeriodCardInner() {
    const scope = useWorkoutScopeStore((s) => s.scope); // 'plan' | 'activity'
    const mappedScope = scope === 'plan' ? 'workouts' : 'activities';

    const periodSummary = useStatsStore((s) => s.periodSummary);
    const fetchPeriodSummary = useStatsStore((s) => s.fetchPeriodSummary);

    const [period, setPeriod] = useState<StatsPeriod>('week');
    const [menuOpen, setMenuOpen] = useState(false);

    // Refetch on tab (scope) or period change. reference_date omitted → backend
    // uses today (this card always reflects the current week/month).
    useEffect(() => {
        fetchPeriodSummary(mappedScope, period);
    }, [mappedScope, period, fetchPeriodSummary]);

    // Bump a version whenever fresh data lands so the chart re-animates from
    // zero exactly when new values arrive (correct grow on first load + every
    // scope/period switch, with no stale-data flash).
    const [dataVersion, setDataVersion] = useState(0);
    useEffect(() => {
        setDataVersion((v) => v + 1);
    }, [periodSummary]);

    const distanceStr = `${periodSummary?.distance_km ?? 0} km`;
    const timeStr = formatDuration(periodSummary?.time_minutes ?? 0);
    const freqStr = periodSummary
        ? `${periodSummary.frequency.value}/${periodSummary.frequency.total}`
        : '0/0';

    // Keep the chart layout stable while loading/empty → zeroed bars.
    const data: PeriodBreakdownItem[] = useMemo(() => {
        if (periodSummary?.breakdown?.length) return periodSummary.breakdown;
        return period === 'week'
            ? WEEK_LABELS.map((label) => ({ label, distance_km: 0 }))
            : [1, 2, 3, 4].map((i) => ({ label: `Sem ${i}`, distance_km: 0 }));
    }, [periodSummary, period]);

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.metrics}>
                    <Tile label="Distância" value={distanceStr} />
                    <Tile label="Tempo" value={timeStr} />
                    <Tile label="Freq" value={freqStr} />
                </View>

                <Pressable
                    style={styles.dropdownTrigger}
                    onPress={() => setMenuOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityLabel={`Período: ${period === 'week' ? 'Semana' : 'Mês'}`}
                    accessibilityHint="Alterna entre visão semanal e mensal"
                >
                    <Text style={styles.dropdownText}>{period === 'week' ? 'Semana' : 'Mês'}</Text>
                    <Ionicons
                        name="chevron-down"
                        size={18}
                        color="rgba(235, 235, 245, 0.6)"
                        style={{ transform: [{ rotate: menuOpen ? '180deg' : '0deg' }] }}
                    />
                </Pressable>
            </View>

            <StatsBarChart data={data} animKey={`v${dataVersion}`} />

            {/* Dropdown menu (card-level backdrop dismisses on tap-away) */}
            {menuOpen && (
                <>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setMenuOpen(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar seletor de período"
                    />
                    <View style={styles.menu}>
                        {(['week', 'month'] as const).map((p) => (
                            <Pressable
                                key={p}
                                style={styles.menuItem}
                                onPress={() => {
                                    setPeriod(p);
                                    setMenuOpen(false);
                                }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: p === period }}
                            >
                                <Text
                                    style={[styles.menuItemText, p === period && styles.menuItemTextActive]}
                                >
                                    {p === 'week' ? 'Semana' : 'Mês'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </>
            )}
        </View>
    );
}

export const StatsPeriodCard = memo(StatsPeriodCardInner);

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.streakCard, // #15152A — solid, no border/glass
        marginHorizontal: spacing.md,
        marginVertical: spacing.md,
        borderRadius: 20,
        padding: spacing.base,
        position: 'relative',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    metrics: {
        flexDirection: 'row',
        gap: spacing.lg,
        flexShrink: 1,
    },
    tile: {
        gap: 4,
    },
    tileLabel: {
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    tileValue: {
        fontFamily: fonts.semibold,
        fontSize: 15,
        color: colors.textLight,
    },
    dropdownTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 44,
        paddingLeft: spacing.sm,
    },
    dropdownText: {
        fontFamily: fonts.semibold,
        fontSize: 14,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    menu: {
        position: 'absolute',
        top: 48,
        right: spacing.base,
        backgroundColor: '#1F1F38',
        borderRadius: 12,
        paddingVertical: 4,
        minWidth: 120,
        // Subtle elevation so the menu reads above the card.
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    menuItem: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        minHeight: 44,
        justifyContent: 'center',
    },
    menuItemText: {
        fontFamily: fonts.medium,
        fontSize: 14,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    menuItemTextActive: {
        color: colors.primary,
        fontFamily: fonts.semibold,
    },
});

export default StatsPeriodCard;
