import React, { useCallback, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
} from 'react-native';
import {
    useFocusEffect,
    useNavigation,
    useRoute,
    RouteProp,
} from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { ScreenContainer } from '../../components/ScreenContainer';
import { WorkoutCard } from '../../components/WorkoutCard';
import { useTrainingStore, useGamificationStore } from '../../stores';
import { useStartWorkoutFlow } from '../../hooks/useStartWorkoutFlow';
import type { PlanWorkout } from '../../types/plan-overview.types';
import { getPhaseStyle } from './phaseTokens';
import { semanticColors } from '../../theme/semanticColors';
import { createThemeStyles, useThemeSubscription } from '../../theme';
import { getTodayStrSaoPaulo } from '../../utils/planDate';

// ─── Figma tokens ────────────────────────────────────────────────────────────







const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatRange(start: string, end: string): string {
    if (!start || !end) return '';
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const sLabel = `${MONTH_PT[s.getMonth()]} ${s.getDate().toString().padStart(2, '0')}`;
    const eLabel = `${MONTH_PT[e.getMonth()]} ${e.getDate().toString().padStart(2, '0')}`;
    return `${sLabel} – ${eLabel}`;
}

function getWorkoutTypeName(type: string): string {
    const names: Record<string, string> = {
        easy_run: 'Rodagem Leve',
        long_run: 'Longão',
        intervals: 'Intervalado',
        tempo: 'Tempo Run',
        recovery: 'Recuperação',
        fartlek: 'Fartlek',
        progressive: 'Progressivo',
    };
    return names[type] ?? type;
}

type WeekDetailRouteParams = {
    WeekDetail: { weekNumber: number; planId: string };
};

