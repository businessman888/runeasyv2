import { create } from 'zustand';
import { getWellnessSummary } from '../services/wellness';
import type {
    WellnessSummary,
    EvolutionMetric,
} from '../types/wellness.types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
let forcedRefreshQueued = false;

interface WellnessState {
    summary: WellnessSummary | null;
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    evolutionTab: EvolutionMetric;

    fetchSummary: (force?: boolean) => Promise<void>;
    setEvolutionTab: (tab: EvolutionMetric) => void;
    reset: () => void;
}

export const useWellnessStore = create<WellnessState>((set, get) => ({
    summary: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
    evolutionTab: 'distance',

    fetchSummary: async (force = false) => {
        const { lastFetchedAt, loading } = get();
        if (loading) {
            // A conclusão do Watch pode chegar enquanto a Home ainda carrega um
            // snapshot anterior. Não descarte o refresh forçado: execute-o logo
            // depois da requisição em curso para não manter FC/calorias antigas.
            if (force) forcedRefreshQueued = true;
            return;
        }
        if (
            !force &&
            lastFetchedAt &&
            Date.now() - lastFetchedAt < CACHE_TTL_MS
        ) {
            return;
        }

        set({ loading: true, error: null });
        try {
            const summary = await getWellnessSummary();
            set({
                summary,
                loading: false,
                lastFetchedAt: Date.now(),
                error: null,
            });
        } catch (err: any) {
            // Preserve previous summary on error so the UI keeps showing data.
            set({
                loading: false,
                error: err?.message || 'Falha ao carregar wellness',
            });
        } finally {
            if (forcedRefreshQueued) {
                forcedRefreshQueued = false;
                void get().fetchSummary(true);
            }
        }
    },

    setEvolutionTab: (tab) => set({ evolutionTab: tab }),

    /**
     * Invalidate the cache without clearing the current summary.
     * Call from: trainingStore.completeWorkout, readinessStore.submitCheckIn,
     * healthKitStore.syncRecent — so the next fetch hits the network.
     */
    reset: () => set({ lastFetchedAt: null, error: null }),
}));
