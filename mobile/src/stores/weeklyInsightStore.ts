import { create } from 'zustand';
import {
    getLatestWeeklyInsight,
    markWeeklyInsightSeen,
    applyWeeklyInsightAdjustment,
} from '../services/weeklyInsight';
import type {
    WeeklyInsight,
    ApplyAdjustmentResult,
} from '../types/weeklyInsight.types';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * ── UMA LINHA, TRÊS CONSUMIDORES ─────────────────────────────────────────────
 *
 * `latest` é a semana fechada MAIS RECENTE, e alimenta o card persistente, a
 * tela e o modal. O modal só aparece quando ESSA linha ainda não foi vista
 * (`seen_at === null`) — ver `selectUnseen`.
 *
 * ── O BUG QUE ISTO CORRIGE ───────────────────────────────────────────────────
 *
 * Antes havia um segundo campo `unseen`, vindo de uma consulta própria que
 * pegava o mais recente ENTRE OS NÃO VISTOS. Com a semana 2 já lida e a semana 1
 * (zerada, do recuo de teste) nunca aberta, o modal voltava para a semana 1 e
 * exibia 0 km como se fosse novidade.
 *
 * Semana antiga não vista é HISTÓRICO, não notificação. Derivando do `latest`, o
 * card e o modal passam a falar da mesma linha — a discordância entre os dois
 * deixa de ser possível por construção, não por disciplina.
 */
interface WeeklyInsightState {
    /** A semana fechada mais recente. `null` quando ainda não há nenhuma. */
    latest: WeeklyInsight | null;
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

/**
 * O insight que o MODAL deve mostrar — ou `null` para não mostrar nada.
 *
 * Só a semana mais recente entra. Se ela já foi vista, o modal não aparece,
 * mesmo que existam semanas anteriores nunca abertas.
 */
export function selectUnseen(
    latest: WeeklyInsight | null,
): WeeklyInsight | null {
    return latest && latest.seen_at === null ? latest : null;
}

export const useWeeklyInsightStore = create<WeeklyInsightState>((set, get) => ({
    latest: null,
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
            const latest = await getLatestWeeklyInsight();
            set({ latest, loading: false, lastFetchedAt: Date.now() });
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
        // Otimista: carimba `seen_at` na hora. O write no servidor é
        // best-effort — se falhar, o pior caso é o card voltar uma vez.
        //
        // NÃO dispensa a folha. Até a Fase 4 isto também setava
        // `modalDismissedThisSession`, porque o único jeito de marcar como visto
        // era ABRINDO a tela — carimbar e fechar eram o mesmo gesto. Com o
        // carrossel deixaram de ser: deslizar até o segundo card carimba o
        // primeiro, e o efeito colateral fecharia a folha no meio do gesto.
        // Quem dispensa agora é `dismissModal`, chamado explicitamente por quem
        // fecha ou navega.
        set((s) => ({
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
            loading: false,
            error: null,
            lastFetchedAt: null,
            modalDismissedThisSession: false,
            applying: false,
        }),
}));
