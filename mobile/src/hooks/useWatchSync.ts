/**
 * Sincroniza o **contexto completo do dia atual** do iPhone para o Apple Watch:
 *   - Usuário (nome + avatar URL)
 *   - Treino do dia (status pendente/concluído OU descanso)
 *   - Stats da semana (streak + treinos feitos/total + descansos feitos/total)
 *   - Próximo treino (pra mostrar no card de descanso "Próximo: Longão...")
 *
 * IMPORTANTE: usa `today` (ScheduleDay) — não `nextWorkout` — pra que o Watch
 * reflita exatamente o estado de HOJE no app mobile.
 *
 * Use uma vez no App.tsx via <WatchSyncManager />.
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { onWatchRequest } from '../services/appleWatch';
import { useProFeature } from './useProFeature';
import { useTrainingStore, type ScheduleDay } from '../stores/trainingStore';
import { useAuthStore, getDisplayName, getAvatarUrl } from '../stores/authStore';
import { useGamificationStore } from '../stores/gamificationStore';
import { useAppleWatchStore } from '../stores/appleWatchStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { useFeedbackStore, type LatestActivityData } from '../stores/feedbackStore';
import type {
    TodayWorkoutForWatch,
    WeekStatsForWatch,
    NextWorkoutForWatch,
    ActivityForWatch,
    RunResultForWatch,
} from '../services/appleWatch';

function mapWorkoutType(t: string | undefined | null): TodayWorkoutForWatch['type'] {
    switch (t) {
        case 'long_run':       return 'longao';
        case 'intervals':
        case 'tempo':
        case 'progressive':    return 'intervalado';
        case 'fartlek':        return 'tiros';
        case 'recovery':
        case 'easy_run':
        default:               return 'rodagem';
    }
}

function formatTargetPace(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDateLabel(dateIso: string | null | undefined): string {
    if (!dateIso) return '';
    try {
        const d = new Date(dateIso + 'T00:00:00');
        const dd = d.getDate().toString().padStart(2, '0');
        const mm = (d.getMonth() + 1).toString().padStart(2, '0');
        return `Hoje, ${dd}/${mm}`;
    } catch {
        return '';
    }
}

/**
 * Determina o intervalo da semana (segunda a domingo) que contém a data dada.
 */
