import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

// MMKV-backed cache for stats and earnedBadges so the UI doesn't show zeros
// during cold start (before fetch resolves).
const gamificationCache = createMMKV({ id: 'gamification-cache' });
const STATS_KEY = 'stats';
const EARNED_BADGES_KEY = 'earned_badges';

interface Badge {
    id: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    type: string;
    tier: number;
    xp_reward: number;
    earned: boolean;
    earned_at?: string;
}

interface UserStats {
    current_level: number;
    total_points: number;
    current_streak: number;
    best_streak: number;
    points_to_next_level: number;
    points_in_current_level: number;
    points_for_next_level: number;
    progress_pct: number;
}

export interface RankingUser {
    id: string;
    rank: number;
    profile: { firstname?: string; lastname?: string; full_name?: string; profile_pic?: string; avatar_url?: string };
    total_xp: number;
    current_streak: number;
    current_level: number;
}

export interface RankingData {
    rankings: RankingUser[];
    userPosition: {
        rank: number;
        total_xp: number;
        current_streak: number;
        current_level: number;
        profile: { firstname?: string; lastname?: string; full_name?: string; profile_pic?: string; avatar_url?: string };
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

function readCachedStats(): UserStats | null {
    try {
        const raw = gamificationCache.getString(STATS_KEY);
        return raw ? (JSON.parse(raw) as UserStats) : null;
    } catch {
        return null;
    }
}

function readCachedEarnedBadges(): Badge[] {
    try {
        const raw = gamificationCache.getString(EARNED_BADGES_KEY);
        return raw ? (JSON.parse(raw) as Badge[]) : [];
    } catch {
        return [];
    }
}

function writeCachedStats(stats: UserStats) {
    try {
        gamificationCache.set(STATS_KEY, JSON.stringify(stats));
    } catch {
        // best-effort cache; ignore failures
    }
}

function writeCachedEarnedBadges(earned: Badge[]) {
    try {
        gamificationCache.set(EARNED_BADGES_KEY, JSON.stringify(earned));
    } catch {
        // best-effort cache; ignore failures
    }
}

export const useGamificationStore = create<GamificationState>((set) => ({
    stats: readCachedStats(),
    badges: [],
    earnedBadges: readCachedEarnedBadges(),
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
                const data = (await response.json()) as UserStats;
                set({ stats: data });
                writeCachedStats(data);
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
                const earned = (data.badges as Badge[]).filter((b) => b.earned);
                set({
                    badges: data.badges,
                    earnedBadges: earned,
                });
                writeCachedEarnedBadges(earned);
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
