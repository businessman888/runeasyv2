import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PlanWeek } from '../../../types/plan-overview.types';

// ─── Figma tokens ────────────────────────────────────────────────────────────
const CARD_BG = '#1C1C2E';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_TITLE = '#EBEBF5';
const TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const PROGRESS_TRACK = 'rgba(235, 235, 245, 0.1)';
const PROGRESS_FILL = '#00D4FF';
const BORDER_CURRENT = '#00D4FF';

interface WeekRowProps {
    week: PlanWeek;
    isFuture: boolean;
    onPress: (weekNumber: number) => void;
}

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatRange(start: string, end: string): string {
    if (!start || !end) return '';
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const sLabel = `${MONTH_PT[s.getMonth()]} ${s.getDate().toString().padStart(2, '0')}`;
    const eLabel = `${MONTH_PT[e.getMonth()]} ${e.getDate().toString().padStart(2, '0')}`;
    return `${sLabel} - ${eLabel}`;
}

export const WeekRow = memo(({ week, isFuture, onPress }: WeekRowProps) => {
    const period = formatRange(week.start_date, week.end_date);
    const progressPct =
        week.total_workouts > 0 ? week.completed_workouts / week.total_workouts : 0;

    return (
        <Pressable
            onPress={() => onPress(week.week_number)}
            style={[
                styles.card,
                week.is_current && styles.cardCurrent,
                isFuture && styles.cardFuture,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalhes da semana ${week.week_number}`}
        >
            <View style={styles.header}>
                <Text style={styles.period}>{period}</Text>
                <Text style={styles.title}>
                    Semana {week.week_number} - {week.phase_label}
                </Text>
            </View>

            <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                    <View
                        style={[
                            styles.progressFill,
                            { width: `${Math.round(progressPct * 100)}%` },
                        ]}
                    />
                </View>
                <Text style={styles.totalLabel}>Total Treinos: {week.total_workouts}</Text>
            </View>

            <View style={styles.workoutsList}>
                {week.workouts.map((w) => (
                    <View key={w.id} style={styles.workoutRow}>
                        <MaterialCommunityIcons name="run" size={20} color={TEXT_PRIMARY} />
                        <Text style={styles.dayLabel}>{w.day_of_week}</Text>
                        <Text style={styles.workoutName} numberOfLines={1}>
                            {w.title}
                        </Text>
                    </View>
                ))}
                {week.workouts.length === 0 && (
                    <Text style={styles.emptyLabel}>Dia de descanso</Text>
                )}
            </View>
        </Pressable>
    );
});

WeekRow.displayName = 'WeekRow';

const styles = StyleSheet.create({
    card: {
        backgroundColor: CARD_BG,
        borderRadius: 15,
        paddingVertical: 11,
        paddingHorizontal: 8,
        gap: 13,
    },
    cardCurrent: {
        borderWidth: 1,
        borderColor: BORDER_CURRENT,
    },
    cardFuture: {
        opacity: 0.6,
    },
    header: {
        paddingHorizontal: 9,
        gap: 9,
    },
    period: {
        fontSize: 15,
        fontWeight: '700',
        color: TEXT_SECONDARY,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    progressWrap: {
        paddingHorizontal: 0,
        gap: 7,
    },
    progressTrack: {
        height: 5,
        backgroundColor: PROGRESS_TRACK,
        borderRadius: 20,
        overflow: 'hidden',
    },
    progressFill: {
        height: 5,
        backgroundColor: PROGRESS_FILL,
        borderRadius: 20,
    },
    totalLabel: {
        fontSize: 10,
        fontWeight: '400',
        color: TEXT_SECONDARY,
        paddingHorizontal: 3,
    },
    workoutsList: {
        gap: 6,
    },
    workoutRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        paddingHorizontal: 11,
        height: 42,
    },
    dayLabel: {
        fontSize: 10,
        fontWeight: '400',
        color: TEXT_SECONDARY,
        minWidth: 24,
    },
    workoutName: {
        flex: 1,
        fontSize: 10,
        fontWeight: '700',
        color: TEXT_TITLE,
    },
    emptyLabel: {
        fontSize: 12,
        fontWeight: '400',
        color: TEXT_SECONDARY,
        textAlign: 'center',
        paddingVertical: 12,
    },
});
