import React, { useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { WorkoutCard } from '../../components/WorkoutCard';
import { useTrainingStore, useGamificationStore } from '../../stores';
import type { PlanWorkout } from '../../types/plan-overview.types';

// ─── Figma tokens ────────────────────────────────────────────────────────────
const BG = '#0E0E1F';
const CARD_BG = '#1C1C2E';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_TITLE = '#EBEBF5';
const TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const PROGRESS_TRACK = 'rgba(235, 235, 245, 0.1)';
const PROGRESS_FILL = '#00D4FF';

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatRange(start: string, end: string): string {
    if (!start || !end) return '';
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const sLabel = `${MONTH_PT[s.getMonth()]} ${s.getDate().toString().padStart(2, '0')}`;
    const eLabel = `${MONTH_PT[e.getMonth()]} ${e.getDate().toString().padStart(2, '0')}`;
    return `${sLabel} - ${eLabel}`;
}

function getTodayStrSaoPaulo(): string {
    const now = new Date();
    // UTC-3 mirrors the backend's SAO_PAULO_OFFSET_HOURS so completed/today
    // states match across server and client.
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const utc = now.getTime() + offsetMs;
    const sp = new Date(utc + -3 * 60 * 60 * 1000);
    const y = sp.getFullYear();
    const m = (sp.getMonth() + 1).toString().padStart(2, '0');
    const d = sp.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<WeekDetailRouteParams, 'WeekDetail'>>();
    const { weekNumber } = route.params;

    const planOverview = useTrainingStore((s) => s.planOverview);
    const badges = useGamificationStore((s) => s.badges) ?? [];

    const week = useMemo(
        () => planOverview?.weeks.find((w) => w.week_number === weekNumber) ?? null,
        [planOverview, weekNumber],
    );

    const todayStr = useMemo(() => getTodayStrSaoPaulo(), []);

    const handleStartWorkout = useCallback(
        (workout: PlanWorkout) => {
            const dayLabel = `Hoje ${new Date().getDate().toString().padStart(2, '0')}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
            const title = `${getWorkoutTypeName(workout.type)} - ${workout.distance_km.toFixed(1)}Km`;
            navigation.navigate('Running', {
                workoutId: workout.id,
                dayLabel,
                title,
                workoutBlocks: workout.instructions_json ?? [],
                mode: 'planned',
                targetPaceSeconds: undefined,
                targetDistanceKm: workout.distance_km,
            });
        },
        [navigation],
    );

    const renderItem = useCallback(
        ({ item }: { item: PlanWorkout }) => {
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
                    <WeekSummaryCard
                        weekNumber={week.week_number}
                        phaseLabel={week.phase_label}
                        progressPct={progressPct}
                        totalWorkouts={week.total_workouts}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <Text style={styles.emptyText}>Sem treinos nesta semana.</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </ScreenContainer>
    );
}

function ItemSeparator() {
    return <View style={{ height: 13 }} />;
}

function Header({ onBack, subtitle }: { onBack: () => void; subtitle: string }) {
    return (
        <View style={styles.header}>
            <Pressable
                onPress={onBack}
                style={styles.headerSideBtn}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
                hitSlop={12}
            >
                <Ionicons name="chevron-back" size={24} color="#00D4FF" />
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
    phaseLabel: string;
    progressPct: number;
    totalWorkouts: number;
}

function WeekSummaryCard({
    weekNumber,
    phaseLabel,
    progressPct,
    totalWorkouts,
}: WeekSummaryCardProps) {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
                Semana {weekNumber} - {phaseLabel}
            </Text>
            <View style={styles.progressTrack}>
                <View
                    style={[
                        styles.progressFill,
                        { width: `${Math.round(progressPct * 100)}%` },
                    ]}
                />
            </View>
            <Text style={styles.totalLabel}>Total Treinos: {totalWorkouts}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        backgroundColor: BG,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 16,
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
        fontSize: 16,
        fontWeight: '400',
        color: TEXT_TITLE,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '400',
        color: TEXT_SECONDARY,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    centeredText: {
        color: TEXT_TITLE,
        fontSize: 14,
    },
    listContent: {
        paddingHorizontal: 10,
        paddingBottom: 100,
    },
    summaryCard: {
        backgroundColor: CARD_BG,
        borderRadius: 15,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
        marginBottom: 15,
    },
    summaryTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: TEXT_PRIMARY,
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
    },
    emptyWrap: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: TEXT_SECONDARY,
        fontSize: 14,
    },
});
