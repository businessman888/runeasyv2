import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import * as Storage from '../utils/storage';
import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { AppIcon } from '../components/ui/AppIcon';
import { useResponsiveTheme } from '../theme/responsive';
import { useAuthStore, useGamificationStore, useTrainingStore, useFeedbackStore, useStatsStore, useNotificationStore, useWorkoutScopeStore, getDisplayName, getAvatarUrl } from '../stores';
import type { LatestActivityData } from '../stores/feedbackStore';
import { ResultCardsSkeleton, StackedResultCards, WorkoutResultCard } from '../components/home/results';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useStartWorkoutFlow } from '../hooks/useStartWorkoutFlow';
import { usePlanGenerationGate } from '../hooks/usePlanGenerationGate';
import { SegmentedTabs } from '../components/ui/SegmentedTabs';
import { FriendlyEmptyCard } from '../components/ui/FriendlyEmptyCard';
import { CircularProgress } from '../components/CircularProgress';
import { WorkoutCardSkeleton } from '../components/skeletons/ScreenSkeletons';
import { ScreenContainer } from '../components/ScreenContainer';
import { HomeFixedHeader } from '../components/HomeFixedHeader';
import { WorkoutCard } from '../components/WorkoutCard';
import { HomeFab } from '../components/HomeFab';
import { LevelCard } from '../components/level/LevelCard';
import { OverviewSection } from '../components/home/OverviewSection';
import { HomeRetrospectiveCard } from '../components/home/HomeRetrospectiveCard';
import { Patent } from '../components/patents/Patent';
import { getCurrentPatent } from '../utils/patents';
import { paceValueToSecondsPerKm, formatPaceLabel } from '../utils/pace';
import { useHealthKitStore } from '../stores/healthKitStore';
import { useHealthConnectStore } from '../stores/healthConnectStore';
import { useProFeature } from '../hooks/useProFeature';
import { UpgradeProCard } from '../components/upgrade/UpgradeProCard';
import { GlassTeaseOverlay } from '../components/upgrade/GlassTeaseOverlay';
import { ProCtaButton } from '../components/upgrade/ProCtaButton';
import { ProTeaseBadge } from '../components/upgrade/ProTeaseBadge';
import { PlanGeneratingOverlay } from '../components/loading/PlanGeneratingOverlay';
import { HomeInsightCarousel } from '../components/insight/HomeInsightCarousel';
import { InsightEntry } from '../components/insight/InsightEntry';
import { useWeeklyInsightStore } from '../stores/weeklyInsightStore';
import { useMesoInsightStore } from '../stores/mesoInsightStore';
import type { WorkoutData } from '../components/WorkoutCard';

import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';

// Stable reference so the memoized SegmentedTabs doesn't re-render on every
// parent re-render (e.g. while focus-effect fetches resolve).
const SCOPE_TABS: { key: 'plan' | 'activity'; label: string }[] = [
    { key: 'plan', label: 'Treinos' },
    { key: 'activity', label: 'Atividades' },
];

// Decorative skeleton shown to Free users behind the glass teaser — looks like
// a real generated workout to instigate "what's my plan?". Never interactive.
const MOCK_TEASE_WORKOUT: WorkoutData = {
    id: 'tease-mock',
    type: 'intervals',
    distance_km: 8,
    instructions_json: [{ type: 'main', distance_km: 8, pace_min: 5.0 }],
    status: 'pending',
};

