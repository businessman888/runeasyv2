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
import Constants from 'expo-constants';
import {
    updateApplicationContext,
    watchEvents,
    getIsPaired,
    getIsWatchAppInstalled,
} from 'react-native-watch-connectivity';
import {
    buildWatchContractFields,
    finalizeWatchApplicationContext,
    WATCH_CONTEXT_WARN_BYTES,
    type WatchCoachPolicy,
    type WatchExecutionStep,
    type WatchPolicyVersions,
} from './watchContextContract';

export {
    WATCH_CONTEXT_SCHEMA_VERSION,
    WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS,
} from './watchContextContract';
export type {
    WatchCoachPolicy,
    WatchExecutionStep,
    WatchPolicyVersions,
} from './watchContextContract';

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
    /** Introduzido no schema 2; opcional para drenar transfers legados. */
    run_id?: string;
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
    healthkit_saved?: boolean;
    route_saved?: boolean;
    completion_warning?: string | null;
}

export interface RunDeliveryAck {
    runId: string;
    status: 'server_accepted' | 'pending_sync';
    acknowledgedAt: string;
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
    earnableBadges?: Array<{
        slug: string;
        type: string;
        tier: number;
        earned: boolean;
    }>;
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

/**
 * Atividade avulsa do dia — corrida livre ou treino manual.
 *
 * NÃO é gated por Pro: corrida livre é gratuita em todos os planos, então
 * espelha `HomeScreen.tsx` (aba Atividades), que lê de `rawWorkouts` sem gate.
 */
export interface ActivityForWatch {
    id: string;
    source: 'free' | 'manual';
    title: string;
    status: 'pending' | 'completed';
    distanceKm: number;
    /** Segundos. Null enquanto pendente. */
    durationSeconds?: number | null;
    /** "6:00" — já formatado pelo iPhone (o Watch só renderiza). */
    pace?: string;
}

/**
 * Resumo da última corrida concluída de um escopo.
 *
 * SEM `route_points` e SEM textos de feedback do Coach — ver limite de payload
 * em `sendWatchContext`. O Watch não renderiza rota nem análise.
 */
export interface RunResultForWatch {
    activityId: string;
    scope: 'plan' | 'activity';
    title: string;
    /** "12/08" — já formatado pelo iPhone. */
    dateLabel: string;
    distanceKm: number;
    durationSeconds: number;
    /** "5:42" */
    pace: string;
    avgHeartRate?: number | null;
}

// ---------------------------------------------------------------------------
// Envelope: o Watch envia { type, payload, sent_at } para podermos rotear
// ---------------------------------------------------------------------------

interface WatchEnvelope {
    type: 'completed_run' | 'today_workout' | 'today_rest' | 'user_info';
    payload?: unknown;
    sent_at?: string;
}

/** Mensagens que o Watch envia sob demanda (só chegam com o iPhone alcançável). */
export type WatchRequestType = 'request_refresh' | 'open_paywall';

type CompletedRunListener = (run: CompletedRunFromWatch) => void;
type ReachabilityListener = (reachable: boolean) => void;
type PairedListener = (paired: boolean) => void;
type RequestListener = (type: WatchRequestType) => void;
type ApplicationContextErrorListener = (payload: unknown) => void;

const listeners = {
    completedRun: new Set<CompletedRunListener>(),
    reachability: new Set<ReachabilityListener>(),
    paired: new Set<PairedListener>(),
    request: new Set<RequestListener>(),
    applicationContextError: new Set<ApplicationContextErrorListener>(),
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

    // Pedidos sob demanda do Watch (sendMessage). Só chegam com o app do iPhone
    // em execução — por isso o Watch sempre precisa de fallback quando não
    // alcançável, nunca assumir entrega.
    watchEvents.addListener('message', (message, replyHandler) => {
        const type = (message as { type?: string })?.type;
        if (type !== 'request_refresh' && type !== 'open_paywall') return;
        listeners.request.forEach((cb) => {
            try {
                cb(type);
            } catch (e) {
                console.warn('[AppleWatch] request listener error:', e);
            }
        });
        // Confirma o recebimento pro Watch poder distinguir "chegou" de "sumiu".
        replyHandler?.({ ok: true });
    });

    watchEvents.addListener('reachability', (reachable) => {
        listeners.reachability.forEach((cb) => cb(Boolean(reachable)));
    });

    watchEvents.addListener('paired', (paired) => {
        listeners.paired.forEach((cb) => cb(Boolean(paired)));
    });

    // A lib nativa reporta falhas assíncronas por evento; o try/catch do
    // updateApplicationContext não recebe esses erros.
    watchEvents.addListener('application-context-error', (payload) => {
        console.warn('[AppleWatch] application context rejected:', payload);
        listeners.applicationContextError.forEach((cb) => cb(payload));
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
    /** Identidade da conta pareada. Null representa sessão encerrada. */
    accountId: string | null;
    userName: string;
    avatarUrl?: string | null;
    /**
     * Tier do usuário. É um sinal de RENDERIZAÇÃO, não de filtragem.
     *
     * O gate de dados continua no iPhone (`useWatchSync` zera today/schedule
     * para Free), então o Watch nunca recebe treino de plano que um Free não
     * poderia ver. `isPro` só diz ao Watch **por que** não há treino — para ele
     * escolher entre UpgradeProCard e RestDayCard, que antes eram
     * indistinguíveis.
     */
    isPro: boolean;
    todayWorkout: TodayWorkoutForWatch | null;
    weekStats?: WeekStatsForWatch;
    nextWorkout?: NextWorkoutForWatch | null;
    /** Atividades avulsas de hoje (livre/manual). Truncado em MAX_ACTIVITIES. */
    todayActivities?: ActivityForWatch[];
    /** Último resultado de treino do plano. Null para Free (gate no iPhone). */
    latestPlanResult?: RunResultForWatch | null;
    /** Último resultado de atividade avulsa. Nunca gated. */
    latestActivityResult?: RunResultForWatch | null;
    /** Último ACK de corrida; o sender o mantém até outro run substituí-lo. */
    runAck?: RunDeliveryAck | null;
    /** Timestamp da última verificação do entitlement no backend. */
    subscriptionVerifiedAt?: number | null;
    /** Flags independentes para liberar experiências sem acoplar os fluxos. */
    featureFlags?: {
        liveMap: boolean;
        audioCoach: boolean;
    };
    /** Versoes dos contratos enviados; usa os valores correntes quando omitido. */
    policyVersions?: WatchPolicyVersions;
    /** Politica do coach estruturado. Ausente enquanto a feature estiver desligada. */
    coachPolicy?: WatchCoachPolicy;
    /** Timeline expandida do treino. Ausente mantem somente o coach de splits. */
    executionSteps?: WatchExecutionStep[];
}

/**
 * `updateApplicationContext` aceita no máximo 262.144 bytes. Estourar lança
 * WCErrorCodePayloadTooLarge e o contexto INTEIRO é descartado — o Watch
 * simplesmente para de atualizar, sem erro visível. Como o custo de um payload
 * grande é silencioso, avisamos bem antes do teto real.
 */
const MAX_ACTIVITIES = 5;
let contextRevision = 0;

export function sendWatchContext(ctx: WatchContext | null | undefined): void {
    if (Platform.OS !== 'ios') return;
    try {
        if (!ctx || typeof ctx !== 'object') {
            console.warn('[AppleWatch] contexto ausente ou inválido — envio ignorado');
            return;
        }
        const payloadType = ctx.todayWorkout ? 'today_workout' : 'today_rest';
        contextRevision += 1;
        const version = Constants.expoConfig?.version ?? 'unknown';
        const build = Constants.expoConfig?.ios?.buildNumber ?? 'unknown';
        const sentAt = new Date().toISOString();
        const rawPayload = {
            ...buildWatchContractFields({
                featureFlags: ctx.featureFlags,
                policyVersions: ctx.policyVersions,
                coachPolicy: ctx.coachPolicy,
                executionSteps: ctx.executionSteps,
            }),
            context_id: `${Date.now()}-${contextRevision}`,
            revision: contextRevision,
            account_id: ctx.accountId ?? '',
            auth_state: ctx.accountId ? 'signed_in' : 'signed_out',
            phone_build: `${version}(${build})`,
            type: payloadType,
            payload: ctx.todayWorkout ? { ...ctx.todayWorkout } : {},
            user_name: ctx.userName,
            avatar_url: ctx.avatarUrl ?? '',
            is_pro: ctx.isPro,
            week_stats: ctx.weekStats ?? {
                streak: 0,
                workoutsDone: 0,
                workoutsTotal: 0,
                restDone: 0,
                restTotal: 0,
            },
            next_workout: ctx.nextWorkout ?? {},
            today_activities: (ctx.todayActivities ?? []).slice(0, MAX_ACTIVITIES),
            latest_plan_result: ctx.latestPlanResult ?? {},
            latest_activity_result: ctx.latestActivityResult ?? {},
            run_ack: ctx.runAck ?? {},
            subscription_verified_at: ctx.subscriptionVerifiedAt
                ? new Date(ctx.subscriptionVerifiedAt).toISOString()
                : '',
            sent_at: sentAt,
        };
        const finalized = finalizeWatchApplicationContext(rawPayload);
        if (finalized.wasReduced) {
            console.error(
                `[AppleWatch] payload de ${finalized.originalSizeBytes}B excede o limite — enviando versao reduzida`,
            );
        }
        if (__DEV__ && finalized.sizeBytes > WATCH_CONTEXT_WARN_BYTES) {
            console.warn(
                `[AppleWatch] payload grande: ${finalized.sizeBytes}B (teto 262144B)`,
            );
        }

        updateApplicationContext(finalized.payload);
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

export function onApplicationContextError(
    cb: ApplicationContextErrorListener,
): () => void {
    listeners.applicationContextError.add(cb);
    return () => listeners.applicationContextError.delete(cb);
}

/** Assina pedidos vindos do Watch (`request_refresh`, `open_paywall`). */
export function onWatchRequest(cb: RequestListener): () => void {
    listeners.request.add(cb);
    return () => listeners.request.delete(cb);
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
