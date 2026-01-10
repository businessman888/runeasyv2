import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

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
    strava_activity_id?: number;
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


