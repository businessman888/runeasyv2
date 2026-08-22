import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import type { PlanWeek } from '../../../types/plan-overview.types';
import { getPhaseStyle } from '../phaseTokens';
import { semanticColors } from '../../../theme/semanticColors';

// ─── Figma tokens ────────────────────────────────────────────────────────────
const CARD_BG = semanticColors.surface1;
const CARD_BG_PAST = semanticColors.canvas;
const TEXT_PRIMARY = semanticColors.textPrimary;
const TEXT_TITLE = semanticColors.textPrimary;
const TEXT_SECONDARY = semanticColors.textSecondary;
const PROGRESS_TRACK = semanticColors.borderSubtle;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface WeekRowProps {
    week: PlanWeek;
    isFuture: boolean;
    isPast: boolean;
    onPress: (weekNumber: number) => void;
}

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatRange(start: string, end: string): string {
    if (!start || !end) return '';
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const sLabel = `${MONTH_PT[s.getMonth()]} ${s.getDate().toString().padStart(2, '0')}`;
    const eLabel = `${MONTH_PT[e.getMonth()]} ${e.getDate().toString().padStart(2, '0')}`;
    return `${sLabel} – ${eLabel}`;
}

export const WeekRow = memo(({ week, isFuture, isPast, onPress }: WeekRowProps) => {
    const period = formatRange(week.start_date, week.end_date);
    const phaseStyle = getPhaseStyle(week.phase);
    const progressPct =
        week.total_workouts > 0 ? week.completed_workouts / week.total_workouts : 0;

    const scale = useSharedValue(1);
    const progressWidth = useSharedValue(0);

    React.useEffect(() => {
        progressWidth.value = withTiming(progressPct * 100, { duration: 700 });
    }, [progressPct, progressWidth]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const progressStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value}%` as `${number}%`,
    }));

    const handlePressIn = useCallback(() => {
        scale.value = withSpring(0.97, { damping: 14, stiffness: 220 });
    }, [scale]);

    const handlePressOut = useCallback(() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    }, [scale]);

    const handlePress = useCallback(() => {
        onPress(week.week_number);
    }, [onPress, week.week_number]);

    return (
        <AnimatedPressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
                styles.card,
                isPast && styles.cardPast,
                week.is_current && {
                    borderColor: phaseStyle.accent,
                    shadowColor: phaseStyle.glow,
                },
                week.is_current && styles.cardCurrent,
                isFuture && styles.cardFuture,
                animStyle,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalhes da semana ${week.week_number}, fase ${phaseStyle.label}`}
        >
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <Text style={styles.period}>{period}</Text>
                    <Text style={styles.title}>Semana {week.week_number}</Text>
                </View>

                <View style={styles.headerRight}>
                    <View
                        style={[
                            styles.phasePill,
                            { backgroundColor: phaseStyle.pillBg },
                        ]}
                    >
                        <View
                            style={[styles.phaseDot, { backgroundColor: phaseStyle.accent }]}
                        />
                        <Text style={[styles.phaseLabel, { color: phaseStyle.accent }]}>
                            {phaseStyle.label}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                    <Animated.View
                        style={[
                            styles.progressFill,
                            { backgroundColor: phaseStyle.accent },
                            progressStyle,
                        ]}
                    />
                </View>
                <View style={styles.progressMetaRow}>
                    <Text style={styles.totalLabel}>
                        {week.completed_workouts}/{week.total_workouts} treinos
                    </Text>
                    {week.is_current && (
                        <View style={styles.currentBadge}>
                            <MaterialCommunityIcons
                                name="play-circle"
                                size={11}
                                color={phaseStyle.accent}
                            />
                            <Text style={[styles.currentBadgeText, { color: phaseStyle.accent }]}>
                                Semana atual
                            </Text>
                        </View>
                    )}
                    {isPast && week.completed_workouts === week.total_workouts && week.total_workouts > 0 && (
                        <View style={styles.completedBadge}>
                            <MaterialCommunityIcons name="check-circle" size={11} color="#32E08A" />
                            <Text style={styles.completedBadgeText}>Completa</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.workoutsList}>
                {week.workouts.length > 0 ? (
                    week.workouts.map((w) => (
                        <View key={w.id} style={styles.workoutRow}>
                            <View style={styles.workoutIconWrap}>
                                <MaterialCommunityIcons name="run" size={14} color={TEXT_PRIMARY} />
                            </View>
                            <Text style={styles.dayLabel}>{w.day_of_week}</Text>
                            <Text style={styles.workoutName} numberOfLines={1}>
                                {w.title}
                            </Text>
                            <Text style={styles.workoutDistance}>{w.distance_km.toFixed(1)} km</Text>
                            {w.status === 'completed' && (
                                <MaterialCommunityIcons
                                    name="check-circle"
                                    size={14}
                                    color="#32E08A"
                                />
                            )}
                        </View>
                    ))
                ) : (
                    <Text style={styles.emptyLabel}>Dia de descanso</Text>
                )}
            </View>
        </AnimatedPressable>
    );
});

WeekRow.displayName = 'WeekRow';

const styles = StyleSheet.create({
    card: {
        backgroundColor: CARD_BG,
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 14,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    cardPast: {
        backgroundColor: CARD_BG_PAST,
    },
    cardCurrent: {
        borderWidth: 1.5,
        ...Platform.select({
            ios: {
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.6,
                shadowRadius: 14,
            },
            android: {
                elevation: 6,
            },
        }),
    },
    cardFuture: {
        opacity: 0.7,
    },

    // header
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    headerLeft: {
        flex: 1,
        gap: 4,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    period: {
        fontSize: 12,
        fontWeight: '600',
        color: TEXT_SECONDARY,
        letterSpacing: 0.3,
    },
    title: {
        fontSize: 19,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    phasePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    phaseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    phaseLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    // progress
    progressWrap: {
        gap: 8,
    },
    progressTrack: {
        height: 6,
        backgroundColor: PROGRESS_TRACK,
        borderRadius: 999,
        overflow: 'hidden',
    },
    progressFill: {
        height: 6,
        borderRadius: 999,
    },
    progressMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: TEXT_SECONDARY,
    },
    currentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    currentBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    completedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    completedBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#32E08A',
    },

    // workouts mini list
    workoutsList: {
        gap: 8,
        paddingTop: 4,
    },
    workoutRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    workoutIconWrap: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: semanticColors.glass,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: TEXT_SECONDARY,
        width: 30,
    },
    workoutName: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: TEXT_TITLE,
    },
    workoutDistance: {
        fontSize: 11,
        fontWeight: '600',
        color: TEXT_SECONDARY,
    },
    emptyLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: TEXT_SECONDARY,
        textAlign: 'center',
        paddingVertical: 8,
    },
});
