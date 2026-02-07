import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

interface OnboardingData {
    // Biometrics Block (New)
    birthDate: { day: number; month: number; year: number } | null;
    weight: number | null;
    height: number | null;

    // Original fields
    goal: string;
    experience_level: string; // Level: beginner, intermediate, advanced
    daysPerWeek: number;

    // Availability Block (New)
    availableDays: number[]; // 0=DOM, 1=SEG, ..., 6=SAB
    intenseDayIndex: number | null; // Which day for intense workout

    // Original injury/pace fields
    hasInjury: boolean; // Pace screen - injury question
    injuryDetails: string; // Pace screen - injury details

    // Performance Block (New)
    recentDistance: number | null; // 3, 5, 10, or 15 km
    distanceTime: { hours: number; minutes: number; seconds: number } | null;
    calculatedPace: number | null; // min/km calculated from distance and time
    startDate: string | null; // ISO string for start date

    // Original remaining fields
    paceMinutes: string; // Timeframe screen - pace minutes
    paceSeconds: string; // Timeframe screen - pace seconds
    dontKnowPace: boolean; // Timeframe screen - don't know pace option
    currentPace5k: number | null;
    targetWeeks: number;
    limitations: string | null; // Limitations screen - physical limitations
    preferredDays: number[];
}


// Generated plan result from AI
export interface GeneratedPlanResult {
    plan_id: string;
    workouts_count: number;
    generation_status: 'partial' | 'generating' | 'complete' | 'failed';
    planHeader: {
        objectiveShort: string;
        durationWeeks: string;
        frequencyWeekly: string;
    };
    planHeadline: string;
    welcomeBadge: string;
    nextWorkout: {
        title: string;
        duration: string;
        paceEstimate: string;
        type: string;
    };
}

// Error codes for handling in UI
export const ONBOARDING_ERRORS = {
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    API_ERROR: 'API_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

interface OnboardingState {
    currentStep: number;
    data: Partial<OnboardingData>;
    isComplete: boolean;
    isGenerating: boolean;
    generatedPlan: GeneratedPlanResult | null;
    error: string | null;
    errorCode: typeof ONBOARDING_ERRORS[keyof typeof ONBOARDING_ERRORS] | null;

    // Actions
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    updateData: (data: Partial<OnboardingData>) => void;
    reset: () => void;
    complete: () => void;
    submitOnboarding: () => Promise<GeneratedPlanResult | null>;
    clearError: () => void;
}

const initialData: Partial<OnboardingData> = {
    // Biometrics Block (New)
    birthDate: null,
    weight: null,
    height: null,

    // Original fields
    goal: '',
    experience_level: '',
    daysPerWeek: 3,

    // Availability Block (New)
    availableDays: [],
    intenseDayIndex: null,

    // Original injury fields
    hasInjury: false,
    injuryDetails: '',

    // Performance Block (New)
    recentDistance: null,
    distanceTime: null,
    calculatedPace: null,
    startDate: null,

    // Original remaining fields
    paceMinutes: '',
    paceSeconds: '',
    dontKnowPace: false,
    currentPace5k: null,
    targetWeeks: 8,
    limitations: null,
    preferredDays: [],
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
    currentStep: 0,
    data: initialData,
    isComplete: false,
    isGenerating: false,
    generatedPlan: null,
    error: null,
    errorCode: null,

    setStep: (step) => set({ currentStep: step }),

    nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),

    prevStep: () => set((state) => ({
        currentStep: Math.max(0, state.currentStep - 1)
    })),

    updateData: (newData) => set((state) => ({
        data: { ...state.data, ...newData }
    })),

    reset: () => set({
        currentStep: 0,
        data: initialData,
        isComplete: false,
        isGenerating: false,
        generatedPlan: null,
        error: null,
        errorCode: null,
    }),

    complete: () => set({ isComplete: true }),

    clearError: () => set({ error: null, errorCode: null }),

    submitOnboarding: async () => {
        const { data } = get();

        set({ isGenerating: true, error: null, errorCode: null });

        try {
            // Get the user ID from local storage (set during Strava login)
            const userId = await Storage.getItemAsync('user_id');

            // If user is not authenticated, stop and require login
            if (!userId) {
                set({
                    error: 'Você precisa fazer login para gerar seu plano de treino.',
                    errorCode: ONBOARDING_ERRORS.AUTH_REQUIRED,
                    isGenerating: false
                });
                return null;
            }

            const requestBody = {
                // Biometrics (New)
                birth_date: data.birthDate,
                weight: data.weight,
                height: data.height,

                // Original fields
                goal: data.goal || '10k',
                level: data.experience_level || 'beginner',
                days_per_week: data.daysPerWeek || 3,

                // Availability (New)
                available_days: data.availableDays || [],
                intense_day_index: data.intenseDayIndex,

                // Original pace/limitations
                current_pace_5k: data.currentPace5k,
                target_weeks: data.targetWeeks || 8,
                limitations: data.limitations,
                preferred_days: data.preferredDays || [],

                // Performance Baseline (New)
                recent_distance: data.recentDistance,
                distance_time: data.distanceTime,
                calculated_pace: data.calculatedPace,
                start_date: data.startDate,
            };

            const requestUrl = `${API_URL}/training/onboarding`;

            // DEBUG LOGS
            console.log('=== ONBOARDING SUBMISSION ===');
            console.log('API_URL:', API_URL);
            console.log('Request URL:', requestUrl);
            console.log('User ID:', userId);
            console.log('Request Body:', JSON.stringify(requestBody, null, 2));

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify(requestBody),
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Error:', errorData);
                throw new Error(errorData.message || 'Failed to generate training plan');
            }

            const result: GeneratedPlanResult = await response.json();
            console.log('Onboarding success! Plan ID:', result.plan_id);

            set({
                generatedPlan: result,
                isComplete: true,
                isGenerating: false,
            });

            return result;
        } catch (error: any) {
            console.error('=== ONBOARDING ERROR ===');
            console.error('Error name:', error?.name);
            console.error('Error message:', error?.message);

            let errorMessage = 'Unknown error occurred';
            let errorCode: typeof ONBOARDING_ERRORS[keyof typeof ONBOARDING_ERRORS] = ONBOARDING_ERRORS.API_ERROR;

            if (error instanceof Error) {
                errorMessage = error.message;
                // Check for network error
                if (error.message.includes('Network request failed') ||
                    error.message.includes('fetch') ||
                    error.name === 'TypeError') {
                    errorCode = ONBOARDING_ERRORS.NETWORK_ERROR;
                    errorMessage = `Erro de conexão. Verifique se o backend está acessível. URL: ${API_URL}`;
                }
            }

            set({
                error: errorMessage,
                errorCode,
                isGenerating: false
            });
            console.error('Onboarding submission error:', error);
            return null;
        }
    },
}));

