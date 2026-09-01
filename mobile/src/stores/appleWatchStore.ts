import { create } from 'zustand';
import { Platform } from 'react-native';
import {
    initAppleWatch,
    isWatchPaired,
    isWatchAppInstalled,
    onCompletedRun,
    onApplicationContextError,
    onReachabilityChange,
    onPairedChange,
    sendWatchContext,
    type CompletedRunFromWatch,
    type WatchContext,
    type RunDeliveryAck,
} from '../services/appleWatch';
import {
    useTrainingStore,
    type WorkoutTrackingPayload,
    type FreeRunPayload,
    type RoutePoint,
} from './trainingStore';
import {
    isWatchContext,
    mergeMonotonicWatchContext,
} from '../services/watchContextMerge';

interface AppleWatchState {
    isPaired: boolean;
    isInstalled: boolean;
    isReachable: boolean;
    lastReceivedRun: CompletedRunFromWatch | null;
    lastReceivedAt: number | null;
    /** Resultado do último routing pro backend (sucesso ou pending offline) */
    lastRoutingResult: 'success' | 'savedLocally' | null;
    /** Último contexto enviado — permite reenviar quando o Watch pedir refresh. */
    lastContext: WatchContext | null;
    lastRunAck: RunDeliveryAck | null;

    // actions
    bootstrap: () => Promise<void>;
    sendContextToWatch: (ctx: WatchContext) => void;
    /** Reenvia o último contexto. No-op se nada foi enviado ainda. */
    resendLastContext: () => void;
    clearLastReceivedRun: () => void;
}

let bootstrapped = false;
let unsubFns: Array<() => void> = [];
const processingRunIds = new Set<string>();
const CONTEXT_RETRY_DELAYS_MS = [500, 1_500, 5_000] as const;
let contextRetryAttempt = 0;
let contextRetryTimer: ReturnType<typeof setTimeout> | null = null;

function cancelContextRetry() {
    if (contextRetryTimer) clearTimeout(contextRetryTimer);
    contextRetryTimer = null;
}

/**
 * Converte os RoutePoints do Watch (snake_case via JSON do Swift) para a shape
 * canônica do trainingStore (mesma forma — só tipagem).
 */
function mapRoutePoints(input: CompletedRunFromWatch['route_points']): RoutePoint[] {
    if (!Array.isArray(input)) return [];
    return input.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude ?? null,
        timestamp: p.timestamp,
        speed: p.speed ?? null,
        accuracy: p.accuracy ?? null,
    }));
}

