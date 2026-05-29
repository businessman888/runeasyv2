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
import { useTrainingStore, type ScheduleDay } from '../stores/trainingStore';
import { useAuthStore, getDisplayName, getAvatarUrl } from '../stores/authStore';
import { useGamificationStore } from '../stores/gamificationStore';
import { useAppleWatchStore } from '../stores/appleWatchStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import type {
    TodayWorkoutForWatch,
    WeekStatsForWatch,
    NextWorkoutForWatch,
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

export function useWatchSync() {
    const today = useTrainingStore((s) => s.today);
    const schedule = useTrainingStore((s) => s.schedule);
    const user = useAuthStore((s) => s.user);
    const stats = useGamificationStore((s) => s.stats);
    const sendContextToWatch = useAppleWatchStore((s) => s.sendContextToWatch);
    const isPaired = useAppleWatchStore((s) => s.isPaired);
    // Source of truth for plan visibility. Already incorporates the DevMenu
    // override, so toggling "Forçar Free" propagates to the Watch on the next
    // schedule rebuild without any extra wiring.
    const isProUser = useSubscriptionStore((s) => s.isProUser);

    const lastSentRef = useRef<string | null>(null);

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

        const ctx = { userName, avatarUrl, todayWorkout, weekStats, nextWorkout };
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
        });
    }, [today, schedule, user, stats, isPaired, isProUser, sendContextToWatch]);
}
