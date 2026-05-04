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
    type CompletedRunFromWatch,
    type TodayWorkoutForWatch,
} from '../services/appleWatch';

interface AppleWatchState {
    isPaired: boolean;
    isInstalled: boolean;
    isReachable: boolean;
    lastReceivedRun: CompletedRunFromWatch | null;
    lastReceivedAt: number | null;

    // actions
    bootstrap: () => Promise<void>;
    sendTodayWorkoutToWatch: (workout: TodayWorkoutForWatch | null, userName: string) => void;
    clearLastReceivedRun: () => void;
}

let bootstrapped = false;
let unsubFns: Array<() => void> = [];

export const useAppleWatchStore = create<AppleWatchState>((set, _get) => ({
    isPaired: false,
    isInstalled: false,
    isReachable: false,
    lastReceivedRun: null,
    lastReceivedAt: null,

    bootstrap: async () => {
        if (bootstrapped) return;
        if (Platform.OS !== 'ios') return;
        bootstrapped = true;

        initAppleWatch();

        // Status inicial
        const [paired, installed] = await Promise.all([
            isWatchPaired(),
            isWatchAppInstalled(),
        ]);
        set({ isPaired: paired, isInstalled: installed });

        // Listeners contínuos
        unsubFns.push(
            onCompletedRun((run) => {
                console.log('[AppleWatchStore] received completed run:', {
                    workout_id: run.workout_id,
                    distance_m: run.total_distance_meters,
                    duration_s: run.duration_seconds,
                    points: run.route_points?.length ?? 0,
                });
                set({ lastReceivedRun: run, lastReceivedAt: Date.now() });
                // TODO Phase 5: aqui vamos rotear pro trainingStore.completeWorkout / completeFreeRun
                // baseado em run.workout_id (null = corrida livre)
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

    clearLastReceivedRun: () => set({ lastReceivedRun: null, lastReceivedAt: null }),
}));

// Cleanup helper para hot-reload em dev (não é chamado em produção)
export function teardownAppleWatchStore() {
    unsubFns.forEach((fn) => fn());
    unsubFns = [];
    bootstrapped = false;
}
