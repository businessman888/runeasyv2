import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from '../services/apiClient';
import type { PlanOverviewResponse } from '../types/plan-overview.types';
import { useWellnessStore } from './wellnessStore';

// ─── Persistência offline para workouts pendentes ────────────────────────────
const pendingWorkoutsStorage = createMMKV({ id: 'pending-workouts' });
const pendingFreeRunsStorage = createMMKV({ id: 'pending-free-runs' });

export interface RoutePoint {
    latitude: number;
    longitude: number;
    altitude: number | null;
    timestamp: number;
    speed: number | null;
    accuracy: number | null;
}

/**
 * Campos opcionais passados pelo Watch (HKWorkoutSession + WatchConnectivity)
 * via `appleWatchStore`. Quando ausentes, mantém-se o comportamento histórico
 * (source='phone', sem HR/calorias, pace calculado pelo backend).
 */
export interface WorkoutSourceMetadata {
    /**
     * 'phone' (default), 'apple_watch' (Apple Watch), 'garmin_watch' (Connect IQ),
     * 'health_connect' (Android Health Connect — Galaxy Watch via Samsung Health,
     * or any HC-publishing app) ou 'apple_health' (iOS HealthKit sync).
     */
    source?: 'phone' | 'apple_watch' | 'garmin_watch' | 'health_connect' | 'apple_health';
    /** ISO 8601 do início da corrida — relevante quando source != 'phone' */
    started_at?: string;
    /** Identificador externo (ex.: HKWorkout UUID, Garmin activity id) para dedup */
    external_id?: string;
    /** FC média BPM */
    average_heartrate?: number;
    /** FC máxima BPM */
    max_heartrate?: number;
    /** Calorias ativas (kcal) */
    calories?: number;
    /** Pace médio em segundos por km */
    avg_pace_seconds_per_km?: number;
    /** Modelo do relógio Garmin (ex.: "fēnix 7 Pro") quando source='garmin_watch' */
    garmin_device_name?: string;
    /**
     * Ambiente onde o treino foi realizado. Default 'outdoor' (mantém
     * comportamento histórico). 'treadmill' indica corrida em esteira —
     * `route_points` pode vir vazio e `treadmill_data` traz métricas FTMS.
     */
    environment?: 'outdoor' | 'treadmill';
    /** Metadados da esteira (FTMS ou modo manual) — espelha backend DTO. */
    treadmill_data?: TreadmillDataPayload;
}

export interface TreadmillDataPayload {
    is_smart: boolean;
    device_name?: string;
    avg_speed_kmh?: number;
    max_speed_kmh?: number;
    avg_incline?: number;
    total_calories?: number;
    speed_samples?: { t: number; kmh: number; incline?: number }[];
}

export interface WorkoutTrackingPayload extends WorkoutSourceMetadata {
    workoutId: string;
    route_points: RoutePoint[];
    total_distance_meters: number;
    duration_seconds: number;
}

export interface FreeRunPayload extends WorkoutSourceMetadata {
    /** Local id (uuid) usado apenas para deduplicar pendentes — não é enviado pro backend */
    localId: string;
    route_points: RoutePoint[];
    total_distance_meters: number;
    duration_seconds: number;
    city?: string;
}

/** Salva um workout pendente no MMKV para retry posterior */
function savePendingWorkout(payload: WorkoutTrackingPayload) {
    try {
        const existing = pendingWorkoutsStorage.getString('pending_list');
        const list: WorkoutTrackingPayload[] = existing ? JSON.parse(existing) : [];
        // Evita duplicatas pelo workoutId
        const alreadyExists = list.some(w => w.workoutId === payload.workoutId);
        if (alreadyExists) {
            console.log(`[PendingWorkouts] Workout ${payload.workoutId} já existe no pending, ignorando duplicata`);
            return;
        }
        list.push(payload);
        pendingWorkoutsStorage.set('pending_list', JSON.stringify(list));
        console.log(`[PendingWorkouts] Salvo localmente. workoutId=${payload.workoutId}, dist=${payload.total_distance_meters}m, dur=${payload.duration_seconds}s, pontos=${payload.route_points.length}. Total pendentes: ${list.length}`);
    } catch (e) {
        console.error('[PendingWorkouts] ERRO CRÍTICO ao salvar workout pendente:', e);
    }
}

/** Remove um workout pendente pelo workoutId */
function removePendingWorkout(workoutId: string) {
    try {
        const existing = pendingWorkoutsStorage.getString('pending_list');
        if (!existing) return;
        const list: WorkoutTrackingPayload[] = JSON.parse(existing);
        const filtered = list.filter(w => w.workoutId !== workoutId);
        pendingWorkoutsStorage.set('pending_list', JSON.stringify(filtered));
        console.log(`[PendingWorkouts] Removido ${workoutId} do pending. Restantes: ${filtered.length}`);
    } catch (e) {
        console.error('[PendingWorkouts] Erro ao remover workout pendente:', e);
    }
}

