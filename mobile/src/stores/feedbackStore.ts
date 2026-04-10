import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

interface MetricsComparison {
    distance: { planned: number; executed: number; diff_percent: number };
    pace: { planned: string; executed: string; diff_percent: number };
    elevation?: { executed: number };
    heartrate?: { average: number; max: number };
}

interface Strength {
    title: string;
    description: string;
    icon: string;
}

interface Improvement {
    title: string;
    description: string;
    tip: string;
    icon: string;
}

export interface Feedback {
    id: string;
    user_id: string;
    workout_id: string;
    activity_id: string;
    hero_message: string;
    hero_tone: 'celebration' | 'encouragement' | 'improvement' | 'caution';
    metrics_comparison: MetricsComparison;
    strengths: Strength[];
    improvements: Improvement[];
    progression_impact: string;
    feedback_rating?: number;
    created_at: string;
    workouts?: {
        type: string;
        scheduled_date: string;
        distance_km: number;
    };
    activities?: {
        id: string;
        name: string;
        distance: number;
        moving_time: number;
        average_pace: number;
        elevation_gain: number;
        start_date: string;
    };
}

export interface WorkoutHistoryItem {
    id: string;
    date: string;
    day: number;
    day_of_week: string;
    type: string;
    name: string;
    distance: number; // meters
    moving_time: number; // seconds
    average_speed: number; // m/s
    pace: string | null; // min/km
    elevation_gain: number;
    feedback: {
        id: string;
        hero_message: string;
        hero_tone: string;
    } | null;
}

export interface WorkoutMonth {
    month: string;
    workouts: WorkoutHistoryItem[];
}

export interface WorkoutHistorySummary {
    total_distance: number;
    total_activities: number;
    total_elevation: number;
}

export interface LatestActivityData {
    activity: {
        id: string;
        name: string;
        distance: number;
        distance_km: string;
        moving_time: number;
        average_pace: number;
        formatted_pace: string;
        elevation_gain: number;
        average_heartrate: number | null;
        start_date: string;
        date_label: string;
    } | null;
    feedback: {
        id: string;
        hero_message: string;
        hero_tone: string;
        strengths: Array<{ title: string; description: string; icon?: string }>;
        improvements: Array<{ title: string; description: string; tip?: string; icon?: string }>;
    } | null;
    workout_id: string | null;
    efficiency_percent: number;
    conquest: {
        goal_met: boolean;
        planned_distance_km: number;
        executed_distance_km: number;
        xp_earned: number;
        has_linked_workout: boolean;
    } | null;
    vo2_max: {
        current_value: number;
        trend_percent: number;
        previous_value: number | null;
        is_valid: boolean;
        is_interrupted: boolean;
        has_heartrate: boolean;
        message: string | null;
    } | null;
}

interface FeedbackState {
    feedbacks: Feedback[];
    currentFeedback: Feedback | null;
    latestSummary: {
        id: string;
        hero_message: string;
        hero_tone: string;
        workout_type: string;
        workout_date: string;
    } | null;

    // Latest Activity for Home Screen
    latestActivity: LatestActivityData | null;
    latestActivityLoading: boolean;

    // Workout History
    workoutHistory: WorkoutMonth[];
    workoutSummary: WorkoutHistorySummary | null;
    workoutHistoryLoading: boolean;
    workoutHistoryError: string | null;
    hasMoreWorkouts: boolean;

    isLoading: boolean;
    error: string | null;

    // Actions
    fetchHistory: (limit?: number) => Promise<void>;
    fetchFeedback: (feedbackId: string) => Promise<void>;
    fetchLatestSummary: () => Promise<void>;
    fetchLatestActivity: () => Promise<void>;
    rateFeedback: (feedbackId: string, rating: number) => Promise<void>;
    fetchWorkoutHistory: (limit?: number, offset?: number) => Promise<void>;
    loadMoreWorkouts: () => Promise<void>;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
    feedbacks: [],
    currentFeedback: null,
    latestSummary: null,
    latestActivity: null,
    latestActivityLoading: false,
    workoutHistory: [],
    workoutSummary: null,
    workoutHistoryLoading: false,
    workoutHistoryError: null,
    hasMoreWorkouts: false,
    isLoading: false,
    error: null,

    fetchHistory: async (limit = 10) => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/feedback/history?limit=${limit}`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ feedbacks: data.feedbacks });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar histórico' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchFeedback: async (feedbackId: string) => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/feedback/${feedbackId}`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ currentFeedback: data.feedback });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar feedback' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchLatestSummary: async () => {
        try {
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/feedback/latest/summary`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ latestSummary: data.feedback });
            }
        } catch (error) {
            console.error('Fetch latest summary error:', error);
        }
    },

    fetchLatestActivity: async () => {
        try {
            set({ latestActivityLoading: true });
            const userId = await getUserId();

            if (!userId) {
                set({ latestActivityLoading: false });
                return;
            }

            const response = await fetch(`${API_URL}/feedback/latest/activity`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ latestActivity: data });
            }
        } catch (error) {
            console.error('Fetch latest activity error:', error);
        } finally {
            set({ latestActivityLoading: false });
        }
    },

    rateFeedback: async (feedbackId: string, rating: number) => {
        try {
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/feedback/${feedbackId}/rate`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({ rating }),
            });

            if (response.ok) {
                const { currentFeedback } = get();
                if (currentFeedback && currentFeedback.id === feedbackId) {
                    set({ currentFeedback: { ...currentFeedback, feedback_rating: rating } });
                }
            }
        } catch (error) {
            console.error('Rate feedback error:', error);
        }
    },

    fetchWorkoutHistory: async (limit = 20, offset = 0) => {
        try {
            set({ workoutHistoryLoading: true, workoutHistoryError: null });
            const userId = await getUserId();

            if (!userId) {
                set({ workoutHistoryLoading: false });
                return;
            }

            const response = await fetch(
                `${API_URL}/feedback/workouts/history?limit=${limit}&offset=${offset}`,
                { headers: { 'x-user-id': userId } }
            );

            if (response.ok) {
                const data = await response.json();

                if (offset === 0) {
                    // Initial load
                    set({
                        workoutHistory: data.months || [],
                        workoutSummary: data.summary,
                        hasMoreWorkouts: data.hasMore,
                    });
                } else {
                    // Load more - append
                    const existing = get().workoutHistory;
                    set({
                        workoutHistory: [...existing, ...(data.months || [])],
                        hasMoreWorkouts: data.hasMore,
                    });
                }
            } else {
                set({ workoutHistoryError: 'Falha ao carregar histórico de treinos' });
            }
        } catch (error) {
            console.error('Fetch workout history error:', error);
            set({ workoutHistoryError: 'Erro ao carregar treinos' });
        } finally {
            set({ workoutHistoryLoading: false });
        }
    },

    loadMoreWorkouts: async () => {
        const { workoutHistory, hasMoreWorkouts, workoutHistoryLoading } = get();

        if (!hasMoreWorkouts || workoutHistoryLoading) return;

        const currentOffset = workoutHistory.reduce(
            (total, month) => total + month.workouts.length,
            0
        );

        await get().fetchWorkoutHistory(20, currentOffset);
    },
}));
