import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    type: string;
    tier: number;
    earned: boolean;
    earned_at?: string;
}

interface UserStats {
    current_level: number;
    total_points: number;
    current_streak: number;
    best_streak: number;
    points_to_next_level: number;
}

interface GamificationState {
    stats: UserStats | null;
    badges: Badge[];
    earnedBadges: Badge[];
    isLoading: boolean;

    // Actions
    fetchStats: () => Promise<void>;
    fetchBadges: () => Promise<void>;
}

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useGamificationStore = create<GamificationState>((set) => ({
    stats: null,
    badges: [],
    earnedBadges: [],
    isLoading: false,

    fetchStats: async () => {
        try {
            set({ isLoading: true });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/gamification/stats`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ stats: data });
            }
        } catch (error) {
            console.error('Fetch stats error:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchBadges: async () => {
        try {
            set({ isLoading: true });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/gamification/badges`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({
                    badges: data.badges,
                    earnedBadges: data.badges.filter((b: Badge) => b.earned),
                });
            }
        } catch (error) {
            console.error('Fetch badges error:', error);
        } finally {
            set({ isLoading: false });
        }
    },
}));