export function WeekDetailScreen() {
    useThemeSubscription();
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<WeekDetailRouteParams, 'WeekDetail'>>();
    const { weekNumber } = route.params;

    const planOverview = useTrainingStore((s) => s.planOverview);
    const fetchPlanOverview = useTrainingStore((s) => s.fetchPlanOverview);
    const badges = useGamificationStore((s) => s.badges) ?? [];
    const { startRun } = useStartWorkoutFlow();

    // ── REVALIDA A CADA FOCO (Fase 6.3) ──────────────────────────────────────
    //
    // Era `if (!planOverview) fetchPlanOverview()` — hidratava uma vez e nunca
    // mais, o MESMO defeito que a 6.2 corrigiu no `PlanGoalsScreen`. Esta é a
    // tela onde o corredor vem conferir a semana depois de aliviá-la; sem
    // revalidar, ela seria a última a mostrar o resultado.
    useFocusEffect(
        useCallback(() => {
            void fetchPlanOverview();
        }, [fetchPlanOverview]),
    );

    const week = useMemo(
        () => planOverview?.weeks.find((w) => w.week_number === weekNumber) ?? null,
        [planOverview, weekNumber],
    );

    const todayStr = useMemo(() => getTodayStrSaoPaulo(), []);

    const handleStartWorkout = useCallback(
        (workout: PlanWorkout) => {
            const dayLabel = `Hoje ${new Date().getDate().toString().padStart(2, '0')}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
            const title = `${getWorkoutTypeName(workout.type)} - ${workout.distance_km.toFixed(1)}Km`;
            startRun({
                workoutId: workout.id,
                dayLabel,
                title,
                workoutBlocks: workout.instructions_json ?? [],
                mode: 'planned',
                targetPaceSeconds: undefined,
                targetDistanceKm: workout.distance_km,
            });
        },
        [startRun],
    );

    const renderItem = useCallback(
        ({ item, index }: { item: PlanWorkout; index: number }) => {
            const isToday = item.scheduled_date === todayStr;
            const isCompleted = item.status === 'completed';
            const executedOverride = item.executed_data
                ? {
                    distanceKm: item.executed_data.distance_km,
                    durationSeconds: item.executed_data.duration_seconds,
                    paceSecondsPerKm: item.executed_data.pace_seconds_per_km,
                }
                : undefined;

            return (
                <Animated.View entering={FadeInUp.delay(120 + index * 60).duration(380)}>
                    <WorkoutCard
                        workout={{
                            id: item.id,
                            type: item.type,
                            distance_km: item.distance_km,
                            scheduled_date: item.scheduled_date,
                            instructions_json: item.instructions_json,
                            status: item.status,
                        }}
                        isToday={isToday}
                        isCompleted={isCompleted}
                        onStartWorkout={() => handleStartWorkout(item)}
                        allBadges={badges}
                        executedOverride={executedOverride}
                    />
                </Animated.View>
            );
        },
        [todayStr, badges, handleStartWorkout],
    );

    const keyExtractor = useCallback((item: PlanWorkout) => item.id, []);

    if (!planOverview || !week) {
        return (
            <ScreenContainer style={styles.screen}>
                <Header onBack={() => navigation.goBack()} subtitle="" />
                <View style={styles.centered}>
                    <MaterialCommunityIcons
                        name="calendar-question"
                        size={48}
                        color={semanticColors.textTertiary}
                    />
                    <Text style={styles.centeredText}>Semana não encontrada.</Text>
                </View>
            </ScreenContainer>
        );
    }

    const progressPct =
        week.total_workouts > 0 ? week.completed_workouts / week.total_workouts : 0;

    return (
        <ScreenContainer style={styles.screen}>
            <Header
                onBack={() => navigation.goBack()}
                subtitle={formatRange(week.start_date, week.end_date)}
            />

            <FlatList
                data={week.workouts}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={ItemSeparator}
                ListHeaderComponent={
                    <Animated.View entering={FadeInDown.duration(380)}>
                        <WeekSummaryCard
                            weekNumber={week.week_number}
                            phase={week.phase}
                            isCurrent={week.is_current}
                            progressPct={progressPct}
                            totalWorkouts={week.total_workouts}
                            completedWorkouts={week.completed_workouts}
                        />
                    </Animated.View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <MaterialCommunityIcons
                            name="weather-night"
                            size={42}
                            color={semanticColors.textTertiary}
                        />
                        <Text style={styles.emptyText}>Sem treinos nesta semana.</Text>
                        <Text style={styles.emptySubtext}>Semana de descanso 💤</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </ScreenContainer>
    );
}

function ItemSeparator() {
    useThemeSubscription();
    return <View style={{ height: 14 }} />;
}

function Header({ onBack, subtitle }: { onBack: () => void; subtitle: string }) {
    useThemeSubscription();
    return (
        <View style={styles.header}>
            <Pressable
                onPress={onBack}
                style={styles.headerSideBtn}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
                hitSlop={12}
            >
                <Ionicons name="chevron-back" size={24} color={semanticColors.accent} />
            </Pressable>
            <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Seu Plano</Text>
                {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
            </View>
            <View style={styles.headerSideBtn} />
        </View>
    );
}

interface WeekSummaryCardProps {
    weekNumber: number;
    phase: string;
    isCurrent: boolean;
    progressPct: number;
    totalWorkouts: number;
    completedWorkouts: number;
}

function WeekSummaryCard({
    weekNumber,
    phase,
    isCurrent,
    progressPct,
    totalWorkouts,
    completedWorkouts,
}: WeekSummaryCardProps) {
    useThemeSubscription();
    const phaseStyle = getPhaseStyle(phase);

    const progressWidth = useSharedValue(0);
    React.useEffect(() => {
        progressWidth.value = withTiming(progressPct * 100, {
            duration: 800,
            easing: Easing.out(Easing.cubic),
        });
    }, [progressPct, progressWidth]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value}%` as `${number}%`,
    }));

    return (
        <View
            style={[
                styles.summaryCard,
                isCurrent && { borderColor: phaseStyle.accent },
            ]}
        >
            <View style={styles.summaryTopRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.summaryWeek}>Semana {weekNumber}</Text>
                    <Text style={styles.summaryTotal}>
                        {completedWorkouts} de {totalWorkouts} treinos concluídos
                    </Text>
                </View>

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

            <View style={styles.progressTrack}>
                <Animated.View
                    style={[
                        styles.progressFill,
                        { backgroundColor: phaseStyle.accent },
                        fillStyle,
                    ]}
                />
            </View>

            <View style={styles.summaryFootRow}>
                <Text style={styles.percentLabel}>
                    {Math.round(progressPct * 100)}% completo
                </Text>
                {isCurrent && (
                    <View style={styles.currentChip}>
                        <MaterialCommunityIcons
                            name="play-circle"
                            size={12}
                            color={phaseStyle.accent}
                        />
                        <Text style={[styles.currentChipText, { color: phaseStyle.accent }]}>
                            Semana atual
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    screen: {
        backgroundColor: semanticColors.canvas,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    headerSideBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        alignItems: 'center',
        gap: 2,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: semanticColors.textPrimary,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: semanticColors.textSecondary,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
    },
    centeredText: {
        color: semanticColors.textPrimary,
        fontSize: 14,
    },
    listContent: {
        paddingHorizontal: 14,
        paddingBottom: 120,
    },

    // summary card
    summaryCard: {
        backgroundColor: semanticColors.surface1,
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    summaryTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    summaryWeek: {
        fontSize: 22,
        fontWeight: '800',
        color: semanticColors.textPrimary,
    },
    summaryTotal: {
        fontSize: 12,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        marginTop: 4,
    },
    phasePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 999,
    },
    phaseDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    phaseLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    progressTrack: {
        height: 7,
        backgroundColor: semanticColors.borderSubtle,
        borderRadius: 999,
        overflow: 'hidden',
    },
    progressFill: {
        height: 7,
        borderRadius: 999,
    },
    summaryFootRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    percentLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: semanticColors.textSecondary,
    },
    currentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    currentChipText: {
        fontSize: 11,
        fontWeight: '700',
    },

    // empty
    emptyWrap: {
        paddingVertical: 50,
        alignItems: 'center',
        gap: 10,
    },
    emptyText: {
        color: semanticColors.textPrimary,
        fontSize: 15,
        fontWeight: '600',
    },
    emptySubtext: {
        color: semanticColors.textSecondary,
        fontSize: 13,
    },
}));
