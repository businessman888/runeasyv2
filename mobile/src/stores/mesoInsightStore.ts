import { create } from 'zustand';
import {
    getLatestMesoInsight,
    markMesoInsightSeen,
} from '../services/mesoInsight';
import type { MesoInsight } from '../types/mesoInsight.types';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * O insight de mesociclo mais recente — espelho do `weeklyInsightStore`.
 *
 * Mesma regra de exibição, e pelo mesmo motivo: só o bloco MAIS RECENTE entra
 * no carrossel. Um bloco antigo nunca visto é HISTÓRICO, não notificação —
 * trazê-lo de volta mostraria como novidade um resumo de dois meses atrás.
 *
 * Não há `applyAdjustment` aqui: o insight de bloco é reflexão pura.
 */
interface MesoInsightState {
    /** O bloco fechado mais recente. `null` quando ainda não há nenhum. */
    latest: MesoInsight | null;
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;

    fetch: (force?: boolean) => Promise<void>;
    markSeen: (insightId: string) => Promise<void>;
    reset: () => void;
}

/** O insight que o carrossel deve mostrar — ou `null` para não mostrar nada. */
export function selectUnseenMeso(
    latest: MesoInsight | null,
): MesoInsight | null {
    return latest && latest.seen_at === null ? latest : null;
}

export const useMesoInsightStore = create<MesoInsightState>((set, get) => ({
    latest: null,
    loading: false,
    error: null,
    lastFetchedAt: null,

    fetch: async (force = false) => {
        const { loading, lastFetchedAt } = get();
        if (loading) return;
        if (!force && lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
            return;
        }

        set({ loading: true, error: null });
        try {
            const latest = await getLatestMesoInsight();
            set({ latest, loading: false, lastFetchedAt: Date.now() });
        } catch (err: unknown) {
            // Preserva o que já havia — melhor dado velho que piscar para vazio
            // numa falha de rede.
            set({
                loading: false,
                error:
                    err instanceof Error
                        ? err.message
                        : 'Falha ao carregar o insight de mesociclo',
            });
        }
    },

    markSeen: async (insightId: string) => {
        // Otimista: carimba na hora, e o card sai do carrossel na próxima
        // abertura por consequência. O write é best-effort — no pior caso o
        // card reaparece uma vez.
        set((s) => ({
            latest:
                s.latest && s.latest.id === insightId
                    ? { ...s.latest, seen_at: new Date().toISOString() }
                    : s.latest,
        }));
        await markMesoInsightSeen(insightId);
    },

    reset: () =>
        set({
            latest: null,
            loading: false,
            error: null,
            lastFetchedAt: null,
        }),
}));
