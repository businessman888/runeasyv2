import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';

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
    recentDistance: number | null; // 3, 5, 10, or 15 km — 0 = "nunca corri" (sentinela)
    distanceTime: { hours: number; minutes: number; seconds: number } | null;
    calculatedPace: number | null; // min/km calculated from distance and time
    startDate: string | null; // ISO string for start date

    // Capacidade atual (Fase A) — alimentam o motor de volume determinístico da
    // Fase B. Guardados como enum-string; a derivação numérica é feita na Fase B.
    recentFrequency: string | null;  // 'never' | '1x' | '2x' | '3x' | '4x_plus'
    currentWeeklyKm: string | null;  // 'lt5' | '5_10' | '10_20' | '20_30' | 'gt30'
    walkCapacity: string | null;     // 'easy' | 'effort' | 'not_yet' (só no fluxo "nunca corri")

    // Original remaining fields
    paceMinutes: string; // Timeframe screen - pace minutes
    paceSeconds: string; // Timeframe screen - pace seconds
    dontKnowPace: boolean; // Timeframe screen - don't know pace option
    currentPace5k: number | null;
    targetWeeks: number;
    limitations: { hasLimitation: boolean; details: string } | null; // Limitations screen - physical limitations
    preferredDays: number[];
    goalTimeframe: number | null; // Goal timeframe in months (1, 3, 6)
    preferredWearable: string | null; // 'garmin' | 'polar' | 'fitbit' | 'apple_watch' | null

    // Race goal (Fase 2). When goal_type === 'race' the plan is anchored to the
    // race date; ObjectiveScreen + GoalTimeframeScreen are skipped.
    goal_type: 'distance' | 'race' | null;
    race_id: string | null;
    race_date: string | null; // 'YYYY-MM-DD'
    race_name: string | null;
    race_distance: number | null; // km
    use_manual_race_date: boolean; // user chose "Inserir data manualmente"

    // Referral / influencer code (optional). Set by ReferralCodeScreen after
    // a successful POST /referral/apply. Drives Superwall placement choice.
    referralCode: string | null;
    referralInfluencerId: string | null;
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

// Veredito de viabilidade da meta (Fase C) — retornado pelo /onboarding/precheck.
export interface ViabilityCheck {
    feasible: boolean;
    neverRan: boolean;
    minWeeksRecommended: number; // semanas mínimas p/ a meta ficar viável
    maxGoalKmInWindow: number;   // maior meta (km) viável no prazo atual
    peakLongRunKm: number;
    requiredWeeklyIncreasePct: number;
    /**
     * Só para PROVAS com data marcada: a rampa exigida passou do limiar dedicado
     * (bem mais tolerante que o das metas de distância). Acende o aviso
     * informativo — não bloqueia e não muda o plano. Sempre `false` fora do
     * caminho de prova.
     */
    raceRiskWarning: boolean;
}

// ── Prévia determinística do plano (BriefingScreen, PRÉ-pagamento) ──────────
// Espelha PlanPreviewDto do backend. SEM IA: vem dos motores puros (volume +
// pace), os mesmos da geração real — então o treino #1 mostrado é o treino #1
// que o usuário vai receber.

export interface PreviewWalkRunStructure {
    reps: number;
    runSeconds: number;
    walkSeconds: number;
}

export interface PreviewWorkout {
    type: string;
    zone: string | null;
    /** `null` no walk/run — o treino é por TEMPO. */
    distanceKm: number | null;
    durationSeconds: number;
    /** Segundos/km. `null` no walk/run: não existe pace-alvo. */
    paceRangeSeconds: { min: number; max: number } | null;
    structure?: PreviewWalkRunStructure;
}

