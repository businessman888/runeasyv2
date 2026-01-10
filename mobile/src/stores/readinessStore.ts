import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

// Types matching backend response
export interface ReadinessVerdict {
    readiness_score: number;
    status_color: 'green' | 'yellow' | 'red';
    status_label: string;
    ai_analysis: {
        headline: string;
        reasoning: string;
        plan_adjustment: string;
    };
    metrics_summary: Array<{
        label: string;
        value: string;
        sublabel?: string;
        icon: string;
    }>;
    generated_at: string;
}

export interface ReadinessAnswers {
    sleep: number;      // 1-5
    legs: number;       // 1-5
    mood: number;       // 1-5
    stress: number;     // 1-5
    motivation: number; // 1-5
}

export interface ReadinessStatus {
    isUnlocked: boolean;
    hasCompletedFirstWorkout: boolean;
    canCheckInToday: boolean;
    hasCompletedToday: boolean;
    lastCheckInDate: string | null;
    todayVerdict: ReadinessVerdict | null;
}

interface ReadinessState {
    // Quiz state
    answers: Partial<ReadinessAnswers>;
    currentStep: number;

    // Verdict state
    verdict: ReadinessVerdict | null;
    isLoading: boolean;
    error: string | null;

    // Status state
    readinessStatus: ReadinessStatus | null;
    statusLoading: boolean;

    // Actions
    setAnswer: (key: keyof ReadinessAnswers, value: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    resetQuiz: () => void;
    fetchVerdict: () => Promise<void>;
    clearVerdict: () => void;
    fetchReadinessStatus: () => Promise<void>;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

// Map step index to answer key
const STEP_KEYS: (keyof ReadinessAnswers)[] = ['sleep', 'legs', 'mood', 'stress', 'motivation'];

export const useReadinessStore = create<ReadinessState>((set, get) => ({
    answers: {},
    currentStep: 0,
    verdict: null,
    isLoading: false,
    error: null,
    readinessStatus: null,
    statusLoading: false,

    setAnswer: (key, value) => {
        set((state) => ({
            answers: { ...state.answers, [key]: value },
        }));
    },

    nextStep: () => {
        const { currentStep, answers } = get();
        const currentKey = STEP_KEYS[currentStep];

        // Store current answer and move to next
        if (currentStep < 4) {
            set({ currentStep: currentStep + 1 });
        }
    },

    prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 0) {
            set({ currentStep: currentStep - 1 });
        }
    },

    resetQuiz: () => {
        set({
            answers: {},
            currentStep: 0,
            verdict: null,
            error: null,
        });
    },

    fetchVerdict: async () => {
        const { answers } = get();

        // Validate all answers are present
        const requiredKeys: (keyof ReadinessAnswers)[] = ['sleep', 'legs', 'mood', 'stress', 'motivation'];
        for (const key of requiredKeys) {
            if (!answers[key]) {
                console.warn(`Missing answer for ${key}, answers:`, answers);
                set({ error: `Resposta faltando: ${key}` });
                return;
            }
        }

        try {
            set({ isLoading: true, error: null });

            // Get userId or use a fallback for testing
            let userId = await getUserId();
            if (!userId) {
                console.warn('No userId found, using test fallback');
                userId = 'test-user-fallback';
            }

            console.log('Fetching verdict with:', {
                url: `${API_URL}/readiness/analyze`,
                userId,
                answers
            });

            const response = await fetch(`${API_URL}/readiness/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    userId,
                    answers: answers as ReadinessAnswers,
                }),
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const verdict: ReadinessVerdict = await response.json();
            console.log('Verdict received:', verdict);
            set({ verdict, isLoading: false });
        } catch (error) {
            console.error('Fetch verdict error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            set({
                error: `Falha ao analisar prontidão: ${errorMessage}`,
                isLoading: false
            });
        }
    },

    clearVerdict: () => {
        set({ verdict: null, error: null });
    },

    fetchReadinessStatus: async () => {
        try {
            set({ statusLoading: true });

            let userId = await getUserId();
            if (!userId) {
                console.warn('No userId found for status check');
                set({
                    readinessStatus: {
                        isUnlocked: false,
                        hasCompletedFirstWorkout: false,
                        canCheckInToday: false,
                        hasCompletedToday: false,
                        lastCheckInDate: null,
                        todayVerdict: null,
                    },
                    statusLoading: false
                });
                return;
            }

            console.log('Fetching readiness status for user:', userId);

            const response = await fetch(`${API_URL}/readiness/status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Status API Error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const status: ReadinessStatus = await response.json();
            console.log('Readiness status received:', status);
            set({ readinessStatus: status, statusLoading: false });
        } catch (error) {
            console.error('Fetch readiness status error:', error);
            set({
                readinessStatus: {
                    isUnlocked: false,
                    hasCompletedFirstWorkout: false,
                    canCheckInToday: false,
                    hasCompletedToday: false,
                    lastCheckInDate: null,
                    todayVerdict: null,
                },
                statusLoading: false
            });
        }
    },
}));