// Onboarding questions config
export const onboardingQuestions = [
    {
        id: 'goal',
        title: 'Qual é o seu objetivo?',
        subtitle: 'Isso nos ajuda a personalizar seu plano',
        type: 'select' as const,
        options: [
            { value: '5k', label: 'Correr 5K', icon: '🏃' },
            { value: '10k', label: 'Correr 10K', icon: '🏃‍♂️' },
            { value: 'half_marathon', label: 'Meia Maratona', icon: '🏅' },
            { value: 'marathon', label: 'Maratona', icon: '🏆' },
            { value: 'general_fitness', label: 'Condicionamento Geral', icon: '💪' },
        ],
    },
    {
        id: 'level',
        title: 'Qual é o seu nível atual?',
        subtitle: 'Seja honesto para evitar lesões',
        type: 'select' as const,
        options: [
            { value: 'beginner', label: 'Iniciante', description: '0-6 meses de experiência', icon: '🌱' },
            { value: 'intermediate', label: 'Intermediário', description: '6-24 meses de experiência', icon: '🌿' },
            { value: 'advanced', label: 'Avançado', description: '2+ anos de experiência', icon: '🌳' },
        ],
    },
    {
        id: 'daysPerWeek',
        title: 'Quantos dias por semana?',
        subtitle: 'Quanto tempo você pode dedicar',
        type: 'slider' as const,
        min: 2,
        max: 6,
        unit: 'dias',
    },
    {
        id: 'currentPace5k',
        title: 'Qual seu pace atual em 5K?',
        subtitle: 'Deixe vazio se não sabe',
        type: 'pace' as const,
        optional: true,
    },
    {
        id: 'targetWeeks',
        title: 'Em quantas semanas?',
        subtitle: 'Prazo para atingir seu objetivo',
        type: 'select' as const,
        options: [
            { value: 4, label: '4 semanas' },
            { value: 8, label: '8 semanas' },
            { value: 12, label: '12 semanas' },
            { value: 16, label: '16 semanas' },
        ],
    },
    {
        id: 'limitations',
        title: 'Alguma limitação física?',
        subtitle: 'Lesões anteriores, problemas de saúde, etc.',
        type: 'text' as const,
        optional: true,
        placeholder: 'Ex: dor no joelho direito...',
    },
];
