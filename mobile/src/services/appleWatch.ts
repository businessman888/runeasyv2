/**
 * Wrapper TS sobre `react-native-watch-connectivity` para o app companion no Apple Watch.
 *
 * iPhone → Watch: `updateApplicationContext` com o treino do dia (estado durável,
 * sempre disponível pro Watch quando ele acordar).
 * Watch → iPhone: o Watch chama `transferUserInfo` (no PhoneBridge.swift), e aqui
 * escutamos o evento `user-info` para receber as corridas finalizadas.
 *
 * Phase 4: bridge funcional. Phase 5 conecta com `trainingStore` (completeWorkout/completeFreeRun).
 */

import { Platform } from 'react-native';
import {
    updateApplicationContext,
    watchEvents,
    getIsPaired,
    getIsWatchAppInstalled,
} from 'react-native-watch-connectivity';

// ---------------------------------------------------------------------------
// Tipos — espelham exatamente CompletedRun.swift (CodingKeys snake_case).
// ---------------------------------------------------------------------------

export interface WatchRoutePoint {
    latitude: number;
    longitude: number;
    altitude: number | null;
    timestamp: number; // Unix epoch ms
    speed: number | null;
    accuracy: number | null;
}

export interface CompletedRunFromWatch {
    workout_id: string | null;
    total_distance_meters: number;
    duration_seconds: number;
    avg_pace_seconds_per_km: number;
    avg_heart_rate: number | null;
    max_heart_rate: number | null;
    calories: number | null;
    route_points: WatchRoutePoint[];
    started_at: string; // ISO 8601
    source: 'apple_watch';
}

export interface TodayWorkoutForWatch {
    id: string;
    type: 'rodagem' | 'longao' | 'intervalado' | 'tiros' | 'rest';
    title: string;
    distanceKm: number;
    targetPace: string;
    instructions: string;
    /** Duração-alvo em segundos (para o card mostrar "Tempo: 51:35") */
    targetDurationSeconds?: number | null;
    /** "Moderada" | "Leve" | "Alta" — usado no subtítulo do card */
    intensity?: string;
    /** "Hoje, 14/06" — string formatada de data pra header do card */
    dateLabel?: string;
    /**
     * Status do treino — quando 'completed', o Watch desabilita o botão Iniciar
     * (espelha o comportamento do app mobile: card desativado pós-finalização).
     */
    status?: 'pending' | 'completed';
}

export interface WeekStatsForWatch {
    /** Sequência atual de dias com treino (de gamificationStore) */
    streak: number;
    /** Treinos completados na semana corrente */
    workoutsDone: number;
    /** Total de treinos planejados para a semana corrente */
    workoutsTotal: number;
    /** Dias de descanso já passados/concluídos na semana */
    restDone: number;
    /** Total de dias de descanso planejados para a semana */
    restTotal: number;
}

export interface NextWorkoutForWatch {
    title: string;
    /** ISO date "2026-04-05" — Watch formata pra display ("domingo, 5 de abr.") */
    date: string;
}

// ---------------------------------------------------------------------------
// Envelope: o Watch envia { type, payload, sent_at } para podermos rotear
// ---------------------------------------------------------------------------

interface WatchEnvelope {
    type: 'completed_run' | 'today_workout' | 'today_rest' | 'user_info';
    payload?: unknown;
    sent_at?: string;
}

type CompletedRunListener = (run: CompletedRunFromWatch) => void;
type ReachabilityListener = (reachable: boolean) => void;
type PairedListener = (paired: boolean) => void;

const listeners = {
    completedRun: new Set<CompletedRunListener>(),
    reachability: new Set<ReachabilityListener>(),
    paired: new Set<PairedListener>(),
};

let initialized = false;

/**
 * Registra os listeners do WatchConnectivity. Idempotente.
 * Chame uma vez no bootstrap do app (App.tsx).
 */
export function initAppleWatch(): void {
    if (initialized) return;
    if (Platform.OS !== 'ios') return; // WC só existe no iOS
    initialized = true;

    watchEvents.addListener('user-info', (envelopes) => {
        if (!Array.isArray(envelopes)) return;
        for (const env of envelopes as unknown as WatchEnvelope[]) {
            if (!env || typeof env !== 'object') continue;
            if (env.type === 'completed_run' && env.payload) {
                const run = env.payload as CompletedRunFromWatch;
                listeners.completedRun.forEach((cb) => {
                    try {
                        cb(run);
                    } catch (e) {
                        console.warn('[AppleWatch] listener error:', e);
                    }
                });
            }
        }
    });

    watchEvents.addListener('reachability', (reachable) => {
        listeners.reachability.forEach((cb) => cb(Boolean(reachable)));
    });

    watchEvents.addListener('paired', (paired) => {
        listeners.paired.forEach((cb) => cb(Boolean(paired)));
    });

    console.log('[AppleWatch] initialized');
}

// ---------------------------------------------------------------------------
// Send: iPhone → Watch
// ---------------------------------------------------------------------------

/**
 * Contexto unificado enviado ao Watch via `updateApplicationContext`.
 * Inclui usuário (nome + avatar), treino do dia, stats da semana, próximo treino.
 * Watch reflete fielmente o que o iPhone tem.
 */
export interface WatchContext {
    userName: string;
    avatarUrl?: string | null;
    todayWorkout: TodayWorkoutForWatch | null;
    weekStats?: WeekStatsForWatch;
    nextWorkout?: NextWorkoutForWatch | null;
}

export function sendTodayWorkout(workout: TodayWorkoutForWatch | null, userName: string): void {
    sendWatchContext({ todayWorkout: workout, userName });
}

export function sendWatchContext(ctx: WatchContext): void {
    if (Platform.OS !== 'ios') return;
    try {
        const payloadType = ctx.todayWorkout ? 'today_workout' : 'today_rest';
        updateApplicationContext({
            type: payloadType,
            payload: ctx.todayWorkout ? { ...ctx.todayWorkout } : null,
            user_name: ctx.userName,
            avatar_url: ctx.avatarUrl ?? null,
            week_stats: ctx.weekStats ?? null,
            next_workout: ctx.nextWorkout ?? null,
            sent_at: new Date().toISOString(),
        });
    } catch (e) {
        console.warn('[AppleWatch] sendWatchContext error:', e);
    }
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function onCompletedRun(cb: CompletedRunListener): () => void {
    listeners.completedRun.add(cb);
    return () => listeners.completedRun.delete(cb);
}

export function onReachabilityChange(cb: ReachabilityListener): () => void {
    listeners.reachability.add(cb);
    return () => listeners.reachability.delete(cb);
}

export function onPairedChange(cb: PairedListener): () => void {
    listeners.paired.add(cb);
    return () => listeners.paired.delete(cb);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export async function isWatchPaired(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
        return await getIsPaired();
    } catch {
        return false;
    }
}

export async function isWatchAppInstalled(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
        return await getIsWatchAppInstalled();
    } catch {
        return false;
    }
}
