import { create } from 'zustand';
import { Platform } from 'react-native';
import {
    initAppleWatch,
    isWatchPaired,
    isWatchAppInstalled,
    onCompletedRun,
    onReachabilityChange,
    onPairedChange,
    sendTodayWorkout,
    sendWatchContext,
    type CompletedRunFromWatch,
    type TodayWorkoutForWatch,
    type WatchContext,
} from '../services/appleWatch';
import {
    useTrainingStore,
    type WorkoutTrackingPayload,
    type FreeRunPayload,
    type RoutePoint,
} from './trainingStore';

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

    // actions
    bootstrap: () => Promise<void>;
    sendTodayWorkoutToWatch: (workout: TodayWorkoutForWatch | null, userName: string) => void;
    sendContextToWatch: (ctx: WatchContext) => void;
    /** Reenvia o último contexto. No-op se nada foi enviado ainda. */
    resendLastContext: () => void;
    clearLastReceivedRun: () => void;
}

let bootstrapped = false;
let unsubFns: Array<() => void> = [];

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

/**
 * Roteia uma corrida recebida do Watch para o trainingStore existente.
 * Reutiliza completeWorkout (treino do plano) ou completeFreeRun (corrida livre).
 * Ambos têm fila offline MMKV — se o backend falhar, a corrida fica pending
 * e é enviada na próxima vez que o app for aberto online.
 */
async function routeCompletedRunToTraining(run: CompletedRunFromWatch): Promise<'success' | 'savedLocally'> {
    const trainingStore = useTrainingStore.getState();
    const route_points = mapRoutePoints(run.route_points);
    const externalId = `apple_watch_${run.workout_id ?? 'free'}_${run.started_at}`;

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
        const localId = `watch_free_${run.started_at}_${run.duration_seconds}`;
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
                console.log('[AppleWatchStore] received completed run:', {
                    workout_id: run.workout_id,
                    distance_m: run.total_distance_meters,
                    duration_s: run.duration_seconds,
                    points: run.route_points?.length ?? 0,
                });
                set({ lastReceivedRun: run, lastReceivedAt: Date.now() });

                try {
                    const result = await routeCompletedRunToTraining(run);
                    set({ lastRoutingResult: result });
                    console.log(`[AppleWatchStore] routed → ${result}`);
                } catch (err) {
                    console.error('[AppleWatchStore] routing error:', err);
                    set({ lastRoutingResult: 'savedLocally' });
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
            })
        );

        console.log('[AppleWatchStore] bootstrap complete', { paired, installed });
    },

    sendTodayWorkoutToWatch: (workout, userName) => {
        sendTodayWorkout(workout, userName);
    },

    sendContextToWatch: (ctx) => {
        set({ lastContext: ctx });
        sendWatchContext(ctx);
    },

    resendLastContext: () => {
        const ctx = get().lastContext;
        if (!ctx) {
            console.log('[AppleWatchStore] resend ignorado — nenhum contexto ainda');
            return;
        }
        console.log('[AppleWatchStore] reenviando contexto a pedido do Watch');
        sendWatchContext(ctx);
    },

    clearLastReceivedRun: () => set({ lastReceivedRun: null, lastReceivedAt: null, lastRoutingResult: null }),
}));

// Cleanup helper para hot-reload em dev (não é chamado em produção)
export function teardownAppleWatchStore() {
    unsubFns.forEach((fn) => fn());
    unsubFns = [];
    bootstrapped = false;
}
