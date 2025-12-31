import { create } from 'zustand';
import * as Storage from '../utils/storage';

interface Workout {
    id: string;
    plan_id: string;
    week_number: number;
    scheduled_date: string;
    type: 'easy_run' | 'long_run' | 'intervals' | 'tempo' | 'recovery';
    distance_km: number;
    objective: string;
    tips: string[];
    status: 'pending' | 'completed' | 'skipped';
    strava_activity_id?: number;
    instructions_json: Array<{
        type: 'warmup' | 'main' | 'cooldown';
        distance_km: number;
        pace_min: number;
        pace_max: number;
    }>;
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
    isLoading: boolean;
    error: string | null;
    generationStatus: GenerationStatus;

    // Actions
    fetchPlan: () => Promise<void>;
    fetchWorkouts: (startDate: string, endDate: string) => Promise<void>;
    fetchUpcomingWorkouts: () => Promise<void>;
    skipWorkout: (workoutId: string, reason: string) => Promise<void>;
    checkPlanStatus: (planId: string) => Promise<boolean>;
    setGenerationStatus: (status: GenerationStatus) => void;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
    plan: null,
    workouts: [],
    upcomingWorkouts: [],
    isLoading: false,
    error: null,
    generationStatus: null,

    setGenerationStatus: (status) => set({ generationStatus: status }),

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
                    await get().fetchWorkouts(
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

