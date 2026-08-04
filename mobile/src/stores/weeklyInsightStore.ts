import { create } from 'zustand';
import {
    getLatestWeeklyInsight,
    getUnseenWeeklyInsight,
    markWeeklyInsightSeen,
    applyWeeklyInsightAdjustment,
} from '../services/weeklyInsight';
import type {
    WeeklyInsight,
    ApplyAdjustmentResult,
} from '../types/weeklyInsight.types';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * ── DUAS PERGUNTAS DIFERENTES ────────────────────────────────────────────────
 *
 * `latest` alimenta o CARD persistente e a tela — aparece sempre que existe um
 * insight, mesmo já lido.
 * `unseen` alimenta o MODAL de entrada — dispara uma vez e some, senão a pessoa
 * aprende a fechar o modal no reflexo, sem ler.
 *
 * São dois campos e não um com flag porque o card não pode desaparecer quando o
 * modal é fechado: ele É a rede de segurança de quem fechou sem abrir.
 */
interface WeeklyInsightState {
    latest: WeeklyInsight | null;
    unseen: WeeklyInsight | null;
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    /** Trava local: o modal só é oferecido uma vez por sessão do app. */
    modalDismissedThisSession: boolean;
    applying: boolean;

    fetch: (force?: boolean) => Promise<void>;
    dismissModal: () => void;
    markSeen: (insightId: string) => Promise<void>;
    applyAdjustment: (insightId: string) => Promise<ApplyAdjustmentResult>;
    reset: () => void;
}

export const useWeeklyInsightStore = create<WeeklyInsightState>((set, get) => ({
    latest: null,
    unseen: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
    modalDismissedThisSession: false,
    applying: false,

    fetch: async (force = false) => {
        const { loading, lastFetchedAt } = get();
        if (loading) return;
        if (!force && lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
            return;
        }

        set({ loading: true, error: null });
        try {
            // Em paralelo: são duas queries independentes e a tela precisa das
            // duas na abertura.
            const [latest, unseen] = await Promise.all([
                getLatestWeeklyInsight(),
                getUnseenWeeklyInsight(),
            ]);
            set({ latest, unseen, loading: false, lastFetchedAt: Date.now() });
        } catch (err: unknown) {
            // Preserva o que já havia — a tela continua mostrando dado velho em
            // vez de piscar para vazio numa falha de rede.
            set({
                loading: false,
                error:
                    err instanceof Error
                        ? err.message
                        : 'Falha ao carregar o insight semanal',
            });
        }
    },

    dismissModal: () => set({ modalDismissedThisSession: true }),

    markSeen: async (insightId: string) => {
        // Otimista: some com o modal na hora. O carimbo no servidor é
        // best-effort — se falhar, o pior caso é o modal voltar uma vez.
        set((s) => ({
            unseen: null,
            modalDismissedThisSession: true,
            latest:
                s.latest && s.latest.id === insightId
                    ? { ...s.latest, seen_at: new Date().toISOString() }
                    : s.latest,
        }));
        await markWeeklyInsightSeen(insightId);
    },

    applyAdjustment: async (insightId: string) => {
        set({ applying: true });
        try {
            const result = await applyWeeklyInsightAdjustment(insightId);

            if (result.applied) {
                // Carimba localmente para o botão virar "aplicado" sem esperar
                // um refetch — a ação move o calendário e não pode ser repetida.
                set((s) => ({
                    latest:
                        s.latest && s.latest.id === insightId
                            ? {
                                  ...s.latest,
                                  adjustment_applied_at: new Date().toISOString(),
                              }
                            : s.latest,
                }));
            }
            return result;
        } finally {
            set({ applying: false });
        }
    },

    reset: () =>
        set({
            latest: null,
            unseen: null,
            loading: false,
            error: null,
            lastFetchedAt: null,
            modalDismissedThisSession: false,
            applying: false,
        }),
}));
