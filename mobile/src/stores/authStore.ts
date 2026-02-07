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
    onboarding_completed: boolean; // NEW: Controls navigation lock
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

/**
 * KILL SWITCH: Clear all auth tokens
 * Called when user is not found in DB or auth fails
 */
async function clearAllAuthTokens() {
    console.log('[AUTH] KILL SWITCH - Clearing all tokens');
    await Storage.deleteItemAsync('user_id');
    await Storage.deleteItemAsync('strava_access_token');
    await Storage.deleteItemAsync('strava_refresh_token');
    await Storage.deleteItemAsync('auth_state');
    console.log('[AUTH] All tokens cleared');
}

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
                console.log('Onboarding completed:', userData.user?.onboarding_completed);

                // Store userId ONLY if user exists
                await Storage.setItemAsync('user_id', userId);

                set({ user: userData.user, isAuthenticated: true, isLoading: false });
                console.log('Auth state set: isAuthenticated = true');
            } else {
                // KILL SWITCH: User not found - clear ALL tokens
                console.warn('[AUTH] User not found in DB - activating kill switch');
                await clearAllAuthTokens();
                set({ user: null, isAuthenticated: false, isLoading: false });
                console.log('[AUTH] Forcing re-login');
            }
        } catch (error) {
            console.error('Login error:', error);
            // KILL SWITCH: On error, clear tokens to prevent stale auth
            await clearAllAuthTokens();
            set({ user: null, isAuthenticated: false, isLoading: false });
            console.log('[AUTH] Error occurred - kill switch activated');
        }
    },

    logout: async () => {
        console.log('=== AUTH STORE LOGOUT ===');
        try {
            await clearAllAuthTokens();
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
                    console.log('[AUTH] User validated:', userData.user?.id);
                    console.log('[AUTH] Onboarding completed:', userData.user?.onboarding_completed);
                    set({ user: userData.user, isAuthenticated: true });

                    // Trigger retroactive Strava sync in background (recovers missed webhooks)
                    fetch(`${API_URL}/auth/strava/sync`, {
                        headers: { 'x-user-id': userId },
                    }).catch(() => { }); // Silent sync - don't block app start
                } else {
                    // KILL SWITCH: User deleted from DB - clear tokens
                    console.warn('[AUTH] User not found during checkAuth - activating kill switch');
                    await clearAllAuthTokens();
                    set({ user: null, isAuthenticated: false });
                }
            } else {
                set({ user: null, isAuthenticated: false });
            }
        } catch (error) {
            console.error('Auth check error:', error);
            // On network error, keep trying but don't auto-login
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