// Semantic icon adapters backed by the modular Ionicons package.
function RunningIcon({ size = 32, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="running" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone={color === semanticColors.accent ? 'accent' : 'tertiary'} />;
}

function DistanceIcon({ size = 20, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="location" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone={color === semanticColors.accent ? 'accent' : 'secondary'} />;
}

function PaceIcon({ size = 20, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="trainingLoad" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone={color === semanticColors.accent ? 'accent' : 'secondary'} />;
}

function CalendarSmallIcon({ size = 20, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="calendar" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone="secondary" />;
}

function ShoeIcon({ size = 24, color = semanticColors.textOnAccent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="walking" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone={color === semanticColors.textOnAccent ? 'tertiary' : 'primary'} variant="filled" />;
}

function LockIcon({ size = 24, color = semanticColors.textTertiary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="lock" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone={color === semanticColors.textTertiary ? 'tertiary' : 'primary'} variant="filled" />;
}

function MoonIcon({ size = 32, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="sleep" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone="secondary" variant="filled" />;
}

function BedIcon({ size = 24, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <AppIcon name="sleep" size={size as 16 | 20 | 24 | 28 | 32 | 48} tone="secondary" />;
}

export function HomeScreen({ navigation }: any) {
    useThemeSubscription();
    const fabScrollY = useSharedValue(0);
    const handleHomeScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            fabScrollY.value = Math.max(0, event.contentOffset.y);
        },
    });
    const { user } = useAuthStore();
    // Responsividade tablet: layout aditivo. Phone (isTablet=false) renderiza o
    // caminho original idêntico — sem wrappers extras nem mudança de ordem.
    const r = useResponsiveTheme();
    const twoCol = r.isTablet && r.isLandscape;
    const { isProUser } = useProFeature();
    const { stats, badges, fetchStats, fetchBadges, isLoading: gamificationLoading } = useGamificationStore();
    const { upcomingWorkouts, fetchUpcomingWorkouts, isLoading: trainingLoading, today, nextWorkout: storeNextWorkout, fetchSchedule, clearScheduleData, schedule, retryPendingWorkouts, workouts: rawWorkouts, fetchWorkouts } = useTrainingStore();
    const {
        latestSummary, fetchLatestSummary,
        recentPlanActivities, recentPlanActivitiesLoading,
        recentActivityResults, recentActivityResultsLoading,
        fetchRecentActivities, retryFeedback,
    } = useFeedbackStore();
    // Activity id currently being re-requested via the coach card retry button.
    const [retryingActivityId, setRetryingActivityId] = useState<string | null>(null);
    const { scope, setScope } = useWorkoutScopeStore();
    const { summary, fetchSummary, isLoading: statsLoading } = useStatsStore();
    const { unreadCount, fetchUnreadCount } = useNotificationStore();
    const { startRun } = useStartWorkoutFlow();
    const initializeHealthKit = useHealthKitStore((s) => s.initialize);
    const syncHealthKitRecent = useHealthKitStore((s) => s.syncRecentIfConnected);
    const healthKitLastSyncedCount = useHealthKitStore((s) => s.lastSyncedCount);
    const clearHealthKitSyncedCount = useHealthKitStore((s) => s.clearLastSyncedCount);
    // Alimentam o convite de conexão: a sync do Apple Health é opt-in e estava
    // enterrada em Dispositivos, sem nenhuma pista na Home.
    const healthKitAvailable = useHealthKitStore((s) => s.isAvailable);
    const healthKitConnected = useHealthKitStore((s) => s.isConnected);
    // Android-only Health Connect counterparts; both stores no-op on the
    // other platform so the Promise.all stays platform-agnostic.
    const initializeHealthConnect = useHealthConnectStore((s) => s.initialize);
    const syncHealthConnectRecent = useHealthConnectStore((s) => s.syncRecentIfConnected);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [recoveryTimeLeft, setRecoveryTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const [recoveryProgress, setRecoveryProgress] = useState(0);
    const [retrospectiveReady, setRetrospectiveReady] = useState(false);
    // A busca é feita pelo <InsightEntry/> logo abaixo — aqui só lemos o
    // resultado, para os cards e a folha compartilharem uma única requisição.
    const weeklyInsight = useWeeklyInsightStore((s) => s.latest);
    const mesoInsight = useMesoInsightStore((s) => s.latest);

    // Plan generation overlay — driven by the shared gate hook (reads
    // trainingStore.generationStatus + polls while focused, independent of the
    // client's Pro flag, so it shows even right after a webhook upgrade).
    const { triggerPlanGeneration } = useOnboardingStore();
    const [planGenRetries, setPlanGenRetries] = useState(0);
    const generationTriggeredRef = useRef(false);

    const { isGenerating, isFailed, retry } = usePlanGenerationGate({
        onComplete: () => {
            const now = new Date();
            const startStr = new Date(now.getFullYear(), now.getMonth(), 1)
                .toISOString()
                .split('T')[0];
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 1);
            const endStr = endDate.toISOString().split('T')[0];
            void Promise.all([
                fetchUpcomingWorkouts(),
                fetchSchedule(startStr, endStr),
                fetchStats(),
            ]);
        },
    });

    const handleRetry = useCallback(async () => {
        if (planGenRetries >= 3) return;
        setPlanGenRetries((prev) => prev + 1);
        generationTriggeredRef.current = true;
        await retry();
    }, [planGenRetries, retry]);

    // Trigger plan generation if no workouts exist
    const checkAndTriggerGeneration = useCallback(async () => {
        // Free users don't have a plan — backend gating refuses generation,
        // and HomeScreen shows UpgradeProCard in place of WorkoutCard.
        if (!isProUser) {
            console.log('[HomeScreen] User is Free — skipping plan generation check');
            return;
        }

        // Guard: prevent concurrent/double triggers
        if (generationTriggeredRef.current) return;

        const userId = await Storage.getItemAsync('user_id');
        const authUserId = useAuthStore.getState().user?.id;
        console.log('[HomeScreen] checkAndTriggerGeneration — storage userId:', userId, '| auth store userId:', authUserId);
        if (!userId) return;

        // Desync guard: if storage userId differs from auth store userId, force re-auth
        if (authUserId && userId !== authUserId) {
            console.warn('[HomeScreen] userId desync detected — logging out to resync');
            await useAuthStore.getState().logout();
            return;
        }

        // Check if user has any workouts
        const workouts = useTrainingStore.getState().upcomingWorkouts;
        if (workouts && workouts.length > 0) return; // Plan already exists with workouts

        // Check if user has an active plan
        try {
            const response = await authedFetch(`${BASE_API_URL}/training/plan`, {
                headers: { 'x-user-id': userId },
            });

            if (!response.ok) {
                // Server error or network issue — do NOT trigger generation
                console.warn('[HomeScreen] Plan check returned status', response.status, '— skipping generation');
                return;
            }

            const result = await response.json();
            console.log('[HomeScreen] Plan check result — plan:', result.plan ? `id=${result.plan.id} status=${result.plan.generation_status}` : 'null');
            if (result.plan) {
                const status = result.plan.generation_status;

                if (status === 'complete') {
                    // Plan is ready, just no upcoming workouts — don't re-trigger
                    return;
                }

                if (status === 'generating') {
                    // Plan is generating — the gate hook shows the overlay + polls.
                    generationTriggeredRef.current = true;
                    return;
                }

                // status === 'failed' → fall through to trigger new generation
                console.log('[HomeScreen] Plan generation previously failed, re-triggering...');
            }
            // result.plan is null → user genuinely has no plan, trigger generation
        } catch (err) {
            // Network error — do NOT trigger generation, just log
            console.warn('[HomeScreen] Plan check failed (network error), skipping generation:', err);
            return;
        }

        // No plan OR plan failed — trigger generation (set guard BEFORE async call)
        generationTriggeredRef.current = true;
        console.log('[HomeScreen] No plan found, triggering AI generation for userId:', userId);

        const planId = await triggerPlanGeneration();
        if (planId) {
            // Refresh plan status so the gate hook shows the overlay + polls.
            await useTrainingStore.getState().fetchPlan();
        } else {
            // Check if it was a 400 (onboarding data missing) — session is inconsistent, force logout
            const status = useOnboardingStore.getState().lastGenerationStatus;
            if (status === 400) {
                console.warn('[HomeScreen] Plan generation returned 400 (onboarding missing) — forcing logout to resync session');
                generationTriggeredRef.current = false;
                await useAuthStore.getState().logout();
                return;
            }
            generationTriggeredRef.current = false; // Allow retry on error
        }
    }, [triggerPlanGeneration, isProUser]);

    // Use useFocusEffect to refetch data when screen gains focus (revalidate on every visit)
    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                // Clear stale data immediately to show skeleton
                clearScheduleData();
                setIsInitialLoading(true);

                // Use dynamic dates: start of current month for calendar history, end 1 month ahead
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const startStr = startOfMonth.toISOString().split('T')[0];
                const endDate = new Date(now);
                endDate.setMonth(endDate.getMonth() + 1);
                const endStr = endDate.toISOString().split('T')[0];

                await Promise.all([
                    fetchStats(),
                    fetchBadges(),
                    fetchUpcomingWorkouts(),
                    fetchLatestSummary(),
                    fetchRecentActivities('plan'),
                    fetchRecentActivities('activity'),
                    fetchWorkouts(startStr, endStr),
                    fetchSummary(),
                    fetchUnreadCount(),
                    fetchSchedule(startStr, endStr),
                    retryPendingWorkouts(),
                    // iOS-only Apple HealthKit sync (no-op on Android / if not connected)
                    initializeHealthKit().then(() => syncHealthKitRecent(7)),
                    // Android-only Health Connect sync (no-op on iOS / if not connected)
                    initializeHealthConnect().then(() => syncHealthConnectRecent(7)),
                ]);

                // Check if retrospective is ready
                try {
                    const userId = await Storage.getItemAsync('user_id');
                    if (userId) {
                        const response = await authedFetch(`${BASE_API_URL}/training/retrospective/ready`, {
                            headers: { 'x-user-id': userId },
                        });
                        const result = await response.json();
                        setRetrospectiveReady(result.isReady || false);
                    }
                } catch (e) {
                    console.log('Retrospective check failed:', e);
                }

                setIsInitialLoading(false);

                // After initial load, check if we need to trigger plan generation
                checkAndTriggerGeneration();
            };
            loadData();
        }, [])
    );

    // Auto-dismiss the Apple Health sync banner after a few seconds
    useEffect(() => {
        if (healthKitLastSyncedCount > 0) {
            const timer = setTimeout(() => {
                clearHealthKitSyncedCount();
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [healthKitLastSyncedCount, clearHealthKitSyncedCount]);

    // Recovery countdown timer
    useEffect(() => {
        const updateRecoveryTimer = () => {
            const now = new Date();
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            const diffMs = endOfDay.getTime() - now.getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            setRecoveryTimeLeft({ hours, minutes, seconds });

            // Calculate progress: percentage of day completed
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const totalDayMs = 24 * 60 * 60 * 1000;
            const elapsedMs = now.getTime() - startOfDay.getTime();
            setRecoveryProgress(Math.min((elapsedMs / totalDayMs) * 100, 100));
        };

        updateRecoveryTimer();
        const interval = setInterval(updateRecoveryTimer, 1000);
        return () => clearInterval(interval);
    }, []);

    // Use API data: today from store is authoritative
    const todayData = today;
    const nextWorkout = storeNextWorkout;

    // Mesmo padrão do `CalendarScreen.getPlanStatusForDay`: o backend
    // `getScheduleWithStatus` faz fallback do dia para `type: 'workout'` quando
    // o usuário loga uma corrida manual/livre num dia originalmente de
    // recovery (workoutsByDate prefere plan, senão usa o manual/free). Na aba
    // Treinos, esses dias devem se comportar como recovery — a corrida livre
    // pertence à aba Atividades. Isso evita que um `free_run` apareça como se
    // fosse treino do plano em "Seus treinos" e no header semanal.
    const rawTodayWorkout = todayData?.type === 'workout' ? todayData.workout : null;
    const todayHasNonPlanFallback = !!rawTodayWorkout
        && (rawTodayWorkout.source === 'manual' || rawTodayWorkout.source === 'free');

    const isRecoveryDay = todayData?.type === 'recovery' || todayHasNonPlanFallback;
    const todayWorkout = todayHasNonPlanFallback ? null : rawTodayWorkout;

    // Today's manual/free activities (Atividades tab). Read from rawWorkouts —
    // ungated — so Free users still see their own logged activities; filtering
    // to manual/free also excludes any orphan plan workout.
    const todayDateForActivities = new Date();
    const todayStr = `${todayDateForActivities.getFullYear()}-${String(todayDateForActivities.getMonth() + 1).padStart(2, '0')}-${String(todayDateForActivities.getDate()).padStart(2, '0')}`;
    const activitySourceRank = (s?: string | null) => (s === 'manual' ? 0 : s === 'free' ? 1 : 2);
    const todayActivities = (rawWorkouts ?? [])
        .filter(
            (w) =>
                w.scheduled_date === todayStr &&
                (w.source === 'manual' ||
                    (w.source === 'free' && w.status === 'completed')),
        )
        .sort((a, b) => activitySourceRank(a.source) - activitySourceRank(b.source));

    // Refetch feedback when workout status changes to 'completed'
    useEffect(() => {
        if (todayData?.status === 'completed') {
            // Delay to allow AI feedback to be generated
            const refreshResults = () => {
                fetchRecentActivities('plan');
                fetchRecentActivities('activity');
            };
            const timer = setTimeout(refreshResults, 2000);

            // Retry after 5 more seconds if still loading or no data
            const retryTimer = setTimeout(refreshResults, 7000);

            return () => {
                clearTimeout(timer);
                clearTimeout(retryTimer);
            };
        }
    }, [todayData?.status]);

    const currentLevel = stats?.current_level ?? 1;
    const totalPoints = stats?.total_points ?? 0;
    const pointsToNext = stats?.points_to_next_level ?? 100;
    const currentStreak = stats?.current_streak ?? 0;

    // Coach-analysis card premium styling. Free SEMPRE recebe o estilo
    // premium (borda cyan + glow) — independente de plan-activity órfã —
    // porque o body sempre mostra o upsell, nunca o feedback real.
    // Pro users without a completed plan workout get the "complete first workout" hint
    // (estilo neutro, sem highlight premium).
    const isFreeAiLock = !isProUser;

    // Check if workout is for today (used for button enable/disable)
    const isWorkoutToday = (dateStr: string): boolean => {
        const workoutDate = new Date(dateStr + 'T00:00:00');
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        workoutDate.setHours(0, 0, 0, 0);
        return workoutDate.getTime() === todayDate.getTime();
    };

    const handleStartWorkout = async () => {
        const now = new Date();
        const dayLabel = `Hoje ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const title = todayWorkout
            ? `${getWorkoutTypeName(todayWorkout.type)} - ${todayWorkout.distance_km.toFixed(1)}Km`
            : 'Meu Treino';

        const src = (todayWorkout as any)?.source as ('plan' | 'manual' | 'free' | undefined);
        const mode = src === 'manual' ? 'manual' : 'planned';

        startRun({
            workoutId: todayWorkout?.id,
            dayLabel,
            title,
            workoutBlocks: todayWorkout?.instructions_json ?? [],
            mode,
            targetPaceSeconds: src === 'manual' ? (todayWorkout as any)?.target_pace_seconds : undefined,
            targetDistanceKm: src === 'manual' ? todayWorkout?.distance_km : undefined,
        });
    };

    const handleStartFreeRun = () => {
        startRun({ mode: 'free' });
    };

    const handleOpenManualConfig = () => {
        navigation.navigate('ManualWorkoutConfig');
    };

    const userName = getDisplayName(user) || 'Corredor';
    const profilePic = getAvatarUrl(user);

    const getWorkoutTypeName = (type: string): string => {
        const typeNames: Record<string, string> = {
            easy_run: 'Rodagem Leve',
            long_run: 'Longão',
            intervals: 'Intervalado',
            tempo: 'Tempo Run',
            recovery: 'Recuperação',
        };
        return typeNames[type] || type;
    };

    const formatWorkoutDate = (dateStr: string): string => {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.getTime() === today.getTime()) {
            return 'Hoje';
        } else if (date.getTime() === tomorrow.getTime()) {
            return 'Amanhã';
        } else {
            return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
        }
    };

    // Tap on an activity card (Atividades tab). Completed → run summary;
    // pending manual → start it (free runs aren't "started" from a card).
    //
    // Dumb redirect: only `workoutId` + `mode`. RunSummaryScreen handles
    // hydration and outdoor/treadmill branching on its own.
    const handleActivityCardPress = (w: any) => {
        const src: 'plan' | 'manual' | 'free' | undefined = w?.source;
        if (w?.status === 'completed') {
            // Sem id válido evitamos a navegação — RunSummary abriria vazio
            // (sem cold-start loading) e o usuário veria o tap como "sem ação".
            if (!w?.id) return;
            navigation.navigate('RunSummary', {
                workoutId: w.id,
                mode: src === 'manual' ? 'manual' : 'free',
            });
            return;
        }
        if (src === 'manual') {
            const n = new Date();
            const dayLabel = `Hoje ${n.getDate().toString().padStart(2, '0')}/${(n.getMonth() + 1).toString().padStart(2, '0')}`;
            startRun({
                workoutId: w.id,
                dayLabel,
                title: `${getWorkoutTypeName(w.type)} - ${(w.distance_km ?? 0).toFixed(1)}Km`,
                workoutBlocks: w.instructions_json ?? [],
                mode: 'manual',
                targetPaceSeconds: w.target_pace_seconds ?? undefined,
                targetDistanceKm: w.distance_km ?? undefined,
            });
        }
    };

    // Preserves the existing copy, retry lifecycle and navigation targets while
    // delegating presentation to the Figma-aligned result card.
    const renderResultCard = (data: LatestActivityData, _index: number, isActive: boolean) => {
        const source = data.workout_source;
        const isPlanWorkout = source === 'plan';
        const status = data.feedback_status;
        const isCoachReady = isPlanWorkout && !!data.feedback && status !== 'failed' && status !== 'skipped';
        const isCoachFailed = isPlanWorkout && (status === 'failed' || status === 'skipped');
        const activityId = data.activity?.id ?? null;
        const canRetryCoach = isCoachFailed && !!data.workout_id && !!activityId;
        const isRetrying = !!activityId && retryingActivityId === activityId;
        const hasSummaryTarget = !!data.workout_id;
        const hasCoachTarget = !!data.feedback?.id;
        const canOpen = isPlanWorkout ? (isCoachReady && hasCoachTarget) : hasSummaryTarget;
        const isButtonEnabled = (canOpen || canRetryCoach) && !isRetrying;

        const cardTitle = isPlanWorkout ? 'Análise do Treinador' : 'Resumo do treino';
        const cardCta = isPlanWorkout
            ? (isCoachReady
                ? 'Ver feedback completo'
                : isRetrying
                    ? 'Reenviando…'
                    : isCoachFailed
                        ? (status === 'skipped' ? 'Análise indisponível — tentar de novo' : 'Tentar novamente')
                        : 'Análise em preparo...')
            : (hasSummaryTarget ? 'Ver resumo do treino' : 'Resumo indisponível');

        const handleRetryCoach = async () => {
            if (!canRetryCoach || isRetrying) return;
            setRetryingActivityId(activityId);
            try {
                await retryFeedback({
                    workoutId: data.workout_id as string,
                    activityId: activityId as string,
                });
                setTimeout(() => fetchRecentActivities('plan'), 3000);
                setTimeout(() => fetchRecentActivities('plan'), 9000);
            } finally {
                setTimeout(() => setRetryingActivityId(null), 9000);
            }
        };

        const handleOpen = () => {
            if (isPlanWorkout && isCoachFailed) {
                void handleRetryCoach();
                return;
            }
            if (!canOpen) return;
            if (isPlanWorkout) {
                navigation.navigate('CoachAnalysis', {
                    feedbackId: data.feedback?.id,
                    activityId: data.activity?.id,
                });
            } else {
                navigation.navigate('RunSummary', {
                    workoutId: data.workout_id as string,
                    mode: source === 'manual' ? 'manual' : 'free',
                });
            }
        };

        return (
            <WorkoutResultCard
                data={data}
                title={cardTitle}
                ctaLabel={cardCta}
                isButtonEnabled={isButtonEnabled}
                isRetrying={isRetrying}
                isActive={isActive}
                onPress={handleOpen}
            />
        );
    };
    const getWorkoutPace = (workout: any): string => {
        if (workout.instructions_json && workout.instructions_json.length > 0) {
            const segs = workout.instructions_json;
            // Prefere o bloco principal; num intervalado (repeat), o pace-alvo mora
            // em work.pace_min. Cai para qualquer segmento com pace informado.
            const mainBlock =
                segs.find((i: any) => i.type === 'main' || i.type === 'repeat') || segs[0];
            // pace_min pode estar em segundos/km (novo) ou decimal min/km (legado);
            // o util normaliza e formata como "m:ss". Estimativa compacta → só o alvo.
            const paceRaw = mainBlock?.pace_min ?? mainBlock?.work?.pace_min;
            const paceSecs = paceValueToSecondsPerKm(paceRaw);
            if (paceSecs != null) {
                return formatPaceLabel(paceSecs);
            }
        }
        const defaultPaces: Record<string, string> = {
            easy_run: '6:30',
            long_run: '6:00',
            intervals: '5:00',
            tempo: '5:30',
            recovery: '7:00',
        };
        return defaultPaces[workout.type] || '6:00';
    };

    const formatTimeUnit = (value: number): string => {
        return value.toString().padStart(2, '0');
    };

    // Determine the main workout to display: today's workout takes priority
    const hasTodayWorkout = todayWorkout !== null;
    const mainWorkout = hasTodayWorkout ? { ...todayWorkout, scheduled_date: todayData?.date } : nextWorkout;

    // Button is enabled only if there's a workout for TODAY that is still pending
    const isTodayWorkoutPending = hasTodayWorkout && todayData?.status === 'pending';
    const isButtonEnabled = isTodayWorkoutPending;

    // ── Blocos de conteúdo (extraídos p/ reuso entre phone-flat e tablet 2-col) ──
    // Banners do topo (sempre full-width, acima de tudo).
    const bannersBlock = (
        <>
                {/* Apple Health sync banner — shown for 4s after a successful sync */}
                {healthKitLastSyncedCount > 0 && (
                    <View style={styles.healthKitBanner}>
                        <AppIcon name="check" size={20} tone="success" variant="filled" />
                        <Text style={styles.healthKitBannerText}>
                            {healthKitLastSyncedCount === 1
                                ? '1 nova corrida sincronizada do Apple Health'
                                : `${healthKitLastSyncedCount} novas corridas sincronizadas do Apple Health`}
                        </Text>
                    </View>
                )}

                {/* Convite pra conectar o Apple Health. Sem isto, treinos feitos
                    no app nativo do Apple Watch nunca chegam ao RunEasy — a sync
                    existe e funciona, mas fica desligada e sem nenhum sinal na
                    UI de que existe um botão a apertar. Ver AUDITORIA §P4. */}
                {healthKitAvailable && !healthKitConnected && (
                    <TouchableOpacity
                        style={styles.healthKitConnectBanner}
                        activeOpacity={0.8}
                        onPress={() =>
                            // `apple` é o provider do HealthKit (o `appleWatch` é
                            // o companion app via WatchConnectivity, outro fluxo).
                            navigation.navigate('DeviceConnect', { provider: 'apple' })
                        }
                    >
                        <AppIcon name="workout" size={20} tone="accent" />
                        <Text style={styles.healthKitConnectBannerText}>
                            Treina pelo app da Apple no relógio? Conecte a Saúde para
                            importar essas corridas.
                        </Text>
                        <AppIcon name="chevronForward" size={16} tone="secondary" />
                    </TouchableOpacity>
                )}

                {/* A retrospectiva fecha um ciclo inteiro e, enquanto estiver
                    pronta, precede os insights recorrentes na hierarquia. */}
                {retrospectiveReady && (
                    <HomeRetrospectiveCard
                        onPress={() => navigation.navigate('Retrospective')}
                    />
                )}

                {/* Rede de segurança persistente para quem fechou a folha sem
                    abrir. Quando os resumos coincidem, mantém a mesma leitura
                    horizontal e os mesmos indicadores do sheet. */}
                {(weeklyInsight || mesoInsight) && (
                    <HomeInsightCarousel
                        weekly={weeklyInsight}
                        meso={mesoInsight}
                        onOpenWeekly={() => navigation.navigate('WeeklyInsight')}
                        onOpenMeso={() => navigation.navigate('MesoInsight')}
                    />
                )}

        </>
    );

    // Hero: Level + Overview semanal (coluna esquerda no tablet landscape).
    const heroBlock = (
        <>
                {/* Level Card */}
                <LevelCard
                    stats={stats as any}
                    variant="home"
                    patentSlot={<Patent patent={getCurrentPatent(currentLevel)} size={50} />}
                    patentName={getCurrentPatent(currentLevel).name}
                />

                {/* ── Overview semanal ──────────────────────────────────────────── */}
                <OverviewSection />
        </>
    );

    // Principal: tabs Treinos|Atividades + conteúdo do escopo (coluna direita).
    const mainBlock = (
        <>
                {/* ── Treinos | Atividades ─────────────────────────────────────── */}
                <SegmentedTabs
                    tabs={SCOPE_TABS}
                    activeKey={scope}
                    onChange={setScope}
                    style={styles.scopeTabs}
                />

                {scope === 'plan' ? (
                <>
                {/* ── Seus treinos ─────────────────────────────────────────────── */}
                <View>
                    <Text style={styles.sectionTitle}>Seus treinos</Text>

                {/* Recovery Card - Pro only (Free has no plan, sees UpgradeProCard below) */}
                {isProUser && isRecoveryDay && (
                    <View style={styles.recoveryCard}>
                        <View style={styles.recoveryHeader}>
                            <View style={styles.recoveryBadge}>
                                <BedIcon size={16} color={semanticColors.textSecondary} />
                                <Text style={styles.recoveryBadgeText}>Dia de Descanso</Text>
                            </View>
                            <MoonIcon size={32} color={semanticColors.textSecondary} />
                        </View>

                        <Text style={styles.recoveryTitle}>Recuperação Ativa</Text>
                        <Text style={styles.recoverySubtitle}>
                            Seu corpo está se recuperando. Descanse bem para o próximo treino!
                        </Text>

                        {/* Countdown Timer */}
                        <View style={styles.recoveryTimerContainer}>
                            <Text style={styles.recoveryTimerLabel}>Tempo restante hoje</Text>
                            <View style={styles.recoveryTimer}>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.hours)}</Text>
                                    <Text style={styles.timerLabel}>horas</Text>
                                </View>
                                <Text style={styles.timerSeparator}>:</Text>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.minutes)}</Text>
                                    <Text style={styles.timerLabel}>min</Text>
                                </View>
                                <Text style={styles.timerSeparator}>:</Text>
                                <View style={styles.timerUnit}>
                                    <Text style={styles.timerValue}>{formatTimeUnit(recoveryTimeLeft.seconds)}</Text>
                                    <Text style={styles.timerLabel}>seg</Text>
                                </View>
                            </View>
                        </View>

                        {/* Recovery Progress Bar */}
                        <View style={styles.recoveryProgressContainer}>
                            <View style={styles.recoveryProgressBar}>
                                <View style={[styles.recoveryProgressFill, { width: `${recoveryProgress}%` }]} />
                            </View>
                            <Text style={styles.recoveryProgressText}>
                                {Math.round(recoveryProgress)}% do dia concluído
                            </Text>
                        </View>

                        {/* Next Workout Preview (secondary) */}
                        {nextWorkout && (
                            <View style={styles.nextWorkoutPreview}>
                                <CalendarSmallIcon size={16} color={semanticColors.textSecondary} />
                                <Text style={styles.nextWorkoutPreviewText}>
                                    Próximo: <Text style={styles.nextWorkoutPreviewBold}>
                                        {getWorkoutTypeName(nextWorkout.type)}
                                    </Text> - {formatWorkoutDate(nextWorkout.scheduled_date)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Free users see a blurred mock workout (teaser) with a glass
                    overlay in place of the real workout. Pro path unchanged. */}
                {!isProUser ? (
                    <GlassTeaseOverlay
                        pressable
                        blurIntensity={30}
                        overlay={
                            <View style={styles.homeTeaseOverlay}>
                                <ProTeaseBadge variant="shield" />
                                <Text style={styles.homeTeaseTitle}>
                                    Você está usando só uma fração do RunEasy.
                                </Text>
                                <ProCtaButton label="Descobrir o que falta" />
                            </View>
                        }
                    >
                        <WorkoutCard
                            workout={MOCK_TEASE_WORKOUT}
                            isToday
                            isCompleted={false}
                            onStartWorkout={() => {}}
                            allBadges={[]}
                        />
                    </GlassTeaseOverlay>
                ) : (
                    <>
                        {/* Workout Card - Show when it's NOT a recovery day and there's a workout to show */}
                        {!isRecoveryDay && mainWorkout && (
                            <WorkoutCard
                                key={`main-workout-${mainWorkout.id || mainWorkout.scheduled_date}`}
                                workout={mainWorkout as any}
                                isToday={hasTodayWorkout}
                                isCompleted={todayData?.status === 'completed' && hasTodayWorkout}
                                canStart={hasTodayWorkout && todayData?.status === 'pending'}
                                onStartWorkout={handleStartWorkout}
                                allBadges={badges}
                            />
                        )}

                        {/* Skeleton enquanto o treino carrega no cold start — evita o
                            flash de "Nenhum treino agendado" antes dos dados chegarem. */}
                        {!mainWorkout && !isRecoveryDay && (isInitialLoading || trainingLoading) && (
                            <WorkoutCardSkeleton />
                        )}

                        {/* No Workout Card - Only show if no recovery and no workout (após carregar) */}
                        {!mainWorkout && !isRecoveryDay && !isInitialLoading && !trainingLoading && (
                            <View style={styles.workoutCard}>
                                <View style={styles.lockedContent}>
                                    <RunningIcon size={48} color={semanticColors.textTertiary} />
                                    <Text style={styles.lockedText}>Nenhum treino agendado</Text>
                                </View>
                            </View>
                        )}
                    </>
                )}
                </View>
                {/* ── fim Seus treinos ─────────────────────────────────────────── */}

                <Text style={[styles.sectionTitle, styles.resultsSectionTitle]}>Resultados</Text>

                {/* Análise / resultados de treino do plano.
                    Free: SEMPRE upsell premium — nunca exibe dados reais, mesmo
                    que exista plan-activity órfã (treino feito antes do gating
                    ou quando ainda era Pro). Isso corrige o vazamento em que o
                    card de "Análise do Treinador" aparecia com pace/eficiência
                    no override Free.
                    Pro: feedback real ou estado bloqueado. */}
                <View style={!isProUser ? [styles.aiCard, isFreeAiLock && styles.aiCardPremium] : styles.resultStackContainer}>
                    {!isProUser ? (
                        /* Free: upsell premium do Coach (independente de plan-activity órfão). */
                        <View style={styles.lockedContainer}>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitlePremium}>Exclusivo do Coach AI</Text>
                                </View>
                                <View style={styles.aiLockBadge}>
                                    <AppIcon name="lock" size={20} tone="accent" variant="filled" />
                                </View>
                            </View>
                            <View style={styles.lockedContentPremium}>
                                <View style={styles.aiLockBadgeLarge}>
                                    <AppIcon name="lock" size={32} tone="accent" variant="filled" />
                                </View>
                                <Text style={styles.lockedTextPremium}>
                                    Torne-se Pro para alavancar seu nível com acompanhamento real do seu Coach
                                </Text>
                            </View>
                        </View>
                    ) : recentPlanActivitiesLoading ? (
                        <ResultCardsSkeleton />
                    ) : recentPlanActivities.length > 0 ? (
                        <StackedResultCards results={recentPlanActivities} renderCard={renderResultCard} />
                    ) : (
                        /* Pro without a completed workout yet. */
                        <View style={styles.lockedContainer}>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>Funcionalidade bloqueada</Text>
                                </View>
                                <LockIcon size={32} color={semanticColors.textTertiary} />
                            </View>
                            <View style={styles.lockedContent}>
                                <LockIcon size={48} color={semanticColors.textTertiary} />
                                <Text style={styles.lockedText}>
                                    Complete o primeiro treino para desbloquear
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
                </>
                ) : (
                <>
                {/* ── Suas atividades (manuais + livres do dia) ────────────────── */}
                <View>
                    <Text style={styles.sectionTitle}>Seus treinos</Text>
                    {todayActivities.length > 0 ? (
                        todayActivities.map((w) => (
                            <View key={`home-activity-${w.id}`} style={styles.activityCardSpacing}>
                                <WorkoutCard
                                    workout={w as any}
                                    isToday={true}
                                    isCompleted={w.status === 'completed'}
                                    canStart={w.source === 'manual' && w.status === 'pending'}
                                    onStartWorkout={() => handleActivityCardPress(w)}
                                    allBadges={badges}
                                />
                            </View>
                        ))
                    ) : (
                        <FriendlyEmptyCard
                            icon="walk-outline"
                            title="Nenhuma atividade hoje"
                            subtitle="Suas corridas livres e treinos manuais do dia aparecem aqui."
                        />
                    )}
                </View>

                {/* Resultados das atividades (resumo da corrida, sem feedback do Coach) */}
                <Text style={[styles.sectionTitle, styles.resultsSectionTitle]}>Resultados</Text>
                {recentActivityResultsLoading ? (
                    <ResultCardsSkeleton />
                ) : recentActivityResults.length > 0 ? (
                    <StackedResultCards results={recentActivityResults} renderCard={renderResultCard} />
                ) : (
                    <FriendlyEmptyCard
                        icon="stats-chart-outline"
                        title="Nenhum resultado ainda"
                        subtitle="Os resumos das suas corridas aparecem aqui após você treinar."
                        style={{ marginTop: spacing.lg }}
                    />
                )}
                </>
                )}
        </>
    );

    return (
        <ScreenContainer style={{ paddingTop: 0 }}>
            <HomeFixedHeader
                currentStreak={currentStreak}
                schedule={schedule}
                unreadCount={unreadCount}
                profilePic={profilePic}
                userName={userName}
                isProUser={isProUser}
                isLoading={isInitialLoading}
                onPressProfile={() => navigation.navigate('Settings')}
                onPressNotifications={() => navigation.navigate('Notifications')}
            />

            <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                onScroll={handleHomeScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
            >
                {/* Phone: ordem plana original (idêntico). Tablet: coluna de leitura
                    centralizada; landscape divide hero/principal em 2 colunas. */}
                {r.isTablet ? (
                    <View style={[styles.tabletInner, twoCol && styles.tabletInnerWide]}>
                        {bannersBlock}
                        {twoCol ? (
                            <View style={styles.twoColRow}>
                                <View style={styles.colLeft}>{heroBlock}</View>
                                <View style={styles.colRight}>{mainBlock}</View>
                            </View>
                        ) : (
                            <>
                                {heroBlock}
                                {mainBlock}
                            </>
                        )}
                    </View>
                ) : (
                    <>
                        {bannersBlock}
                        {heroBlock}
                        {mainBlock}
                    </>
                )}
            </Animated.ScrollView>


            <HomeFab
                onPressFreeRun={handleStartFreeRun}
                onPressManual={handleOpenManualConfig}
                scrollY={fabScrollY}
            />

            {/* Plan Generation Overlay — top layer (below only the floating tab bar) */}
            {(isGenerating || isFailed) && (
                <PlanGeneratingOverlay
                    mode={isFailed ? 'error' : 'generating'}
                    onRetry={handleRetry}
                    canRetry={planGenRetries < 3}
                />
            )}

            {/*
              Insights: busca os dados (para o card acima e para a folha) e abre
              o carrossel quando há resumo novo não visto — o semanal, o de
              mesociclo, ou os dois lado a lado. Montado na home porque é a
              primeira tela após os gates de auth/onboarding.
            */}
            <InsightEntry />
        </ScreenContainer >
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: 120,
        gap: spacing.lg,
    },

    // ── Tablet (aditivo; phone nunca usa estes estilos) ────────────────────────
    // Coluna de leitura centralizada (portrait) — evita conteúdo esticado.
    tabletInner: {
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        gap: spacing.lg,
    },
    // Landscape: usa mais largura para acomodar as 2 colunas.
    tabletInnerWide: {
        maxWidth: 1100,
    },
    twoColRow: {
        flexDirection: 'row',
        gap: spacing.xl,
        alignItems: 'flex-start',
    },
    colLeft: {
        flex: 1,
        gap: spacing.lg,
    },
    colRight: {
        flex: 1.25,
        gap: spacing.lg,
    },

    // Recovery Card
    recoveryCard: {
        backgroundColor: semanticColors.surface1,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    recoveryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    recoveryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.surface2,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    recoveryBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontFamily: fonts.semibold,
        color: semanticColors.textSecondary,
    },
    recoveryTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    recoverySubtitle: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        lineHeight: 20,
    },
    recoveryTimerContainer: {
        alignItems: 'center',
        paddingVertical: spacing.md,
    },
    recoveryTimerLabel: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        marginBottom: spacing.sm,
    },
    recoveryTimer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    timerUnit: {
        alignItems: 'center',
    },
    timerValue: {
        fontSize: 32,
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
        fontVariant: ['tabular-nums'],
    },
    timerLabel: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
    },
    timerSeparator: {
        fontSize: 28,
        fontFamily: fonts.bold,
        color: semanticColors.textTertiary,
        marginBottom: 16,
    },
    recoveryProgressContainer: {
        gap: spacing.sm,
    },
    recoveryProgressBar: {
        height: 8,
        backgroundColor: semanticColors.surface3,
        borderRadius: 4,
        overflow: 'hidden',
    },
    recoveryProgressFill: {
        height: '100%',
        backgroundColor: semanticColors.textSecondary,
        borderRadius: 4,
    },
    recoveryProgressText: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        textAlign: 'center',
    },
    nextWorkoutPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginTop: spacing.sm,
    },
    nextWorkoutPreviewText: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
    },
    nextWorkoutPreviewBold: {
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
    },

    // Section title — "Seus treinos" (Figma: Inter 600 15px #EBEBF5, x:17 y:8.5)
    sectionTitle: {
        fontSize: 15,
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
        marginLeft: 17,
        marginBottom: 11,
    },
    resultsSectionTitle: {
        marginTop: spacing.lg,
    },

    // "Treinos | Atividades" tabs above the workouts/results sections
    scopeTabs: {
        marginHorizontal: 17,
        marginBottom: spacing.lg,
    },

    // Glass teaser overlay (Free) — sits over the blurred mock workout
    homeTeaseOverlay: {
        alignItems: 'center',
        gap: spacing.lg,
    },
    homeTeaseTitle: {
        color: semanticColors.textPrimary,
        fontFamily: fonts.extrabold,
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: -0.3,
        textAlign: 'center',
    },

    // Spacing between stacked manual/free activity cards (Atividades tab)
    activityCardSpacing: {
        marginBottom: spacing.base,
    },

    // Workout Card (legacy — kept for the "no workout" empty state)
    workoutCard: {
        backgroundColor: semanticColors.surface1,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    workoutHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    proximoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.accentSubtle,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    proximoDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: semanticColors.accent,
    },
    proximoText: {
        fontSize: typography.fontSizes.xs,
        fontFamily: fonts.semibold,
        color: semanticColors.accent,
    },
    runnerIcon: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.lg,
        backgroundColor: semanticColors.surface2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    runnerEmoji: {
        fontSize: 24,
    },
    workoutTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    workoutTime: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
    },
    workoutTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    workoutStats: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    statBox: {
        flex: 1,
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        gap: spacing.sm,
    },
    statHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    statIcon: {
        fontSize: 14,
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
    },
    statValue: {
        fontSize: typography.fontSizes.xl,
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    statUnit: {
        fontSize: typography.fontSizes.sm,
        fontFamily: fonts.regular,
        color: semanticColors.textTertiary,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.accent,
        borderRadius: borderRadius.xl,
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
    },
    startButtonDisabled: {
        backgroundColor: semanticColors.surface3,
        opacity: 0.7,
        shadowOpacity: 0,
        elevation: 0,
    },
    startIcon: {
        fontSize: 18,
    },
    startButtonText: {
        fontSize: typography.fontSizes.base,
        fontFamily: fonts.bold,
        color: semanticColors.textOnAccent,
    },
    startButtonTextDisabled: {
        color: semanticColors.textTertiary,
    },

    resultStackContainer: {
        width: '100%',
    },

    // AI Card
    aiCard: {
        backgroundColor: semanticColors.surface1,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.lg,
    },
    // Premium accent for the Free Coach-analysis upsell card
    aiCardPremium: {
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    aiLoadingContainer: {
        padding: spacing.md,
    },
    aiHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    aiTitle: {
        fontSize: typography.fontSizes.lg,
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    aiSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        marginTop: 2,
    },
    aiIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiEmoji: {
        fontSize: 24,
    },
    aiStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    aiPaceSection: {
        gap: spacing.sm,
    },
    aiPace: {
        fontSize: typography.fontSizes['3xl'],
        fontFamily: fonts.bold,
        color: semanticColors.textPrimary,
    },
    aiPaceUnit: {
        fontSize: typography.fontSizes.sm,
        fontFamily: fonts.regular,
        color: semanticColors.textTertiary,
    },
    efficiencyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: semanticColors.successSubtle,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
        alignSelf: 'flex-start',
    },
    efficiencyIcon: {
        fontSize: 12,
    },
    efficiencyText: {
        fontSize: typography.fontSizes.xs,
        fontFamily: fonts.bold,
        color: colors.success,
    },
    miniChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        height: 48,
    },
    bar: {
        width: 8,
        backgroundColor: semanticColors.surface3,
        borderRadius: 4,
    },
    barActive: {
        width: 8,
        backgroundColor: semanticColors.accent,
        borderRadius: 4,
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
    },
    feedbackButtonText: {
        fontSize: typography.fontSizes.base,
        fontFamily: fonts.medium,
        color: semanticColors.textPrimary,
    },
    feedbackArrow: {
        fontSize: typography.fontSizes.lg,
        color: semanticColors.accent,
    },
    // Locked state styles
    lockedContainer: {
        width: '100%',
    },
    lockedContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
        gap: spacing.md,
    },
    lockedText: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        textAlign: 'center' as const,
    },
    // Premium locked state (Free Coach-analysis upsell)
    aiSubtitlePremium: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        fontFamily: fonts.semibold,
        marginTop: 3,
    },
    aiLockBadge: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.full,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        backgroundColor: semanticColors.accentSubtle,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    lockedContentPremium: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
        gap: spacing.base,
    },
    aiLockBadgeLarge: {
        width: 72,
        height: 72,
        borderRadius: borderRadius.full,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        backgroundColor: semanticColors.accentSubtle,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    lockedTextPremium: {
        fontSize: typography.fontSizes.base,
        lineHeight: 22,
        color: semanticColors.textPrimary,
        fontFamily: fonts.medium,
        textAlign: 'center' as const,
        paddingHorizontal: spacing.sm,
    },
    // Apple Health sync banner
    healthKitBanner: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
        backgroundColor: semanticColors.successSubtle,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        paddingVertical: 10,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.md,
    },
    healthKitConnectBanner: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
        backgroundColor: semanticColors.accentSubtle,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        paddingVertical: 10,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.md,
    },
    healthKitConnectBannerText: {
        flex: 1,
        fontSize: 12,
        fontFamily: fonts.medium,
        color: semanticColors.textPrimary,
        lineHeight: 17,
    },
    healthKitBannerText: {
        flex: 1,
        fontSize: 13,
        fontFamily: fonts.medium,
        color: semanticColors.textPrimary,
    },
    floatingFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        // Optional: gradient background fade if needed, but transparent with just button is ok relative to Tab Bar.
        // Actually, TabBar has a background. If button floats above it, it overlaps page content.
    },
    floatingStartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.accent,
        paddingVertical: 16,
        paddingHorizontal: spacing.xl,
        borderRadius: 32,
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },

}));