/** Retorna todos os workouts pendentes */
function getPendingWorkouts(): WorkoutTrackingPayload[] {
    try {
        const existing = pendingWorkoutsStorage.getString('pending_list');
        const list = existing ? JSON.parse(existing) : [];
        console.log(`[PendingWorkouts] getPendingWorkouts() → ${list.length} pendente(s)`);
        return list;
    } catch (e) {
        console.error('[PendingWorkouts] Erro ao ler workouts pendentes:', e);
        return [];
    }
}

/** Debug: lista workouts pendentes no console */
export function debugPendingWorkouts(): WorkoutTrackingPayload[] {
    const pending = getPendingWorkouts();
    if (pending.length === 0) {
        console.log('[PendingWorkouts DEBUG] Nenhum workout pendente no MMKV');
    } else {
        pending.forEach((w, i) => {
            console.log(`[PendingWorkouts DEBUG] [${i}] id=${w.workoutId}, dist=${w.total_distance_meters}m, dur=${w.duration_seconds}s, pontos=${w.route_points.length}`);
        });
    }
    return pending;
}

// ─── Persistência offline de free runs ───────────────────────────────────────
function savePendingFreeRun(payload: FreeRunPayload) {
    try {
        const existing = pendingFreeRunsStorage.getString('pending_list');
        const list: FreeRunPayload[] = existing ? JSON.parse(existing) : [];
        if (list.some(r => r.localId === payload.localId)) {
            console.log(`[PendingFreeRuns] localId ${payload.localId} já existe, ignorando duplicata`);
            return;
        }
        list.push(payload);
        pendingFreeRunsStorage.set('pending_list', JSON.stringify(list));
        console.log(`[PendingFreeRuns] Salvo localmente. localId=${payload.localId}, dist=${payload.total_distance_meters}m, dur=${payload.duration_seconds}s. Total pendentes: ${list.length}`);
    } catch (e) {
        console.error('[PendingFreeRuns] ERRO CRÍTICO ao salvar free run:', e);
    }
}

function removePendingFreeRun(localId: string) {
    try {
        const existing = pendingFreeRunsStorage.getString('pending_list');
        if (!existing) return;
        const list: FreeRunPayload[] = JSON.parse(existing);
        const filtered = list.filter(r => r.localId !== localId);
        pendingFreeRunsStorage.set('pending_list', JSON.stringify(filtered));
        console.log(`[PendingFreeRuns] Removido ${localId}. Restantes: ${filtered.length}`);
    } catch (e) {
        console.error('[PendingFreeRuns] Erro ao remover free run pendente:', e);
    }
}

function getPendingFreeRuns(): FreeRunPayload[] {
    try {
        const existing = pendingFreeRunsStorage.getString('pending_list');
        return existing ? JSON.parse(existing) : [];
    } catch {
        return [];
    }
}

// ─── De-dup do Garmin (janela de 10 minutos) ─────────────────────────────────
/**
 * Mapa `external_id → timestamp(ms)` persistido em MMKV para evitar reenviar
 * o MESMO payload de treino vindo da Garmin (via Connect IQ) num intervalo
 * curto. O backend `ActivitySyncService` já tem dedup ±10min por `external_id`,
 * mas esta trava local evita o round-trip de rede + race conditions quando o
 * Garmin SDK ou um mock manda o mesmo evento duas vezes (acontece na prática
 * quando o app é morto e retorna, ou quando o listener é re-registrado).
 *
 * Aplica APENAS para `source === 'garmin_watch'` — Apple Watch e telefone já
 * têm seus próprios mecanismos (HKWorkout UUID, GPS task lock).
 */
const garminDedupStorage = createMMKV({ id: 'garmin-recent-sends' });
const GARMIN_DEDUP_WINDOW_MS = 10 * 60 * 1000;

