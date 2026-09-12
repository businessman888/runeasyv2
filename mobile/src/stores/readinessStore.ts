import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import { useWellnessStore } from './wellnessStore';
import {
    interpretAnalyzeResponse,
    toReadinessStatus,
} from '../utils/readinessPresentation';
import type {
    AnalyzeOutcome,
    ReadinessAnswers,
    ReadinessStatus,
    ReadinessVerdict,
} from '../types/readiness.types';

// Re-exportados: o barril `stores/index.ts` sempre expôs estes nomes daqui.
export type { AnalyzeOutcome, ReadinessAnswers, ReadinessStatus, ReadinessVerdict };

interface ReadinessState {
    // Quiz state
    answers: Partial<ReadinessAnswers>;
    currentStep: number;
    setNumber: number | undefined; // Question set number for exclusion tracking

    /**
     * O desfecho do check-in DESTA sessão do quiz — `null` enquanto não enviado.
     *
     * Um campo só, e não `verdict` + flags: `ja_respondeu`, `aprendendo` e o
     * Pro-gate eram descartados ou viravam exceção, e a tela não tinha como
     * distinguir "veredito novo" de "veredito antigo que o servidor devolveu".
     */
    outcome: AnalyzeOutcome | null;
    isLoading: boolean;
    /** Só falha de TRANSPORTE. Uma recusa do servidor é `outcome`, não erro. */
    error: string | null;

    // Status state
    readinessStatus: ReadinessStatus | null;
    statusLoading: boolean;

    // Actions
    setAnswer: (key: keyof ReadinessAnswers, value: number) => void;
    setSetNumber: (setNumber: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    resetQuiz: () => void;
    fetchVerdict: () => Promise<void>;
    fetchReadinessStatus: () => Promise<void>;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const REQUIRED_KEYS: (keyof ReadinessAnswers)[] = ['sleep', 'legs', 'mood', 'stress', 'motivation'];

/**
 * O status quando NÃO foi possível consultá-lo.
 *
 * Antes era tudo `false`, indistinguível de "ainda não treinou": uma queda de
 * rede fazia o card afirmar "Complete seu primeiro treino" para quem tinha 40
 * corridas. `indisponivel` dá à UI o direito de dizer a verdade.
 */
const STATUS_DESCONHECIDO: ReadinessStatus = {
    isUnlocked: false,
    hasCompletedFirstWorkout: false,
    canCheckInToday: false,
    hasCompletedToday: false,
    lastCheckInDate: null,
    todayVerdict: null,
    todayAnswers: null,
    learning: null,
    eligibilityReason: 'indisponivel',
};

async function readinessHeaders(): Promise<{ headers: Record<string, string>; userId: string | null }> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        userId,
        headers: {
            'Content-Type': 'application/json',
            ...(userId ? { 'x-user-id': userId } : {}),
        },
    };
}

export const useReadinessStore = create<ReadinessState>((set, get) => ({
    answers: {},
    currentStep: 0,
    setNumber: undefined,
    outcome: null,
    isLoading: false,
    error: null,
    readinessStatus: null,
    statusLoading: false,

    setAnswer: (key, value) => {
        set((state) => ({
            answers: { ...state.answers, [key]: value },
        }));
    },

    setSetNumber: (setNumber: number) => {
        set({ setNumber });
    },

    nextStep: () => {
        const { currentStep } = get();
        if (currentStep < REQUIRED_KEYS.length - 1) {
            set({ currentStep: currentStep + 1 });
        }
    },

    prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 0) {
            set({ currentStep: currentStep - 1 });
        }
    },

    /**
     * Zera a sessão do quiz. Chamado no INÍCIO de cada quiz, não só no fim.
     *
     * O store vive em memória e quem saía do resultado pelo "voltar" nunca
     * passava pela tela de sucesso (a única que limpava). Com o app aberto de um
     * dia para o outro, o resultado de amanhã via o desfecho de ontem e pulava a
     * busca — `ReadinessResultScreen` só envia quando não há desfecho nem erro.
     */
    resetQuiz: () => {
        set({
            answers: {},
            currentStep: 0,
            setNumber: undefined,
            outcome: null,
            isLoading: false,
            error: null,
        });
    },

    fetchVerdict: async () => {
        const { answers, setNumber } = get();

        if (REQUIRED_KEYS.some((key) => !answers[key])) {
            set({ error: 'Faltou responder uma pergunta. Volte e complete o check-in.' });
            return;
        }

        set({ isLoading: true, error: null, outcome: null });

        try {
            const { headers, userId } = await readinessHeaders();

            // A identidade vem do token no backend; `userId` no corpo só existe
            // porque um backend anterior à R.0 o lia de lá. Sem id, não se manda
            // nenhum — nunca um id inventado.
            //
            // ⚠️ Não logar `answers`: é dado de saúde autorrelatado.
            const response = await authedFetch(`${API_URL}/readiness/analyze`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    ...(userId ? { userId } : {}),
                    answers: answers as ReadinessAnswers,
                    setNumber,
                }),
            });

            const body: unknown = await response.json().catch(() => null);
            const outcome = interpretAnalyzeResponse(response.status, body);
            if (!outcome) {
                throw new Error(`HTTP ${response.status}`);
            }

            set({ outcome, isLoading: false });
            // O card da Wellness só vira "Respondido hoje" se o resumo for rebuscado.
            if (outcome.kind === 'ok') {
                useWellnessStore.getState().reset();
            }
        } catch (error) {
            console.error('[Readiness] analyze falhou:', error);
            set({
                error: 'Não consegui analisar sua prontidão agora. Verifique sua conexão e tente de novo.',
                isLoading: false,
            });
        }
    },

    fetchReadinessStatus: async () => {
        set({ statusLoading: true });
        try {
            const { headers } = await readinessHeaders();
            // Cache-bust além dos headers: a elegibilidade muda às 03:00 e a cada
            // corrida, e um status velho reabre o quiz para quem já respondeu.
            const response = await authedFetch(
                `${API_URL}/readiness/status?_t=${Date.now()}`,
                { method: 'GET', headers },
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const status = toReadinessStatus(await response.json());
            if (!status) {
                throw new Error('corpo de /readiness/status ilegível');
            }
            set({ readinessStatus: status, statusLoading: false });
        } catch (error) {
            console.error('[Readiness] /status falhou:', error);
            set({ readinessStatus: STATUS_DESCONHECIDO, statusLoading: false });
        }
    },
}));
