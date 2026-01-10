import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

interface WeeklyStats {
    week_start: string;
    total_distance_km: number;
    total_workouts: number;
    average_pace: number;
    total_elevation: number;
    total_time_minutes: number;
}

interface MonthlyStats {
    month: string;
    total_distance_km: number;
    total_workouts: number;
    average_pace: number;
    consistency_percent: number;
}

interface PaceProgression {
    date: string;
    workout_type: string;
    pace: number;
    distance_km: number;
}

interface SummaryStats {
    total_distance_km: number;
    total_time_hours: number;
    total_elevation_m: number;
    total_runs: number;
    best_pace: number | null;
    longest_run_km: number | null;
}

interface StatsState {
    weeklyStats: WeeklyStats[];
    monthlyStats: MonthlyStats[];
    paceProgression: PaceProgression[];
    summary: SummaryStats | null;
    isLoading: boolean;
    error: string | null;

    fetchWeeklyStats: (weeks?: number) => Promise<void>;
    fetchMonthlyStats: (months?: number) => Promise<void>;
    fetchPaceProgression: (limit?: number) => Promise<void>;
    fetchSummary: () => Promise<void>;
    fetchAllStats: () => Promise<void>;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useStatsStore = create<StatsState>((set) => ({
    weeklyStats: [],
    monthlyStats: [],
    paceProgression: [],
    summary: null,
    isLoading: false,
    error: null,

    fetchWeeklyStats: async (weeks = 12) => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();
            if (!userId) return;

            const response = await fetch(`${API_URL}/stats/weekly?weeks=${weeks}`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ weeklyStats: data.stats });
            }
        } catch (error) {
            set({ error: 'Falha ao carregar estatísticas semanais' });
        } finally {
            set({ isLoading: false });
        }
    },

    fetchMonthlyStats: async (months = 6) => {
        try {
            const userId = await getUserId();
            if (!userId) return;

            const response = await fetch(`${API_URL}/stats/monthly?months=${months}`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ monthlyStats: data.stats });
            }
        } catch (error) {
            console.error('Monthly stats error:', error);
        }
    },

    fetchPaceProgression: async (limit = 20) => {
        try {
            const userId = await getUserId();
            if (!userId) return;

            const response = await fetch(`${API_URL}/stats/pace-progression?limit=${limit}`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ paceProgression: data.progression });
            }
        } catch (error) {
            console.error('Pace progression error:', error);
        }
    },

    fetchSummary: async () => {
        try {
            const userId = await getUserId();
            if (!userId) return;

            const response = await fetch(`${API_URL}/stats/summary`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ summary: data.summary });
            }
        } catch (error) {
            console.error('Summary stats error:', error);
        }
    },

    fetchAllStats: async () => {
        try {
            set({ isLoading: true, error: null });
            const userId = await getUserId();
            if (!userId) return;

            const [weekly, monthly, pace, summary] = await Promise.all([
                fetch(`${API_URL}/stats/weekly?weeks=12`, { headers: { 'x-user-id': userId } }),
                fetch(`${API_URL}/stats/monthly?months=6`, { headers: { 'x-user-id': userId } }),
                fetch(`${API_URL}/stats/pace-progression?limit=20`, { headers: { 'x-user-id': userId } }),
                fetch(`${API_URL}/stats/summary`, { headers: { 'x-user-id': userId } }),
            ]);

            const [weeklyData, monthlyData, paceData, summaryData] = await Promise.all([
                weekly.ok ? weekly.json() : { stats: [] },
                monthly.ok ? monthly.json() : { stats: [] },
                pace.ok ? pace.json() : { progression: [] },
                summary.ok ? summary.json() : { summary: null },
            ]);

            set({
                weeklyStats: weeklyData.stats,
                monthlyStats: monthlyData.stats,
                paceProgression: paceData.progression,
                summary: summaryData.summary,
            });
        } catch (error) {
            set({ error: 'Falha ao carregar estatísticas' });
        } finally {
            set({ isLoading: false });
        }
    },
}));