export interface PlanPreview {
    mode: 'run' | 'walk_run';
    week1FirstWorkout: PreviewWorkout;
    archetypeKey: string;
    hasLimitation: boolean;
    effectiveWeeklyKm: number;
    week1TotalKm: number | null;
    viability: {
        feasible: boolean;
        minWeeksRecommended: number;
        maxGoalKmInWindow: number;
        peakLongRunKm: number;
        requiredWeeklyIncreasePct: number;
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
    pendingPlanId: string | null;
    error: string | null;
    errorCode: typeof ONBOARDING_ERRORS[keyof typeof ONBOARDING_ERRORS] | null;
    lastGenerationStatus: number | null;
    xpEarned: number;

    // Actions
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    updateData: (data: Partial<OnboardingData>) => void;
    reset: () => void;
    complete: () => void;
    addXP: (delta: number) => void;
    submitOnboarding: () => Promise<GeneratedPlanResult | null>;
    saveOnboardingOnly: () => Promise<boolean>;
    triggerPlanGeneration: () => Promise<string | null>;
    checkViability: (overrides?: { goal?: string; goalTimeframe?: number }) => Promise<ViabilityCheck>;
    fetchPlanPreview: () => Promise<PlanPreview | null>;
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

    // Capacidade atual (Fase A)
    recentFrequency: null,
    currentWeeklyKm: null,
    walkCapacity: null,

    // Original remaining fields
    paceMinutes: '',
    paceSeconds: '',
    dontKnowPace: false,
    currentPace5k: null,
    targetWeeks: 8,
    limitations: null,
    preferredDays: [],
    goalTimeframe: null,
    preferredWearable: null,
    goal_type: 'distance',
    race_id: null,
    race_date: null,
    race_name: null,
    race_distance: null,
    use_manual_race_date: false,
    referralCode: null,
    referralInfluencerId: null,
};

/** Maps a race distance (km) to the legacy distance goal, so archetype/level
 *  logic still works when ObjectiveScreen is skipped on the race path. */
export function deriveGoalFromDistance(km: number | null | undefined): string {
    if (km == null) return 'general_fitness';
    if (km <= 5) return '5k';
    if (km <= 10) return '10k';
    if (km <= 21.1) return 'half_marathon';
    return 'marathon';
}

/** Race fields shared by every onboarding request body. */
function raceRequestFields(data: Partial<OnboardingData>) {
    return {
        goal_type: data.goal_type ?? 'distance',
        race_id: data.race_id ?? null,
        race_date: data.race_date ?? null,
        race_name: data.race_name ?? null,
        race_distance: data.race_distance ?? null,
    };
}

/** Resolves the goal sent to the backend (race path derives it from distance). */
function resolveGoal(data: Partial<OnboardingData>): string {
    return data.goal_type === 'race'
        ? deriveGoalFromDistance(data.race_distance)
        : data.goal || '10k';
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
    currentStep: 0,
    data: initialData,
    isComplete: false,
    isGenerating: false,
    generatedPlan: null,
    pendingPlanId: null,
    error: null,
    errorCode: null,
    lastGenerationStatus: null,
    xpEarned: 0,

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
        pendingPlanId: null,
        error: null,
        errorCode: null,
        lastGenerationStatus: null,
        xpEarned: 0,
    }),

    complete: () => set({ isComplete: true }),

    addXP: (delta) => set((state) => ({ xpEarned: state.xpEarned + delta })),

    clearError: () => set({ error: null, errorCode: null }),

    submitOnboarding: async () => {
        const { data, xpEarned } = get();

        set({ isGenerating: true, error: null, errorCode: null });

        try {
            // Get the user ID from local storage (set during Google login)
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

            // ==========================================
            // DATA SANITIZATION
            // ==========================================

            // Sanitize weight: ensure it's a number
            let sanitizedWeight: number | null = null;
            if (data.weight !== null && data.weight !== undefined) {
                sanitizedWeight = typeof data.weight === 'string'
                    ? parseFloat(data.weight)
                    : Number(data.weight);
                if (isNaN(sanitizedWeight)) sanitizedWeight = null;
            }

            // Sanitize height: ensure it's a number
            let sanitizedHeight: number | null = null;
            if (data.height !== null && data.height !== undefined) {
                sanitizedHeight = typeof data.height === 'string'
                    ? parseFloat(data.height)
                    : Number(data.height);
                if (isNaN(sanitizedHeight)) sanitizedHeight = null;
            }

            // Sanitize birthDate: convert to ISO string format
            let sanitizedBirthDate: string | null = null;
            if (data.birthDate) {
                const { day, month, year } = data.birthDate;
                // Create ISO date string (YYYY-MM-DD)
                const monthStr = String(month).padStart(2, '0');
                const dayStr = String(day).padStart(2, '0');
                sanitizedBirthDate = `${year}-${monthStr}-${dayStr}`;
            }

            // Sanitize startDate: ensure it's an ISO string
            // data.startDate is already string | null in store, just validate format
            let sanitizedStartDate: string | null = null;
            if (data.startDate && typeof data.startDate === 'string') {
                // Already a string, just use it
                sanitizedStartDate = data.startDate;
            }

            const requestBody = {
                // Biometrics (Sanitized)
                birth_date: sanitizedBirthDate,
                weight: sanitizedWeight,
                height: sanitizedHeight,

                // Original fields
                goal: resolveGoal(data),
                level: data.experience_level || 'beginner',
                days_per_week: data.daysPerWeek || 3,

                // Availability (New)
                available_days: data.availableDays || [],
                intense_day_index: data.intenseDayIndex ?? null,

                // Pace data
                current_pace_5k: data.currentPace5k ?? null,
                pace_minutes: data.paceMinutes || null,
                pace_seconds: data.paceSeconds || null,
                dont_know_pace: data.dontKnowPace || false,

                // Goal duration: convert months → weeks (1 month = 4 weeks).
                // On the race path goal_timeframe is null; backend derives the
                // horizon from race_date.
                goal_timeframe: data.goalTimeframe ?? null,
                target_weeks: data.goalTimeframe ? data.goalTimeframe * 4 : (data.targetWeeks || 8),

                // Map object { hasLimitation, details } to string or null for API
                limitations: data.limitations?.hasLimitation ? data.limitations.details : null,
                preferred_days: data.preferredDays || [],

                // Race goal
                ...raceRequestFields(data),

                // Performance Baseline (New)
                recent_distance: data.recentDistance ?? null,
                distance_time: data.distanceTime ?? null,
                calculated_pace: data.calculatedPace ?? null,
                start_date: sanitizedStartDate,

                // Capacidade atual (Fase A) — transporte para o motor de volume (Fase B)
                recent_frequency: data.recentFrequency ?? null,
                current_weekly_km: data.currentWeeklyKm ?? null,
                walk_capacity: data.walkCapacity ?? null,

                // Onboarding XP (credited to user upon successful submission)
                onboarding_xp: xpEarned ?? 0,
            };

            const requestUrl = `${API_URL}/training/onboarding`;

            // DEBUG LOGS
            console.log('=== ONBOARDING SUBMISSION ===');
            console.log('API_URL:', API_URL);
            console.log('Request URL:', requestUrl);
            console.log('User ID:', userId);
            console.log('Request Body:', JSON.stringify(requestBody, null, 2));
            console.log('Data Types:');
            console.log('  - weight:', typeof requestBody.weight, requestBody.weight);
            console.log('  - height:', typeof requestBody.height, requestBody.height);
            console.log('  - birth_date:', typeof requestBody.birth_date, requestBody.birth_date);

            const response = await authedFetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify(requestBody),
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                let errorData: any = {};
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { rawResponse: errorText };
                }

                console.error('=== RAILWAY API ERROR ===');
                console.error('Status:', response.status);
                console.error('Response:', errorText);

                // Import Alert dynamically to avoid issues
                const { Alert } = require('react-native');

                // Show detailed error to user
                const errorMessage = errorData.message || errorData.error || errorText || 'Erro desconhecido';
                const errorDetails = JSON.stringify(errorData, null, 2);

                Alert.alert(
                    `❌ Erro do Backend (${response.status})`,
                    `Mensagem: ${errorMessage}\n\nDetalhes:\n${errorDetails.substring(0, 500)}`,
                    [{ text: 'OK' }]
                );

                throw new Error(errorMessage);
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
            console.error('Error stack:', error?.stack);

            let errorMessage = 'Erro desconhecido';
            let errorCode: typeof ONBOARDING_ERRORS[keyof typeof ONBOARDING_ERRORS] = ONBOARDING_ERRORS.API_ERROR;

            if (error instanceof Error) {
                errorMessage = error.message;
                // Check for network error
                if (error.message.includes('Network request failed') ||
                    error.message.includes('fetch') ||
                    error.name === 'TypeError') {
                    errorCode = ONBOARDING_ERRORS.NETWORK_ERROR;
                    errorMessage = `Erro de conexão. Verifique se o backend está acessível.\n\nURL: ${API_URL}`;

                    // Show network error alert
                    const { Alert } = require('react-native');
                    Alert.alert(
                        '🌐 Erro de Conexão',
                        errorMessage,
                        [{ text: 'OK' }]
                    );
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

    /**
     * Save onboarding data to backend WITHOUT triggering AI generation.
     * Called after paywall subscription is confirmed.
     */
    saveOnboardingOnly: async () => {
        const { data, xpEarned } = get();

        try {
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) {
                console.error('[saveOnboardingOnly] No user_id found');
                return false;
            }

            // Same sanitization as submitOnboarding
            let sanitizedWeight: number | null = null;
            if (data.weight !== null && data.weight !== undefined) {
                sanitizedWeight = typeof data.weight === 'string'
                    ? parseFloat(data.weight as unknown as string)
                    : Number(data.weight);
                if (isNaN(sanitizedWeight)) sanitizedWeight = null;
            }

            let sanitizedHeight: number | null = null;
            if (data.height !== null && data.height !== undefined) {
                sanitizedHeight = typeof data.height === 'string'
                    ? parseFloat(data.height as unknown as string)
                    : Number(data.height);
                if (isNaN(sanitizedHeight)) sanitizedHeight = null;
            }

            let sanitizedBirthDate: string | null = null;
            if (data.birthDate) {
                const { day, month, year } = data.birthDate;
                const monthStr = String(month).padStart(2, '0');
                const dayStr = String(day).padStart(2, '0');
                sanitizedBirthDate = `${year}-${monthStr}-${dayStr}`;
            }

            let sanitizedStartDate: string | null = null;
            if (data.startDate && typeof data.startDate === 'string') {
                sanitizedStartDate = data.startDate;
            }

            const requestBody = {
                birth_date: sanitizedBirthDate,
                weight: sanitizedWeight,
                height: sanitizedHeight,
                goal: resolveGoal(data),
                level: data.experience_level || 'beginner',
                days_per_week: data.daysPerWeek || 3,
                available_days: data.availableDays || [],
                intense_day_index: data.intenseDayIndex ?? null,
                current_pace_5k: data.currentPace5k ?? null,
                pace_minutes: data.paceMinutes || null,
                pace_seconds: data.paceSeconds || null,
                dont_know_pace: data.dontKnowPace || false,
                goal_timeframe: data.goalTimeframe ?? null,
                target_weeks: data.goalTimeframe ? data.goalTimeframe * 4 : (data.targetWeeks || 8),
                limitations: data.limitations?.hasLimitation ? data.limitations.details : null,
                preferred_days: data.preferredDays || [],
                ...raceRequestFields(data),
                recent_distance: data.recentDistance ?? null,
                distance_time: data.distanceTime ?? null,
                calculated_pace: data.calculatedPace ?? null,
                start_date: sanitizedStartDate,
                recent_frequency: data.recentFrequency ?? null,
                current_weekly_km: data.currentWeeklyKm ?? null,
                walk_capacity: data.walkCapacity ?? null,
                onboarding_xp: xpEarned ?? 0,
            };

            console.log('[saveOnboardingOnly] Saving onboarding data (no AI)...');

            const response = await authedFetch(`${API_URL}/training/onboarding/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[saveOnboardingOnly] Error:', response.status, errorText);
                return false;
            }

            console.log('[saveOnboardingOnly] Onboarding data saved successfully');
            set({ isComplete: true });
            return true;
        } catch (error) {
            console.error('[saveOnboardingOnly] Error:', error);
            return false;
        }
    },

    /**
     * Trigger AI plan generation after user has subscribed.
     * Called from HomeScreen after navigation.
     */
    triggerPlanGeneration: async () => {
        try {
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) {
                console.error('[triggerPlanGeneration] No user_id found');
                set({ lastGenerationStatus: null });
                return null;
            }

            console.log('[triggerPlanGeneration] Triggering AI plan generation for userId:', userId);

            const response = await authedFetch(`${API_URL}/training/onboarding/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
            });

            set({ lastGenerationStatus: response.status });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[triggerPlanGeneration] Error:', response.status, errorText);
                return null;
            }

            const result = await response.json();
            console.log('[triggerPlanGeneration] Plan generation started, plan_id:', result.plan_id);

            set({
                pendingPlanId: result.plan_id,
                generatedPlan: result,
            });

            return result.plan_id;
        } catch (error) {
            console.error('[triggerPlanGeneration] Error:', error);
            set({ lastGenerationStatus: null });
            return null;
        }
    },

    /**
     * Pré-check de viabilidade da meta (Fase C). Chamado ANTES de finalizar o
     * onboarding e a cada ajuste no modal de viabilidade. `overrides` permite
     * revalidar uma meta/prazo hipotético sem gravar no estado ainda.
     *
     * FAIL-OPEN: qualquer erro/timeout → `feasible:true` (com console.warn) pra
     * NUNCA prender o usuário; a rede de segurança do backend (dias distintos) e o
     * plano conservador ainda protegem. Timeout curto (5s) p/ não travar em rede ruim.
     */
    checkViability: async (overrides) => {
        const failOpen: ViabilityCheck = {
            feasible: true,
            neverRan: false,
            minWeeksRecommended: 0,
            maxGoalKmInWindow: 0,
            peakLongRunKm: 0,
            requiredWeeklyIncreasePct: 0,
            raceRiskWarning: false, // fail-open: erro de rede → sem aviso
        };
        try {
            const { data } = get();
            const userId = await Storage.getItemAsync('user_id');

            const goal = overrides?.goal ?? resolveGoal(data);
            const goalTimeframe = overrides?.goalTimeframe ?? data.goalTimeframe ?? null;
            const targetWeeks = goalTimeframe ? goalTimeframe * 4 : (data.targetWeeks || 8);

            const body = {
                ...raceRequestFields(data), // goal_type + race_id/date/name/distance
                goal,
                goal_timeframe: goalTimeframe,
                target_weeks: targetWeeks,
                level: data.experience_level || 'beginner',
                days_per_week: data.daysPerWeek || 3,
                recent_distance: data.recentDistance ?? null,
                recent_frequency: data.recentFrequency ?? null,
                current_weekly_km: data.currentWeeklyKm ?? null,
            };

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            let response: Response;
            try {
                response = await authedFetch(`${API_URL}/training/onboarding/precheck`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId || '',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }

            if (!response.ok) {
                console.warn('[checkViability] non-OK, fail-open:', response.status);
                return failOpen;
            }
            return (await response.json()) as ViabilityCheck;
        } catch (error) {
            console.warn('[checkViability] error, fail-open:', error);
            return failOpen;
        }
    },

    /**
     * Prévia determinística do 1º treino + chave do arquétipo (BriefingScreen).
     * Chamada durante os 8s do PlanLoadingScreen, que já eram ociosos.
     *
     * SEM IA e SEM DB no backend — só os motores puros. Timeout de 5s (< 8s da
     * animação), então a resposta sempre chega antes da navegação.
     *
     * FAIL-CLOSED quanto ao CONTEÚDO: erro → `null`, e a tela cai na narrativa
     * neutra SEM número nenhum. Nunca inventar distância/pace — era exatamente
     * esse o bug que a refatoração corrigiu.
     */
    fetchPlanPreview: async () => {
        try {
            const { data } = get();
            const userId = await Storage.getItemAsync('user_id');

            const body = {
                ...raceRequestFields(data),
                goal: resolveGoal(data),
                goal_timeframe: data.goalTimeframe ?? null,
                target_weeks: data.goalTimeframe
                    ? data.goalTimeframe * 4
                    : (data.targetWeeks || 8),
                level: data.experience_level || 'beginner',
                days_per_week: data.daysPerWeek || 3,
                recent_distance: data.recentDistance ?? null,
                recent_frequency: data.recentFrequency ?? null,
                current_weekly_km: data.currentWeeklyKm ?? null,
                // Campos que o /precheck NÃO envia e a prévia precisa:
                walk_capacity: data.walkCapacity ?? null,
                calculated_pace: data.calculatedPace ?? null,
                current_pace_5k: data.currentPace5k ?? null,
                pace_minutes: data.paceMinutes || null,
                pace_seconds: data.paceSeconds || null,
                limitations: data.limitations?.hasLimitation
                    ? data.limitations.details
                    : null,
            };

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            let response: Response;
            try {
                response = await authedFetch(`${API_URL}/training/onboarding/preview`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId || '',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }

            if (!response.ok) {
                console.warn('[fetchPlanPreview] non-OK:', response.status);
                return null;
            }
            return (await response.json()) as PlanPreview;
        } catch (error) {
            console.warn('[fetchPlanPreview] error, prévia neutra:', error);
            return null;
        }
    },
}));