function getWeekRange(refDate = new Date()): { start: Date; end: Date } {
    const d = new Date(refDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function isWithin(dateIso: string, range: { start: Date; end: Date }): boolean {
    if (!dateIso) return false;
    const d = new Date(dateIso + 'T12:00:00');
    return d >= range.start && d <= range.end;
}

function computeWeekStats(schedule: ScheduleDay[], streak: number): WeekStatsForWatch {
    const week = getWeekRange();
    const weekDays = schedule.filter((s) => isWithin(s.date, week));
    const workouts = weekDays.filter((s) => s.type === 'workout');
    const rest = weekDays.filter((s) => s.type === 'recovery');
    return {
        streak,
        workoutsDone: workouts.filter((s) => s.status === 'completed').length,
        workoutsTotal: workouts.length,
        restDone: rest.filter((s) => s.is_past || s.status === 'completed').length,
        restTotal: rest.length,
    };
}

function findNextWorkout(schedule: ScheduleDay[]): NextWorkoutForWatch | null {
    const todayIso = new Date().toISOString().split('T')[0];
    const next = schedule.find(
        (s) => s.date > todayIso && s.type === 'workout' && s.workout != null,
    );
    if (!next || !next.workout) return null;

    const titleByType: Record<string, string> = {
        long_run: 'Longão',
        intervals: 'Intervalado',
        tempo: 'Treino Tempo',
        fartlek: 'Fartlek',
        recovery: 'Recuperação',
        progressive: 'Progressivo',
        easy_run: 'Rodagem',
    };
    const title = next.workout.title?.trim() || titleByType[next.workout.type] || 'Treino';
    return { title, date: next.date };
}

function buildTodayWorkout(today: ScheduleDay | null): TodayWorkoutForWatch | null {
    if (!today) return null;
    if (today.type === 'recovery' || today.type === null) return null;
    if (!today.workout) return null;

    const w = today.workout;
    const distanceKm = typeof w.distance_km === 'number' ? w.distance_km : 0;
    const targetPace = formatTargetPace(w.target_pace_seconds);

    const titleByType: Record<string, string> = {
        long_run: 'Longão',
        intervals: 'Treino Intervalado',
        tempo: 'Treino Tempo',
        fartlek: 'Fartlek',
        recovery: 'Corrida de Recuperação',
        progressive: 'Progressivo',
        easy_run: 'Rodagem Leve',
    };
    const title = w.title?.trim() || titleByType[w.type] || 'Rodagem Leve';

    const status: TodayWorkoutForWatch['status'] =
        today.status === 'completed' ? 'completed' : 'pending';

    // Heurística de intensidade pelo tipo (até termos campo dedicado no DB)
    const intensityByType: Record<string, string> = {
        long_run: 'Moderada',
        intervals: 'Alta',
        tempo: 'Alta',
        fartlek: 'Alta',
        recovery: 'Leve',
        progressive: 'Moderada',
        easy_run: 'Leve',
    };

    return {
        id: w.id,
        type: mapWorkoutType(w.type),
        title: `${title} - ${distanceKm.toFixed(0)}km`,
        distanceKm,
        targetPace,
        instructions: w.objective?.trim() || '',
        targetDurationSeconds: w.target_duration_seconds ?? null,
        intensity: intensityByType[w.type] || 'Moderada',
        dateLabel: formatDateLabel(today.date),
        status,
    };
}

/** "5:42" a partir de segundos por km. Vazio quando não há pace válido. */
function formatPace(secondsPerKm: number | null | undefined): string {
    if (!secondsPerKm || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '';
    const m = Math.floor(secondsPerKm / 60);
    const s = Math.round(secondsPerKm % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Atividades avulsas de hoje — espelha o filtro da aba Atividades da Home
 * (HomeScreen: rawWorkouts filtrado por data + source, manual antes de free).
 * Deliberadamente NÃO gated por Pro: corrida livre é gratuita.
 */
function buildTodayActivities(workouts: unknown[]): ActivityForWatch[] {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
    ).padStart(2, '0')}`;
    const rank = (s?: string | null) => (s === 'manual' ? 0 : s === 'free' ? 1 : 2);

    return (workouts as any[])
        .filter(
            (w) =>
                w?.scheduled_date === todayStr &&
                (w?.source === 'manual' || w?.source === 'free'),
        )
        .sort((a, b) => rank(a?.source) - rank(b?.source))
        .map((w) => {
            const distanceKm = typeof w.distance_km === 'number' ? w.distance_km : 0;
            const durationSeconds =
                typeof w.duration_seconds === 'number' ? w.duration_seconds : null;
            // Pace derivado quando o registro não traz o valor pronto.
            const paceSeconds =
                w.avg_pace_seconds_per_km ??
                (durationSeconds && distanceKm > 0 ? durationSeconds / distanceKm : null);
            return {
                id: String(w.id),
                source: w.source === 'manual' ? 'manual' : 'free',
                title:
                    w.title?.trim() ||
                    (w.source === 'manual' ? 'Treino Manual' : 'Corrida Livre'),
                status: w.status === 'completed' ? 'completed' : 'pending',
                distanceKm,
                durationSeconds,
                pace: formatPace(paceSeconds),
            } satisfies ActivityForWatch;
        });
}

/**
 * Mapeia o resultado do feedbackStore para o formato enxuto do Watch.
 * Descarta feedback/strengths/improvements de propósito — são textos longos
 * que estourariam o applicationContext e não são renderizáveis no relógio.
 */
function buildRunResult(
    data: LatestActivityData | null,
    scope: 'plan' | 'activity',
): RunResultForWatch | null {
    const a = data?.activity;
    if (!a) return null;
    const distanceKm = typeof a.distance === 'number' ? a.distance / 1000 : Number(a.distance_km) || 0;
    return {
        activityId: a.id,
        scope,
        title: data?.workout_title?.trim() || a.name?.trim() || 'Corrida',
        dateLabel: a.date_label ?? '',
        distanceKm,
        durationSeconds: a.moving_time ?? 0,
        pace: a.formatted_pace || formatPace(a.average_pace),
        avgHeartRate: a.average_heartrate ?? null,
    };
}

export function useWatchSync() {
    const today = useTrainingStore((s) => s.today);
    const schedule = useTrainingStore((s) => s.schedule);
    // Ungated: alimenta a aba Atividades do Watch (corrida livre é gratuita).
    const rawWorkouts = useTrainingStore((s) => s.workouts);
    const user = useAuthStore((s) => s.user);
    const stats = useGamificationStore((s) => s.stats);
    const latestPlanActivity = useFeedbackStore((s) => s.latestPlanActivity);
    const latestActivityResultData = useFeedbackStore((s) => s.latestActivityResult);
    const sendContextToWatch = useAppleWatchStore((s) => s.sendContextToWatch);
    const resendLastContext = useAppleWatchStore((s) => s.resendLastContext);
    const isPaired = useAppleWatchStore((s) => s.isPaired);
    // Este hook roda dentro do SuperwallProvider (App.tsx → WatchSyncManager),
    // então pode abrir o fluxo de upgrade a pedido do relógio.
    const { openUpgrade } = useProFeature();
    // Source of truth for plan visibility. Already incorporates the DevMenu
    // override, so toggling "Forçar Free" propagates to the Watch on the next
    // schedule rebuild without any extra wiring.
    const isProUser = useSubscriptionStore((s) => s.isProUser);

    const lastSentRef = useRef<string | null>(null);

    // Pedidos vindos do relógio. Só chegam com este app em execução — o Watch
    // trata a ausência de resposta como "não alcançável" e mostra fallback.
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        return onWatchRequest((type) => {
            if (type === 'request_refresh') {
                resendLastContext();
            } else if (type === 'open_paywall') {
                console.log('[useWatchSync] Watch pediu o paywall — abrindo no iPhone');
                openUpgrade();
            }
        });
    }, [resendLastContext, openUpgrade]);

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        if (!isPaired) return;

        // Free/Pro gate at the data source — same pattern the CalendarScreen
        // already uses. Free users must never see plan workouts on the Watch:
        // the Home swaps the WorkoutCard for an UpgradeProCard, and the Watch
        // mirrors that by falling back to the RestDayCard (which still lets
        // the user start a free run — that's gratuita pra todos os planos).
        //
        // Plano órfão guard: even Free users whose account still has a plan
        // row in the DB (legacy accounts pre-gating, see project_free_pro_gating
        // memory) get an empty schedule here, closing the orphan-plan leak on
        // the Watch surface.
        const effectiveToday = isProUser ? today : null;
        const effectiveSchedule = isProUser ? schedule : [];

        const userName = getDisplayName(user) || 'Atleta';
        const avatarUrl = getAvatarUrl(user);
        const todayWorkout = buildTodayWorkout(effectiveToday);
        const weekStats = computeWeekStats(
            effectiveSchedule,
            stats?.current_streak ?? 0,
        );
        const nextWorkout = findNextWorkout(effectiveSchedule);

        // Atividades avulsas NÃO passam pelo gate — corrida livre é gratuita e
        // a Home também as lê de rawWorkouts sem gating.
        const todayActivities = buildTodayActivities(rawWorkouts ?? []);

        // Resultado de treino do PLANO é gated: no mobile o Free nunca vê
        // análise de plano, nem com plan-activity órfã. Resultado de atividade
        // avulsa é sempre visível.
        const latestPlanResult = isProUser ? buildRunResult(latestPlanActivity, 'plan') : null;
        const latestActivityResult = buildRunResult(latestActivityResultData, 'activity');

        const ctx = {
            userName,
            avatarUrl,
            isPro: isProUser,
            todayWorkout,
            weekStats,
            nextWorkout,
            todayActivities,
            latestPlanResult,
            latestActivityResult,
        };
        const cacheKey = JSON.stringify(ctx);
        if (lastSentRef.current === cacheKey) return;
        lastSentRef.current = cacheKey;

        sendContextToWatch(ctx);
        console.log('[useWatchSync] pushed to watch:', {
            userName,
            avatarUrl: avatarUrl ? '✓' : '–',
            isProUser,
            todayDate: effectiveToday?.date ?? null,
            todayType: effectiveToday?.type ?? null,
            todayStatus: effectiveToday?.status ?? null,
            workoutId: todayWorkout?.id ?? null,
            weekStats,
            nextWorkout,
            activities: todayActivities.length,
            planResult: latestPlanResult ? '✓' : '–',
            activityResult: latestActivityResult ? '✓' : '–',
        });
    }, [
        today,
        schedule,
        rawWorkouts,
        user,
        stats,
        isPaired,
        isProUser,
        latestPlanActivity,
        latestActivityResultData,
        sendContextToWatch,
    ]);
}
