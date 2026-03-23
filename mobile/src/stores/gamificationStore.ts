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

export interface RankingUser {
    id: string;
    rank: number;
    profile: { firstname?: string; lastname?: string; profile_pic?: string };
    total_xp: number;
    current_streak: number;
}

export interface RankingData {
    rankings: RankingUser[];
    userPosition: {
        rank: number;
        total_xp: number;
        current_streak: number;
        profile: { firstname?: string; lastname?: string; profile_pic?: string };
    };
    totalParticipants: number;
    cohortInfo?: { month: number; year: number; totalCompetitors: number };
}

type RankingTab = 'cohort' | 'global';

interface GamificationState {
    stats: UserStats | null;
    badges: Badge[];
    earnedBadges: Badge[];
    isLoading: boolean;

    // Ranking
    globalRanking: RankingData | null;
    cohortRanking: RankingData | null;
    rankingTab: RankingTab;
    isRankingLoading: boolean;

    // Actions
    fetchStats: () => Promise<void>;
    fetchBadges: () => Promise<void>;
    fetchGlobalRanking: () => Promise<void>;
    fetchCohortRanking: () => Promise<void>;
    setRankingTab: (tab: RankingTab) => void;
}

const API_URL = BASE_API_URL;

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useGamificationStore = create<GamificationState>((set) => ({
    stats: null,
    badges: [],
    earnedBadges: [],
    isLoading: false,

    globalRanking: null,
    cohortRanking: null,
    rankingTab: 'cohort',
    isRankingLoading: false,

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

    fetchGlobalRanking: async () => {
        try {
            set({ isRankingLoading: true });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/ranking/global?limit=50`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ globalRanking: data });
            }
        } catch (error) {
            console.error('Fetch global ranking error:', error);
        } finally {
            set({ isRankingLoading: false });
        }
    },

    fetchCohortRanking: async () => {
        try {
            set({ isRankingLoading: true });
            const userId = await getUserId();

            if (!userId) return;

            const response = await fetch(`${API_URL}/ranking/cohort?limit=50`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                const data = await response.json();
                set({ cohortRanking: data });
            }
        } catch (error) {
            console.error('Fetch cohort ranking error:', error);
        } finally {
            set({ isRankingLoading: false });
        }
    },

    setRankingTab: (tab: RankingTab) => {
        set({ rankingTab: tab });
    },
}));
