import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { supabase } from '../services/supabase';
import { BASE_API_URL } from '../config/api.config';

interface User {
    id: string;
    email: string;
    profile: {
        firstname: string;
        lastname: string;
        full_name?: string;
        profile_pic: string;
        avatar_url?: string;
        birth_date?: string;
        weight?: number;
        weight_kg?: number;
        height?: number;
        height_cm?: number;
    };
    subscription_status: 'trial' | 'active' | 'expired';
    created_at: string;
    onboarding_completed: boolean;
}

/** Returns the best available display name for the user */
export function getDisplayName(user: User | null): string {
    const p = user?.profile;
    if (!p) return '';
    return p.full_name
        || [p.firstname, p.lastname].filter(Boolean).join(' ')
        || '';
}

/** Returns a valid avatar URL or null */
export function getAvatarUrl(user: User | null): string | null {
    const url = user?.profile?.avatar_url || user?.profile?.profile_pic || '';
    return url.startsWith('http') ? url : null;
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
}

const API_URL = BASE_API_URL;

/**
 * Clear all auth tokens and Supabase session
 */
async function clearAllAuthTokens(): Promise<void> {
    console.log('[AUTH] Clearing all auth tokens');
    await Storage.deleteItemAsync('user_id');
    await Storage.deleteItemAsync('auth_state');
    try {
        await supabase.auth.signOut();
    } catch (error) {
        console.warn('[AUTH] Error signing out from Supabase:', error);
    }
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
        console.log('[AUTH] Login - userId:', userId);

        try {
            set({ isLoading: true });

            // Validate Supabase session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                console.warn('[AUTH] Session validation error:', sessionError.message);
            }
            if (session) {
                console.log('[AUTH] Supabase session valid, user:', session.user.id);
            }

            // Fetch user data from API
            const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
            const userUrl = `${baseUrl}/users/${userId}`;
            console.log('[AUTH] Fetching user from:', userUrl);

            const response = await fetch(userUrl, {
                headers: {
                    'x-user-id': userId,
                },
            });

            if (response.ok) {
                const userData = await response.json();
                console.log('[AUTH] User data received:', userData.user?.id);
                console.log('[AUTH] Onboarding completed:', userData.user?.onboarding_completed);

                await Storage.setItemAsync('user_id', userId);
                set({ user: userData.user, isAuthenticated: true, isLoading: false });
            } else {
                console.warn('[AUTH] User not found in DB - clearing tokens');
                await clearAllAuthTokens();
                set({ user: null, isAuthenticated: false, isLoading: false });
            }
        } catch (error) {
            console.error('[AUTH] Login error:', error);
            await clearAllAuthTokens();
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    },

    logout: async () => {
        console.log('[AUTH] Logout');
        try {
            await clearAllAuthTokens();
            set({ user: null, isAuthenticated: false });
        } catch (error) {
            console.error('[AUTH] Logout error:', error);
            set({ user: null, isAuthenticated: false });
        }
    },

    checkAuth: async () => {
        try {
            set({ isLoading: true });

            // First check Supabase session
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                const userId = session.user.id;
                console.log('[AUTH] Supabase session found for:', userId);

                // Validate user exists in backend
                const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
                const response = await fetch(`${baseUrl}/users/${userId}`, {
                    headers: { 'x-user-id': userId },
                });

                if (response.ok) {
                    const userData = await response.json();
                    console.log('[AUTH] User validated:', userData.user?.id);
                    await Storage.setItemAsync('user_id', userId);
                    set({ user: userData.user, isAuthenticated: true });
                } else {
                    console.warn('[AUTH] User not found during checkAuth - clearing');
                    await clearAllAuthTokens();
                    set({ user: null, isAuthenticated: false });
                }
            } else {
                // Fallback: check stored user_id
                const storedUserId = await Storage.getItemAsync('user_id');
                if (storedUserId) {
                    const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
                    const response = await fetch(`${baseUrl}/users/${storedUserId}`, {
                        headers: { 'x-user-id': storedUserId },
                    });

                    if (response.ok) {
                        const userData = await response.json();
                        set({ user: userData.user, isAuthenticated: true });
                    } else {
                        await clearAllAuthTokens();
                        set({ user: null, isAuthenticated: false });
                    }
                } else {
                    set({ user: null, isAuthenticated: false });
                }
            }
        } catch (error) {
            console.error('[AUTH] Check auth error:', error);
            set({ user: null, isAuthenticated: false });
        } finally {
            set({ isLoading: false });
        }
    },
}));