/** Gera uma identidade estável para transfers criados antes do schema 2. */
function resolveRunId(run: CompletedRunFromWatch): string {
    const explicitId = run.run_id?.trim();
    if (explicitId) return explicitId;

    const fingerprint = [
        run.workout_id ?? 'free',
        run.started_at,
        Math.round(run.total_distance_meters),
        Math.round(run.duration_seconds),
    ].join('|');

    let hash = 2166136261;
    for (let index = 0; index < fingerprint.length; index += 1) {
        hash ^= fingerprint.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `legacy-${(hash >>> 0).toString(16)}`;
}

/**
 * ACK and domain state must travel in the same applicationContext. Otherwise
 * the ACK can become the newest snapshot while still advertising the planned
 * workout as pending.
 */
function contextWithRunAck(
    context: WatchContext,
    run: CompletedRunFromWatch,
    ack: RunDeliveryAck,
): WatchContext {
    const todayWorkout =
        ack.status === 'server_accepted' &&
        run.workout_id &&
        context.todayWorkout?.id === run.workout_id
            ? { ...context.todayWorkout, status: 'completed' as const }
            : context.todayWorkout;

    return { ...context, todayWorkout, runAck: ack };
}

/**
 * Roteia uma corrida recebida do Watch para o trainingStore existente.
 * Reutiliza completeWorkout (treino do plano) ou completeFreeRun (corrida livre).
 * Ambos têm fila offline MMKV — se o backend falhar, a corrida fica pending
 * e é enviada na próxima vez que o app for aberto online.
 */
async function routeCompletedRunToTraining(run: CompletedRunFromWatch): Promise<'success' | 'savedLocally'> {
    const trainingStore = useTrainingStore.getState();
    const route_points = mapRoutePoints(run.route_points);
    const runId = resolveRunId(run);
    const externalId = `apple_watch_${runId}`;

    if (run.workout_id) {
        // Treino do plano — completeWorkout dispara feedback AI quando workout.source === 'plan'
        const payload: WorkoutTrackingPayload = {
            workoutId: run.workout_id,
            route_points,
            total_distance_meters: run.total_distance_meters,
            duration_seconds: run.duration_seconds,
            source: 'apple_watch',
            external_id: externalId,
            started_at: run.started_at,
            average_heartrate: run.avg_heart_rate ?? undefined,
            max_heartrate: run.max_heart_rate ?? undefined,
            calories: run.calories ?? undefined,
            avg_pace_seconds_per_km: run.avg_pace_seconds_per_km,
        };
        const res = await trainingStore.completeWorkout(payload);
        return res.success ? 'success' : 'savedLocally';
    } else {
        // Corrida livre — gera localId pra dedup do MMKV
        const localId = `watch_free_${runId}`;
        const payload: FreeRunPayload = {
            localId,
            route_points,
            total_distance_meters: run.total_distance_meters,
            duration_seconds: run.duration_seconds,
            started_at: run.started_at,
            source: 'apple_watch',
            external_id: externalId,
            average_heartrate: run.avg_heart_rate ?? undefined,
            max_heartrate: run.max_heart_rate ?? undefined,
            calories: run.calories ?? undefined,
            avg_pace_seconds_per_km: run.avg_pace_seconds_per_km,
        };
        const res = await trainingStore.completeFreeRun(payload);
        return res.success ? 'success' : 'savedLocally';
    }
}

export const useAppleWatchStore = create<AppleWatchState>((set, get) => ({
    isPaired: false,
    isInstalled: false,
    isReachable: false,
    lastReceivedRun: null,
    lastReceivedAt: null,
    lastRoutingResult: null,
    lastContext: null,
    lastRunAck: null,

    bootstrap: async () => {
        if (bootstrapped) return;
        if (Platform.OS !== 'ios') return;
        bootstrapped = true;

        initAppleWatch();

        const [paired, installed] = await Promise.all([
            isWatchPaired(),
            isWatchAppInstalled(),
        ]);
        set({ isPaired: paired, isInstalled: installed });

        unsubFns.push(
            onCompletedRun(async (run) => {
                const runId = resolveRunId(run);
                if (processingRunIds.has(runId)) {
                    console.log(`[AppleWatchStore] duplicate em processamento ignorado: ${runId}`);
                    return;
                }
                processingRunIds.add(runId);
                console.log('[AppleWatchStore] received completed run:', {
                    workout_id: run.workout_id,
                    distance_m: run.total_distance_meters,
                    duration_s: run.duration_seconds,
                    points: run.route_points?.length ?? 0,
                    run_id: runId,
                });
                set({ lastReceivedRun: run, lastReceivedAt: Date.now() });

                try {
                    const result = await routeCompletedRunToTraining(run);
                    const ack: RunDeliveryAck = {
                        runId,
                        status: result === 'success' ? 'server_accepted' : 'pending_sync',
                        acknowledgedAt: new Date().toISOString(),
                    };
                    const currentContext = get().lastContext;
                    const acknowledgedContext = currentContext
                        ? contextWithRunAck(currentContext, run, ack)
                        : null;
                    set({
                        lastRoutingResult: result,
                        lastRunAck: ack,
                        ...(acknowledgedContext
                            ? { lastContext: acknowledgedContext }
                            : {}),
                    });
                    if (acknowledgedContext) sendWatchContext(acknowledgedContext);
                    console.log(`[AppleWatchStore] routed → ${result}`);
                } catch (err) {
                    console.error('[AppleWatchStore] routing error:', err);
                    const ack: RunDeliveryAck = {
                        runId,
                        status: 'pending_sync',
                        acknowledgedAt: new Date().toISOString(),
                    };
                    set({ lastRoutingResult: 'savedLocally', lastRunAck: ack });
                    const ctx = get().lastContext;
                    if (ctx) sendWatchContext({ ...ctx, runAck: ack });
                } finally {
                    processingRunIds.delete(runId);
                }
            })
        );

        unsubFns.push(
            onReachabilityChange((reachable) => {
                set({ isReachable: reachable });
            })
        );

        unsubFns.push(
            onPairedChange((paired) => {
                set({ isPaired: paired });
                if (paired) get().resendLastContext();
            })
        );

        unsubFns.push(
            onApplicationContextError(() => {
                const ctx = get().lastContext;
                if (!ctx || contextRetryAttempt >= CONTEXT_RETRY_DELAYS_MS.length) {
                    console.warn('[AppleWatchStore] retry de contexto esgotado');
                    return;
                }
                cancelContextRetry();
                const delay = CONTEXT_RETRY_DELAYS_MS[contextRetryAttempt];
                contextRetryAttempt += 1;
                console.warn(
                    `[AppleWatchStore] retry de contexto ${contextRetryAttempt}/${CONTEXT_RETRY_DELAYS_MS.length} em ${delay}ms`,
                );
                contextRetryTimer = setTimeout(() => {
                    contextRetryTimer = null;
                    const latest = get().lastContext;
                    if (latest) sendWatchContext(latest);
                }, delay);
            })
        );

        console.log('[AppleWatchStore] bootstrap complete', { paired, installed });
    },

    sendContextToWatch: (ctx) => {
        try {
            cancelContextRetry();
            contextRetryAttempt = 0;

            if (!isWatchContext(ctx)) {
                console.warn('[AppleWatchStore] sincronização ignorada: contexto ausente ou inválido');
                return;
            }

            const previous = get().lastContext;
            if (previous !== null && !isWatchContext(previous)) {
                console.warn('[AppleWatchStore] contexto anterior inválido descartado');
            }

            const monotonic = mergeMonotonicWatchContext(previous, ctx);
            if (!monotonic) {
                console.warn('[AppleWatchStore] sincronização ignorada: merge sem contexto válido');
                return;
            }

            const enriched = { ...monotonic, runAck: get().lastRunAck };
            set({ lastContext: enriched });
            sendWatchContext(enriched);
        } catch (error) {
            // Watch é acessório: uma falha de contexto nunca pode derrubar o boot.
            console.warn('[AppleWatchStore] falha isolada ao montar/enviar contexto:', error);
        }
    },

    resendLastContext: () => {
        const ctx = get().lastContext;
        if (!ctx) {
            console.log('[AppleWatchStore] resend ignorado — nenhum contexto ainda');
            return;
        }
        cancelContextRetry();
        contextRetryAttempt = 0;
        console.log('[AppleWatchStore] reenviando contexto a pedido do Watch');
        sendWatchContext({ ...ctx, runAck: get().lastRunAck });
    },

    clearLastReceivedRun: () => set({ lastReceivedRun: null, lastReceivedAt: null, lastRoutingResult: null }),
}));

// Cleanup helper para hot-reload em dev (não é chamado em produção)
export function teardownAppleWatchStore() {
    cancelContextRetry();
    contextRetryAttempt = 0;
    unsubFns.forEach((fn) => fn());
    unsubFns = [];
    bootstrapped = false;
}