function getGarminDedupMap(): Record<string, number> {
    try {
        const raw = garminDedupStorage.getString('map');
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function pruneGarminDedupMap(map: Record<string, number>): Record<string, number> {
    const cutoff = Date.now() - GARMIN_DEDUP_WINDOW_MS;
    const cleaned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(map)) {
        if (ts >= cutoff) cleaned[id] = ts;
    }
    return cleaned;
}

/** Retorna `true` se este `external_id` foi enviado nos últimos 10 minutos. */
function wasRecentlySentToGarminBackend(externalId: string): boolean {
    if (!externalId) return false;
    const map = pruneGarminDedupMap(getGarminDedupMap());
    const ts = map[externalId];
    if (!ts) return false;
    const ageMs = Date.now() - ts;
    return ageMs < GARMIN_DEDUP_WINDOW_MS;
}

/** Registra o envio de um `external_id` no mapa de dedup (com cleanup de TTL). */
function markGarminSent(externalId: string) {
    if (!externalId) return;
    try {
        const map = pruneGarminDedupMap(getGarminDedupMap());
        map[externalId] = Date.now();
        garminDedupStorage.set('map', JSON.stringify(map));
    } catch (e) {
        console.warn('[GarminDedup] Falha ao registrar envio:', e);
    }
}

export type WorkoutSource = 'plan' | 'manual' | 'free';
export type WorkoutType =
    | 'easy_run'
    | 'long_run'
    | 'intervals'
    | 'tempo'
    | 'recovery'
    | 'fartlek'
    | 'progressive'
    | 'repetition'
    | 'hill_repeats'
    | 'race_simulation'
    | 'race_day'
    | 'free_run';

export type TrainingZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
export type WorkoutPhase = 'base' | 'build' | 'peak' | 'taper';

export interface WorkoutMetadata {
    zone?: TrainingZone | null;
    perceived_effort?: string | null;       // ex.: "7/10"
    scientific_note?: string | null;        // 1 frase, PT-BR
    week_phase?: WorkoutPhase | null;
    segment_descriptions?: Array<{
        type: 'warmup' | 'main' | 'cooldown';
        zone?: TrainingZone | null;
        description?: string | null;
        coach_note?: string | null;          // voz do coach por bloco (≤20 palavras)
    }> | null;
}

export interface ManualWorkoutDto {
    title: string;
    type: Exclude<WorkoutType, 'free_run'>;
    scheduled_date: string;
    distance_km: number;
    target_pace_seconds: number;
    target_duration_seconds: number;
    scheduled_time?: string;
}

interface Workout {
    id: string;
    plan_id: string | null;
    week_number: number | null;
    scheduled_date: string | null;
    type: WorkoutType;
    distance_km: number;
    objective: string;
    tips: string[];
    status: 'pending' | 'completed' | 'skipped' | 'missed';
    activity_id?: string | null;
    /** Set by the backend for completed plan workouts that already have a feedback row. */
    feedback_id?: string | null;
    source?: WorkoutSource;
    title?: string | null;
    target_pace_seconds?: number | null;
    target_duration_seconds?: number | null;
    instructions_json: Array<{
        type: 'warmup' | 'main' | 'cooldown';
        distance_km: number;
        pace_min: number;
        pace_max: number;
    }>;
    /** Daniels-based enrichment. Null/undefined for legacy workouts created
     *  before the scientific refinement — the UI must render gracefully. */
    metadata?: WorkoutMetadata | null;
    /** Ambiente do treino — set pelo backend no insert. Quando 'treadmill',
     *  a UI esconde o mapa e troca splits por gráfico de velocidade. */
    environment?: 'outdoor' | 'treadmill' | null;
    /** Métricas executadas, escritas em `workouts` pelo backend ao completar.
     *  São redundantes com `activities.distance/moving_time` mas sobrevivem
     *  quando a activity row está faltando (legacy / esteira sem GPS), e por
     *  isso a UI usa como fallback para pintar headers antes de hidratar. */
    distance_run?: number | null;          // km
    time_run_seconds?: number | null;       // segundos
    pace_seconds_per_km?: number | null;    // segundos por km
    completed_at?: string | null;
    /** TRUE only for the race-day placeholder workout (race goal). */
    is_race_day?: boolean;
    /** Percepção de esforço REPORTADA pelo atleta (Borg CR10, 1–10). Null quando
     *  ainda não respondeu — a coleta é opcional. NÃO confundir com
     *  `metadata.perceived_effort`, que é o esforço PRESCRITO pela IA. */
    rpe?: number | null;
}

/** Returned by GET /training/workouts/:id — workout row enriched with the
 *  linked activity (gps_route + execution metrics) so RunSummary can render
 *  the real route when opened from Home/History. */
export interface WorkoutDetails extends Workout {
    activity: {
        id: number;
        name: string;
        distance: number;            // metros
        moving_time: number;          // segundos
        elapsed_time?: number;
        /** Segundos por km — unidade canônica (ver utils/pace.ts). Linhas
         *  gravadas antes de 2026-07-30 podem vir em decimal min/km; normalize
         *  sempre com `paceValueToSecondsPerKm` antes de usar. */
        average_pace: number;
        average_speed: number;        // m/s
        total_elevation_gain?: number;
        elevation_gain?: number;
        /** Perfil de elevação suavizado do DEM (Mapbox Terrain-DEM). Quando presente,
         *  a RunSummary usa este perfil em vez de recalcular a altimetria do GPS. */
        elevation_profile?: Array<{ distanceKm: number; altitudeM: number }> | null;
        start_date: string;
        gps_route: Array<{
            latitude: number;
            longitude: number;
            altitude: number | null;
            timestamp: number;
            speed: number | null;
            accuracy: number | null;
        }> | null;
        /** FC média em BPM. Populado quando vier de wearable (Apple Watch, Garmin, etc.) */
        average_heartrate?: number | null;
        /** FC máxima em BPM. Populado quando vier de wearable. */
        max_heartrate?: number | null;
        /** Calorias ativas em kcal. Populado quando vier de wearable. */
        calories?: number | null;
        /** Fonte da activity ('phone' | 'apple_watch' | 'garmin' | 'fitbit' | 'polar' | 'apple_health'). */
        source?: string | null;
        /** Ambiente onde a activity foi gerada — usado pela RunSummary/CoachAnalysis
         *  para alternar entre layout outdoor (mapa) e treadmill (gráfico). */
        environment?: 'outdoor' | 'treadmill' | null;
        /** Metadados FTMS ou manual de esteira. Presente apenas em environment='treadmill'. */
        treadmill_data?: TreadmillDataPayload | null;
    } | null;
}

// Schedule day from API - type and status are authoritative
export interface ScheduleDay {
    date: string;
    type: 'workout' | 'recovery' | null;
    status: 'completed' | 'missed' | 'pending' | null;
    workout: {
        id: string;
        type: string;
        distance_km: number;
        objective: string | null;
        instructions_json: any[];
        tips: string | null;
        source?: WorkoutSource;
        title?: string | null;
        target_pace_seconds?: number | null;
        target_duration_seconds?: number | null;
        activity_id?: string | null;
        feedback_id?: string | null;
    } | null;
    is_today: boolean;
    is_past: boolean;
}

interface TrainingPlan {
    id: string;
    user_id: string;
    goal: string;
    duration_weeks: number;
    frequency_per_week: number;
    status: 'active' | 'completed' | 'cancelled';
    generation_status?: 'partial' | 'generating' | 'complete' | 'failed';
}

export type GenerationStatus = 'partial' | 'generating' | 'complete' | 'failed' | null;

interface TrainingState {
    plan: TrainingPlan | null;
    workouts: Workout[];
    upcomingWorkouts: Workout[];
    schedule: ScheduleDay[];
    today: ScheduleDay | null;
    nextWorkout: Workout | null;
    planOverview: PlanOverviewResponse | null;
    planOverviewLoading: boolean;
    planOverviewError: string | null;
    isLoading: boolean;
    error: string | null;
    generationStatus: GenerationStatus;
    /**
     * Flag global de "analisando performance" — ligado durante o processamento
     * de um treino vindo de wearable (Garmin Connect IQ, Apple Watch). UI deve
     * mostrar overlay/spinner enquanto o backend insere a activity, gamificação
     * roda e (para plan workouts) o BullMQ feedback-queue enfileira o feedback.
     * Limpo quando a chamada ao backend resolve (sucesso OU falha).
     */
    isAnalyzingPerformance: boolean;

    // Actions
    fetchPlan: () => Promise<void>;
    fetchWorkouts: (startDate: string, endDate: string) => Promise<void>;
    fetchWorkoutDetails: (workoutId: string) => Promise<WorkoutDetails | null>;
    fetchUpcomingWorkouts: () => Promise<void>;
    fetchSchedule: (startDate: string, endDate: string) => Promise<void>;
    fetchPlanOverview: () => Promise<void>;
    clearPlanOverview: () => void;
    /**
     * Invalida TODO cache derivado do plano. Chamar depois de QUALQUER adaptação
     * aplicada (Fase 6) — é o que faz calendário, home e Metas convergirem.
     */
    invalidatePlanCaches: () => Promise<void>;
    skipWorkout: (workoutId: string, reason: string) => Promise<void>;
    /** RPE reportado (Borg CR10, 1–10). Lança em falha — o card oferece retry. */
    setWorkoutRpe: (workoutId: string, rpe: number) => Promise<void>;
    completeWorkout: (payload: WorkoutTrackingPayload) => Promise<{ success: boolean; savedLocally: boolean; workout?: Workout }>;
    completeFreeRun: (payload: FreeRunPayload) => Promise<{ success: boolean; savedLocally: boolean; workout?: Workout }>;
    createManualWorkout: (dto: ManualWorkoutDto) => Promise<Workout>;
    retryPendingWorkouts: () => Promise<void>;
    retryPendingFreeRuns: () => Promise<void>;
    checkPlanStatus: (planId: string) => Promise<boolean>;
    setGenerationStatus: (status: GenerationStatus) => void;
    setAnalyzingPerformance: (analyzing: boolean) => void;
    clearScheduleData: () => void;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
    plan: null,
    workouts: [],
    upcomingWorkouts: [],
    schedule: [],
    today: null,
    nextWorkout: null,
    planOverview: null,
    planOverviewLoading: false,
    planOverviewError: null,
    isLoading: false,
    error: null,
    generationStatus: null,
    isAnalyzingPerformance: false,

    setGenerationStatus: (status) => set({ generationStatus: status }),

    setAnalyzingPerformance: (analyzing) => set({ isAnalyzingPerformance: analyzing }),

    clearScheduleData: () => set({ today: null, nextWorkout: null, schedule: [] }),

    clearPlanOverview: () => set({ planOverview: null, planOverviewError: null }),

    /**
     * ── A INVALIDAÇÃO ÚNICA (Fase 6.2) ───────────────────────────────────────
     *
     * Uma adaptação muda `workouts` no servidor, e este store guarda CINCO
     * projeções desses mesmos treinos — `workouts`, `schedule`/`today`/
     * `nextWorkout`, `upcomingWorkouts`, `plan` e `planOverview`. Sem um lugar
     * só que as derrube todas, cada tela precisaria lembrar de se atualizar, e
     * foi exatamente assim que o `planOverview` ficou para trás (buscava uma vez
     * por sessão e nunca mais).
     *
     * UMA ação, UM chamador: o handler de sucesso do apply. Telas não chamam
     * isto — elas só revalidam no foco, como sempre.
     *
     * A janela é a mesma que Home e Calendar usam (mês corrente → +1 mês): o
     * objetivo é repovoar exatamente o que elas leem, não inventar um recorte
     * próprio que divergisse do delas.
     */
    invalidatePlanCaches: async () => {
        // Zera antes de buscar: `planOverview` é o único campo cuja tela ainda
        // decide por presença, então limpá-lo garante o skeleton em vez de um
        // número velho piscando enquanto a resposta não chega.
        set({ planOverview: null, planOverviewError: null });

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now);
        end.setMonth(end.getMonth() + 1);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        // Paralelo: são leituras independentes, e serializá-las multiplicaria a
        // espera logo depois de um gesto do usuário.
        await Promise.all([
            get().fetchSchedule(startStr, endStr),
            get().fetchWorkouts(startStr, endStr),
            get().fetchUpcomingWorkouts(),
            get().fetchPlanOverview(),
        ]);
    },

    fetchPlanOverview: async () => {
        try {
            set({ planOverviewLoading: true, planOverviewError: null });
            const userId = await getUserId();
            if (!userId) {
                set({ planOverviewError: 'Usuário não autenticado' });
                return;
            }

            const response = await authedFetch(`${API_URL}/training/plan/overview`, {
                headers: { 'x-user-id': userId },
            });

            if (response.status === 404) {
                set({ planOverview: null, planOverviewError: 'Nenhum plano ativo' });
                return;
            }

            if (!response.ok) {
                set({ planOverviewError: 'Falha ao carregar plano' });
                return;
            }

            const data = (await response.json()) as PlanOverviewResponse;
            set({ planOverview: data });
        } catch (e) {
            console.error('[fetchPlanOverview] erro:', e);
            set({ planOverviewError: 'Falha ao carregar plano' });
        } finally {
            set({ planOverviewLoading: false });
        }
    },

    fetchWorkoutDetails: async (workoutId: string) => {
        try {
            const userId = await getUserId();
            if (!userId) return null;
            const response = await authedFetch(`${API_URL}/training/workouts/${workoutId}`, {
                headers: { 'x-user-id': userId },
            });
            if (!response.ok) return null;
            const data = await response.json();
            return (data?.workout as WorkoutDetails) ?? null;
        } catch (e) {
            console.error('[fetchWorkoutDetails] erro:', e);
            return null;
        }
    },

    /**
     * Grava a percepção de esforço REPORTADA pelo atleta (Borg CR10, 1–10).
     *
     * Chamada separada da conclusão de propósito: a WorkoutProcessingScreen
     * submete o treino já no mount, então não há janela para responder antes.
     * O RpeSelector aparece na tela de destino (RunSummary / CoachAnalysis) e
     * chama isto quando o atleta escolhe um valor.
     *
     * Propaga o erro (em vez de engolir) para o card poder oferecer nova
     * tentativa em vez de fingir que salvou. Sem fila offline: RPE é opcional e
     * perde a validade se ressincronizado dias depois.
     */
    setWorkoutRpe: async (workoutId: string, rpe: number) => {
        const userId = await getUserId();
        if (!userId) throw new Error('Sem userId para gravar RPE');

        const response = await authedFetch(
            `${API_URL}/training/workouts/${workoutId}/rpe`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ rpe }),
            },
        );

        if (!response.ok) {
            const body = await response.text();
            console.error(`[setWorkoutRpe] API ${response.status}: ${body}`);
            throw new Error(`Falha ao gravar RPE (${response.status})`);
        }

        console.log(`[setWorkoutRpe] workout=${workoutId} rpe=${rpe} OK`);
    },

    fetchPlan: async () => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await authedFetch(`${API_URL}/training/plan`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({
                    plan: data.plan,
                    generationStatus: data.plan?.generation_status || null,
                });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar plano' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchWorkouts: async (startDate: string, endDate: string) => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await authedFetch(
                `${API_URL}/training/workouts?start_date=${startDate}&end_date=${endDate}`,
                { headers: { 'x-user-id': userId } }
            );

            if (response.ok) {
                const data = await response.json();
                set({ workouts: data.workouts });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar treinos' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchSchedule: async (startDate: string, endDate: string) => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await authedFetch(
                `${API_URL}/training/schedule?start_date=${startDate}&end_date=${endDate}`,
                { headers: { 'x-user-id': userId } }
            );

            if (response.ok) {
                const data = await response.json();
                set({
                    schedule: data.schedule,
                    today: data.today,
                    nextWorkout: data.next_workout,
                });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar cronograma' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchUpcomingWorkouts: async () => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await authedFetch(`${API_URL}/training/workouts/upcoming`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ upcomingWorkouts: data.workouts });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar próximos treinos' });
        } finally {
            set({ isLoading: false });
        }
    },

    checkPlanStatus: async (planId: string): Promise<boolean> => {
        try {
            const userId = await getUserId();
            if (!userId) return false;

            const response = await authedFetch(`${API_URL}/training/plan/${planId}/status`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ generationStatus: data.generation_status });

                // Return true if complete
                if (data.is_complete) {
                    // Refresh workouts when complete
                    await get().fetchUpcomingWorkouts();
                    const start = new Date();
                    const end = new Date();
                    end.setMonth(end.getMonth() + 1);
                    await get().fetchSchedule(
                        start.toISOString().split('T')[0],
                        end.toISOString().split('T')[0]
                    );
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Check plan status error:', error);
            return false;
        }
    },

    completeWorkout: async (payload: WorkoutTrackingPayload) => {
        console.log(`[completeWorkout] Iniciando. workoutId=${payload.workoutId}, dist=${payload.total_distance_meters}m, dur=${payload.duration_seconds}s, pontos=${payload.route_points.length}, source=${payload.source ?? 'phone'}`);

        const isGarminPayload = payload.source === 'garmin_watch';

        // Trava de dedup para Garmin: se este `external_id` foi enviado nos
        // últimos 10 min, ignoramos o envio (já está no backend / activity row
        // existe). Evita reenvios espúrios quando o listener do Connect IQ
        // dispara o mesmo evento duas vezes (race condition).
        if (isGarminPayload && payload.external_id && wasRecentlySentToGarminBackend(payload.external_id)) {
            console.log(`[completeWorkout] Garmin dedup hit: ${payload.external_id} já enviado nos últimos 10min — pulando.`);
            return { success: true, savedLocally: false };
        }

        // Liga o overlay global "analisando performance" para wearables
        // (Garmin / Apple Watch). Phone não dispara — o fluxo tradicional do
        // app já tem suas próprias telas de loading.
        const isWearablePayload = isGarminPayload || payload.source === 'apple_watch';
        if (isWearablePayload) set({ isAnalyzingPerformance: true });

        // SAFETY FIRST: salva localmente ANTES de tentar API
        // Se o app crashar/recarregar durante o fetch, os dados sobrevivem
        savePendingWorkout(payload);

        const userId = await getUserId();
        if (!userId) {
            console.warn('[completeWorkout] Sem userId — mantendo no pending para retry');
            if (isWearablePayload) set({ isAnalyzingPerformance: false });
            return { success: false, savedLocally: true };
        }

        console.log(`[completeWorkout] userId=${userId}, URL=${API_URL}/training/workouts/${payload.workoutId}/complete`);

        try {
            const response = await authedFetch(
                `${API_URL}/training/workouts/${payload.workoutId}/complete`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId,
                    },
                    body: JSON.stringify({
                        route_points: payload.route_points,
                        total_distance_meters: payload.total_distance_meters,
                        duration_seconds: payload.duration_seconds,
                        // Metadata opcional (Apple Watch, Garmin, etc.) — backend já aceita
                        ...(payload.source            && { source: payload.source }),
                        ...(payload.external_id       && { external_id: payload.external_id }),
                        ...(payload.started_at        && { started_at: payload.started_at }),
                        ...(payload.average_heartrate != null && { average_heartrate: payload.average_heartrate }),
                        ...(payload.max_heartrate     != null && { max_heartrate: payload.max_heartrate }),
                        ...(payload.calories          != null && { calories: payload.calories }),
                        ...(payload.avg_pace_seconds_per_km != null && { avg_pace_seconds_per_km: payload.avg_pace_seconds_per_km }),
                        ...(payload.garmin_device_name && { garmin_device_name: payload.garmin_device_name }),
                        ...(payload.environment       && { environment: payload.environment }),
                        ...(payload.treadmill_data    && { treadmill_data: payload.treadmill_data }),
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[completeWorkout] API error ${response.status}: ${errorText}`);
                // Dados já estão no pending — mantém lá
                return { success: false, savedLocally: true };
            }

            // Sucesso! Remove do pending e registra envio Garmin no dedup map.
            // Lê o workout retornado (contém `activity_id`) — usado pela tela de
            // processamento pós-treino para polling do feedback + navegação.
            let workout: Workout | undefined;
            try {
                const data = await response.json();
                workout = data?.workout;
            } catch {
                // Corpo vazio/não-JSON: não é fatal, seguimos sem o workout.
            }
            console.log(`[completeWorkout] Workout ${payload.workoutId} salvo no backend. activity_id=${workout?.activity_id ?? 'n/a'}`);
            set((state) => {
                const markCompleted = (day: ScheduleDay | null) => {
                    if (day?.workout?.id !== payload.workoutId) return day;
                    return {
                        ...day,
                        status: 'completed' as const,
                        workout: { ...day.workout, status: 'completed' as const },
                    };
                };
                return {
                    today: markCompleted(state.today),
                    schedule: state.schedule.map((day) => markCompleted(day) ?? day),
                    workouts: state.workouts.map((item) =>
                        item.id === payload.workoutId
                            ? { ...item, ...(workout ?? {}), status: 'completed' as const }
                            : item,
                    ),
                };
            });
            removePendingWorkout(payload.workoutId);
            if (isGarminPayload && payload.external_id) markGarminSent(payload.external_id);
            // Reconcile every source consumed by Home and useWatchSync before
            // resolving. Updating only upcomingWorkouts left today/schedule
            // stale, so the Watch could still start a workout completed on
            // the phone.
            await get().invalidatePlanCaches();
            useWellnessStore.getState().reset();
            return { success: true, savedLocally: false, workout };
        } catch (error) {
            console.error('[completeWorkout] Erro de rede:', error);
            // Dados já estão no pending — mantém lá para retry quando rede voltar
            return { success: false, savedLocally: true };
        } finally {
            if (isWearablePayload) set({ isAnalyzingPerformance: false });
        }
    },

    completeFreeRun: async (payload: FreeRunPayload) => {
        console.log(`[completeFreeRun] Iniciando. localId=${payload.localId}, dist=${payload.total_distance_meters}m, dur=${payload.duration_seconds}s, pontos=${payload.route_points.length}, source=${payload.source ?? 'phone'}`);

        const isGarminPayload = payload.source === 'garmin_watch';

        // Trava de dedup Garmin (idêntica ao completeWorkout — ver comentário lá).
        if (isGarminPayload && payload.external_id && wasRecentlySentToGarminBackend(payload.external_id)) {
            console.log(`[completeFreeRun] Garmin dedup hit: ${payload.external_id} já enviado nos últimos 10min — pulando.`);
            return { success: true, savedLocally: false };
        }

        const isWearablePayload = isGarminPayload || payload.source === 'apple_watch';
        if (isWearablePayload) set({ isAnalyzingPerformance: true });

        // SAFETY FIRST: salva localmente antes de tentar API
        savePendingFreeRun(payload);

        const userId = await getUserId();
        if (!userId) {
            console.warn('[completeFreeRun] Sem userId — mantendo no pending para retry');
            if (isWearablePayload) set({ isAnalyzingPerformance: false });
            return { success: false, savedLocally: true };
        }

        try {
            const response = await authedFetch(`${API_URL}/training/workouts/free/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    route_points: payload.route_points,
                    total_distance_meters: payload.total_distance_meters,
                    duration_seconds: payload.duration_seconds,
                    started_at: payload.started_at,
                    city: payload.city,
                    // Metadata opcional (Apple Watch, Garmin, etc.)
                    ...(payload.source            && { source: payload.source }),
                    ...(payload.external_id       && { external_id: payload.external_id }),
                    ...(payload.average_heartrate != null && { average_heartrate: payload.average_heartrate }),
                    ...(payload.max_heartrate     != null && { max_heartrate: payload.max_heartrate }),
                    ...(payload.calories          != null && { calories: payload.calories }),
                    ...(payload.avg_pace_seconds_per_km != null && { avg_pace_seconds_per_km: payload.avg_pace_seconds_per_km }),
                    ...(payload.garmin_device_name && { garmin_device_name: payload.garmin_device_name }),
                    ...(payload.environment       && { environment: payload.environment }),
                    ...(payload.treadmill_data    && { treadmill_data: payload.treadmill_data }),
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[completeFreeRun] API error ${response.status}: ${errorText}`);
                return { success: false, savedLocally: true };
            }

            if (isGarminPayload && payload.external_id) markGarminSent(payload.external_id);
            const data = await response.json();
            console.log(`[completeFreeRun] Free run salvo no backend. id=${data.workout?.id}`);
            if (data.workout?.id) {
                set((state) => {
                    const existingIndex = state.workouts.findIndex(
                        (item) => item.id === data.workout.id,
                    );
                    if (existingIndex < 0) {
                        return { workouts: [data.workout, ...state.workouts] };
                    }
                    return {
                        workouts: state.workouts.map((item, index) =>
                            index === existingIndex ? data.workout : item,
                        ),
                    };
                });
            }
            removePendingFreeRun(payload.localId);
            // Free activities are sourced from workouts in useWatchSync.
            // Refreshing the full completion surface prevents a completed run
            // from lingering as a pending card on iPhone/Watch.
            await get().invalidatePlanCaches();
            useWellnessStore.getState().reset();
            return { success: true, savedLocally: false, workout: data.workout };
        } catch (error) {
            console.error('[completeFreeRun] Erro de rede:', error);
            return { success: false, savedLocally: true };
        } finally {
            if (isWearablePayload) set({ isAnalyzingPerformance: false });
        }
    },

    createManualWorkout: async (dto: ManualWorkoutDto) => {
        const userId = await getUserId();
        if (!userId) throw new Error('Usuário não autenticado');

        const response = await authedFetch(`${API_URL}/training/workouts/manual`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
            },
            body: JSON.stringify(dto),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[createManualWorkout] API error ${response.status}: ${errorText}`);
            let message = 'Falha ao criar treino manual';
            try {
                const parsed = JSON.parse(errorText);
                if (Array.isArray(parsed.message)) message = parsed.message.join('; ');
                else if (typeof parsed.message === 'string') message = parsed.message;
            } catch {
                /* not JSON */
            }
            throw new Error(message);
        }

        const data = await response.json();
        // Refresh listas para o calendário/home pegarem o novo treino
        get().fetchUpcomingWorkouts();
        return data.workout as Workout;
    },

    retryPendingFreeRuns: async () => {
        const pending = getPendingFreeRuns();
        if (pending.length === 0) return;

        const userId = await getUserId();
        if (!userId) return;

        console.log(`[retryPendingFreeRuns] Tentando reenviar ${pending.length} free run(s)...`);

        for (const payload of pending) {
            try {
                const response = await authedFetch(`${API_URL}/training/workouts/free/complete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': userId,
                    },
                    body: JSON.stringify({
                        route_points: payload.route_points,
                        total_distance_meters: payload.total_distance_meters,
                        duration_seconds: payload.duration_seconds,
                        started_at: payload.started_at,
                        city: payload.city,
                        // Forward the SAME optional metadata completeFreeRun sends, so a
                        // retried run keeps its source/external_id (server-side dedup) and
                        // wearable stats (HR, calories, pace, treadmill) instead of losing them.
                        ...(payload.source            && { source: payload.source }),
                        ...(payload.external_id       && { external_id: payload.external_id }),
                        ...(payload.average_heartrate != null && { average_heartrate: payload.average_heartrate }),
                        ...(payload.max_heartrate     != null && { max_heartrate: payload.max_heartrate }),
                        ...(payload.calories          != null && { calories: payload.calories }),
                        ...(payload.avg_pace_seconds_per_km != null && { avg_pace_seconds_per_km: payload.avg_pace_seconds_per_km }),
                        ...(payload.garmin_device_name && { garmin_device_name: payload.garmin_device_name }),
                        ...(payload.environment       && { environment: payload.environment }),
                        ...(payload.treadmill_data    && { treadmill_data: payload.treadmill_data }),
                    }),
                });

                if (response.ok) {
                    removePendingFreeRun(payload.localId);
                    console.log(`[retryPendingFreeRuns] Free run ${payload.localId} reenviado com sucesso!`);
                } else {
                    const errorText = await response.text();
                    console.error(`[retryPendingFreeRuns] API error ${response.status} para ${payload.localId}: ${errorText}`);
                }
            } catch (e) {
                console.warn(`[retryPendingFreeRuns] Erro de rede para ${payload.localId}:`, e);
            }
        }
    },

    retryPendingWorkouts: async () => {
        const pending = getPendingWorkouts();
        if (pending.length === 0) {
            console.log('[retryPendingWorkouts] Nenhum workout pendente para reenviar');
            return;
        }

        const userId = await getUserId();
        if (!userId) {
            console.warn('[retryPendingWorkouts] Sem userId, adiando retry');
            return;
        }

        console.log(`[retryPendingWorkouts] Tentando reenviar ${pending.length} workout(s)...`);

        for (const payload of pending) {
            // Guard: never POST to /workouts/local_.../complete — the backend
            // rejects a synthetic id ("Workout not found") and the item would
            // loop in the queue forever. A synthetic id means the run had no
            // real plan/manual workout, so it belongs on the free-run queue.
            if (payload.workoutId.startsWith('local_')) {
                console.warn(`[retryPendingWorkouts] Ignorando id sintético ${payload.workoutId} (não é workout do backend); removendo do pending.`);
                removePendingWorkout(payload.workoutId);
                continue;
            }
            try {
                console.log(`[retryPendingWorkouts] Reenviando workoutId=${payload.workoutId}, dist=${payload.total_distance_meters}m`);
                const response = await authedFetch(
                    `${API_URL}/training/workouts/${payload.workoutId}/complete`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': userId,
                        },
                        // Reenvia o body COMPLETO (mesmo shape do completeWorkout).
                        // Antes só ia route_points/distance/duration, perdendo
                        // source/external_id/started_at/HR/environment/treadmill_data
                        // na sincronização — o que degradava a activity gerada e a
                        // análise do treinador do plano.
                        body: JSON.stringify({
                            route_points: payload.route_points,
                            total_distance_meters: payload.total_distance_meters,
                            duration_seconds: payload.duration_seconds,
                            ...(payload.source            && { source: payload.source }),
                            ...(payload.external_id       && { external_id: payload.external_id }),
                            ...(payload.started_at        && { started_at: payload.started_at }),
                            ...(payload.average_heartrate != null && { average_heartrate: payload.average_heartrate }),
                            ...(payload.max_heartrate     != null && { max_heartrate: payload.max_heartrate }),
                            ...(payload.calories          != null && { calories: payload.calories }),
                            ...(payload.avg_pace_seconds_per_km != null && { avg_pace_seconds_per_km: payload.avg_pace_seconds_per_km }),
                            ...(payload.garmin_device_name && { garmin_device_name: payload.garmin_device_name }),
                            ...(payload.environment       && { environment: payload.environment }),
                            ...(payload.treadmill_data    && { treadmill_data: payload.treadmill_data }),
                        }),
                    },
                );

                if (response.ok) {
                    removePendingWorkout(payload.workoutId);
                    console.log(`[retryPendingWorkouts] Workout ${payload.workoutId} enviado com sucesso!`);
                } else {
                    const errorText = await response.text();
                    console.error(`[retryPendingWorkouts] API error ${response.status} para ${payload.workoutId}: ${errorText}`);
                }
            } catch (e) {
                console.warn(`[retryPendingWorkouts] Erro de rede para ${payload.workoutId}:`, e);
            }
        }
    },

    skipWorkout: async (workoutId: string, reason: string) => {
        try {
            const userId = await getUserId();

            if (!userId) return;

            const response = await authedFetch(`${API_URL}/training/workouts/${workoutId}/skip`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ reason }),
            });

            if (response.ok) {
                // Refresh workouts
                await get().fetchUpcomingWorkouts();
            }
        } catch (error) {
            console.error('Skip workout error:', error);
        }
    },
}));


