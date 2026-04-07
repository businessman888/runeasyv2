import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

// ─── Persistência offline para workouts pendentes ────────────────────────────
const pendingWorkoutsStorage = createMMKV({ id: 'pending-workouts' });

export interface WorkoutTrackingPayload {
    workoutId: string;
    route_points: Array<{
        latitude: number;
        longitude: number;
        altitude: number | null;
        timestamp: number;
        speed: number | null;
        accuracy: number | null;
    }>;
    total_distance_meters: number;
    duration_seconds: number;
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

interface Workout {
    id: string;
    plan_id: string;
    week_number: number;
    scheduled_date: string;
    type: 'easy_run' | 'long_run' | 'intervals' | 'tempo' | 'recovery';
    distance_km: number;
    objective: string;
    tips: string[];
    status: 'pending' | 'completed' | 'skipped' | 'missed';
    activity_id?: number;
    instructions_json: Array<{
        type: 'warmup' | 'main' | 'cooldown';
        distance_km: number;
        pace_min: number;
        pace_max: number;
    }>;
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
    isLoading: boolean;
    error: string | null;
    generationStatus: GenerationStatus;

    // Actions
    fetchPlan: () => Promise<void>;
    fetchWorkouts: (startDate: string, endDate: string) => Promise<void>;
    fetchUpcomingWorkouts: () => Promise<void>;
    fetchSchedule: (startDate: string, endDate: string) => Promise<void>;
    skipWorkout: (workoutId: string, reason: string) => Promise<void>;
    completeWorkout: (payload: WorkoutTrackingPayload) => Promise<{ success: boolean; savedLocally: boolean }>;
    retryPendingWorkouts: () => Promise<void>;
    checkPlanStatus: (planId: string) => Promise<boolean>;
    setGenerationStatus: (status: GenerationStatus) => void;
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
    isLoading: false,
    error: null,
    generationStatus: null,

    setGenerationStatus: (status) => set({ generationStatus: status }),

    clearScheduleData: () => set({ today: null, nextWorkout: null, schedule: [] }),

    fetchPlan: async () => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/training/plan`, {
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

            const response = await fetch(
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

            const response = await fetch(
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

            const response = await fetch(`${API_URL}/training/workouts/upcoming`, {
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

            const response = await fetch(`${API_URL}/training/plan/${planId}/status`, {
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
        console.log(`[completeWorkout] Iniciando. workoutId=${payload.workoutId}, dist=${payload.total_distance_meters}m, dur=${payload.duration_seconds}s, pontos=${payload.route_points.length}`);

        // SAFETY FIRST: salva localmente ANTES de tentar API
        // Se o app crashar/recarregar durante o fetch, os dados sobrevivem
        savePendingWorkout(payload);

        const userId = await getUserId();
        if (!userId) {
            console.warn('[completeWorkout] Sem userId — mantendo no pending para retry');
            return { success: false, savedLocally: true };
        }

        console.log(`[completeWorkout] userId=${userId}, URL=${API_URL}/training/workouts/${payload.workoutId}/complete`);

        try {
            const response = await fetch(
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
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[completeWorkout] API error ${response.status}: ${errorText}`);
                // Dados já estão no pending — mantém lá
                return { success: false, savedLocally: true };
            }

            // Sucesso! Remove do pending
            console.log(`[completeWorkout] Workout ${payload.workoutId} salvo no backend com sucesso`);
            removePendingWorkout(payload.workoutId);
            get().fetchUpcomingWorkouts();
            return { success: true, savedLocally: false };
        } catch (error) {
            console.error('[completeWorkout] Erro de rede:', error);
            // Dados já estão no pending — mantém lá
            return { success: false, savedLocally: true };
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
            try {
                console.log(`[retryPendingWorkouts] Reenviando workoutId=${payload.workoutId}, dist=${payload.total_distance_meters}m`);
                const response = await fetch(
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

            const response = await fetch(`${API_URL}/training/workouts/${workoutId}/skip`, {
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


