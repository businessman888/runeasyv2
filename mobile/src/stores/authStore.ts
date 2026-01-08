import { create } from 'zustand';
import * as Storage from '../utils/storage';

interface User {
    id: string;
    email: string;
    strava_athlete_id: number | null;
    profile: {
        firstname: string;
        lastname: string;
        profile_pic: string;
        birth_date?: string;
        weight?: number;
        height?: number;
    };
    subscription_status: 'trial' | 'active' | 'expired';
    created_at: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    setUser: (user: User | null) => void;
    setAuthenticated: (authenticated: boolean) => void;
    login: (userId: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    syncStravaActivities: () => Promise<{ synced: number; message: string }>;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,

    setUser: (user) => {
        set({ user, isAuthenticated: !!user });
    },

    setAuthenticated: (authenticated) => {
        set({ isAuthenticated: authenticated });
    },

    login: async (userId: string) => {
        try {
            set({ isLoading: true });

            // Store userId securely
            await Storage.setItemAsync('user_id', userId);

            // Fetch user data from API
            const response = await fetch(`${API_URL}/users/${userId}`, {
                headers: {
                    'x-user-id': userId,
                },
            });

            if (response.ok) {
                const userData = await response.json();
                set({ user: userData.user, isAuthenticated: true });
            }
        } catch (error) {
            console.error('Login error:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    logout: async () => {
        try {
            await Storage.deleteItemAsync('user_id');
            set({ user: null, isAuthenticated: false });
        } catch (error) {
            console.error('Logout error:', error);
        }
    },

    checkAuth: async () => {
        try {
            set({ isLoading: true });

            const userId = await Storage.getItemAsync('user_id');

            if (userId) {
                const response = await fetch(`${API_URL}/users/${userId}`, {
                    headers: {
                        'x-user-id': userId,
                    },
                });

                if (response.ok) {
                    const userData = await response.json();
                    set({ user: userData.user, isAuthenticated: true });

                    // Trigger retroactive Strava sync in background (recovers missed webhooks)
                    fetch(`${API_URL}/auth/strava/sync`, {
                        headers: { 'x-user-id': userId },
                    }).catch(() => { }); // Silent sync - don't block app start
                } else {
                    await Storage.deleteItemAsync('user_id');
                    set({ user: null, isAuthenticated: false });
                }
            } else {
                set({ user: null, isAuthenticated: false });
            }
        } catch (error) {
            console.error('Auth check error:', error);
            set({ user: null, isAuthenticated: false });
        } finally {
            set({ isLoading: false });
        }
    },

    // Manual Strava sync (for Settings screen)
    syncStravaActivities: async (): Promise<{ synced: number; message: string }> => {
        try {
            const userId = await Storage.getItemAsync('user_id');
            if (!userId) {
                return { synced: 0, message: 'Usuário não encontrado' };
            }

            const response = await fetch(`${API_URL}/auth/strava/sync`, {
                headers: { 'x-user-id': userId },
            });

            if (response.ok) {
                return await response.json();
            }
            return { synced: 0, message: 'Erro ao sincronizar' };
        } catch (error) {
            return { synced: 0, message: 'Erro de conexão' };
        }
    },
}));
