import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

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

// API_URL imported from '../config/api.config' as BASE_API_URL
const API_URL = BASE_API_URL;

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
        console.log('=== AUTH STORE LOGIN ===');
        console.log('userId:', userId);
        console.log('API_URL:', API_URL);

        try {
            set({ isLoading: true });

            // Store userId securely
            await Storage.setItemAsync('user_id', userId);
            console.log('userId saved to storage');

            // Ensure API URL has /api prefix
            const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
            const userUrl = `${baseUrl}/users/${userId}`;
            console.log('Fetching user from:', userUrl);

            // Fetch user data from API
            const response = await fetch(userUrl, {
                headers: {
                    'x-user-id': userId,
                },
            });

            console.log('User fetch response status:', response.status);

            if (response.ok) {
                const userData = await response.json();
                console.log('User data received:', userData.user?.id);
                set({ user: userData.user, isAuthenticated: true, isLoading: false });
                console.log('Auth state set: isAuthenticated = true');
            } else {
                // Even if user fetch fails, set authenticated with userId
                // This prevents returning to login screen
                console.warn('User fetch failed, but setting authenticated anyway');
                set({ user: null, isAuthenticated: true, isLoading: false });
            }
        } catch (error) {
            console.error('Login error:', error);
            // Set authenticated even on error - we have the userId saved
            set({ user: null, isAuthenticated: true, isLoading: false });
            console.log('Error occurred but auth state set: isAuthenticated = true');
        }
    },

    logout: async () => {
        console.log('=== AUTH STORE LOGOUT ===');
        try {
            // Clear all auth-related storage keys
            await Storage.deleteItemAsync('user_id');
            // Also clear any potential stale OAuth tokens/cache
            await Storage.deleteItemAsync('strava_access_token');
            await Storage.deleteItemAsync('strava_refresh_token');
            await Storage.deleteItemAsync('auth_state');
            console.log('All auth storage keys cleared successfully');
            set({ user: null, isAuthenticated: false });
            console.log('Auth state reset: isAuthenticated = false');
        } catch (error) {
            console.error('Logout error:', error);
            // Still reset state even if storage deletion fails
            set({ user: null, isAuthenticated: false });
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
