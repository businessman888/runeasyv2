import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { supabase, refreshSessionViaBackend } from '../services/supabase';
import { BASE_API_URL } from '../config/api.config';
import {
    identifyRevenueCatUser,
    logoutRevenueCat,
    checkProStatus,
    addSubscriptionListener,
} from '../services/paywall';

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

/** Callback para Superwall identify — setado pelo SuperwallProvider via hook */
let _superwallIdentifyFn: ((userId: string) => Promise<void>) | null = null;
let _superwallResetFn: (() => Promise<void>) | null = null;

/**
 * Registra as funções do Superwall identify/reset.
 * Deve ser chamado no componente que tem acesso ao useUser() hook.
 */
export function registerSuperwallHooks(
    identifyFn: (userId: string) => Promise<void>,
    resetFn: () => Promise<void>,
): void {
    _superwallIdentifyFn = identifyFn;
    _superwallResetFn = resetFn;
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
    isPro: boolean;

    // Actions
    setUser: (user: User | null) => void;
    setAuthenticated: (authenticated: boolean) => void;
    setIsPro: (isPro: boolean) => void;
    login: (userId: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    syncSubscriptionStatus: () => Promise<void>;
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
    isPro: false,

    setUser: (user) => {
        set({ user, isAuthenticated: !!user });
    },

    setAuthenticated: (authenticated) => {
        set({ isAuthenticated: authenticated });
    },

    setIsPro: (isPro) => {
        set({ isPro });
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

                // ── Superwall Identify ──
                if (_superwallIdentifyFn) {
                    try {
                        await _superwallIdentifyFn(userId);
                        console.log('[AUTH] Superwall identify OK');
                    } catch (err) {
                        console.warn('[AUTH] Superwall identify falhou:', err);
                    }
                }

                // ── RevenueCat Identify + Sync ──
                try {
                    await identifyRevenueCatUser(userId);
                    const { isPro } = await checkProStatus();
                    set({ isPro });
                    console.log('[AUTH] RevenueCat sync — isPro:', isPro);
                } catch (err) {
                    console.warn('[AUTH] RevenueCat identify falhou:', err);
                }
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
            // ── Superwall Reset ──
            if (_superwallResetFn) {
                try {
                    await _superwallResetFn();
                    console.log('[AUTH] Superwall reset OK');
                } catch (err) {
                    console.warn('[AUTH] Superwall reset falhou:', err);
                }
            }

            // ── RevenueCat Logout ──
            try {
                await logoutRevenueCat();
            } catch (err) {
                console.warn('[AUTH] RevenueCat logout falhou:', err);
            }

            await clearAllAuthTokens();
            set({ user: null, isAuthenticated: false, isPro: false });
        } catch (error) {
            console.error('[AUTH] Logout error:', error);
            set({ user: null, isAuthenticated: false, isPro: false });
        }
    },

    checkAuth: async () => {
        try {
            set({ isLoading: true });

            // Try Supabase session (reads local storage, no network call)
            let sessionUserId: string | null = null;
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    sessionUserId = session.user.id;
                    console.log('[AUTH] Supabase session found for:', sessionUserId);

                    // Check if token is close to expiry and refresh via backend
                    const expiresAt = session.expires_at;
                    const now = Math.floor(Date.now() / 1000);
                    if (expiresAt && expiresAt - now < 300) {
                        console.log('[AUTH] Token near expiry, refreshing via backend...');
                        await refreshSessionViaBackend();
                    }
                }
            } catch (err) {
                console.warn('[AUTH] Supabase session check failed, using fallback:', err);
            }

            const storageUserId = await Storage.getItemAsync('user_id');
            console.log('[AUTH] checkAuth — sessionUserId:', sessionUserId, '| storageUserId:', storageUserId);

            // Desync guard: if both exist but differ, clear tokens to force fresh login
            if (sessionUserId && storageUserId && sessionUserId !== storageUserId) {
                console.warn('[AUTH] sessionUserId != storageUserId — clearing tokens to resync');
                await clearAllAuthTokens();
                set({ user: null, isAuthenticated: false });
                return;
            }

            // Fallback to stored user_id if Supabase session unavailable
            const userId = sessionUserId || storageUserId;

            if (userId) {
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
                set({ user: null, isAuthenticated: false });
            }
        } catch (error) {
            console.error('[AUTH] Check auth error:', error);
            set({ user: null, isAuthenticated: false });
        } finally {
            set({ isLoading: false });
        }
    },

    syncSubscriptionStatus: async () => {
        try {
            const { isPro } = await checkProStatus();
            set({ isPro });
            console.log('[AUTH] Subscription sync — isPro:', isPro);
        } catch (error) {
            console.error('[AUTH] Erro ao sincronizar assinatura:', error);
        }
    },
}));

/**
 * Inicializa o listener de mudanças de assinatura do RevenueCat.
 * Deve ser chamado uma vez no _layout.tsx após inicializar o RevenueCat.
 * Retorna a função de cleanup.
 */
export function initSubscriptionListener(): () => void {
    return addSubscriptionListener((isPro) => {
        useAuthStore.getState().setIsPro(isPro);
        console.log('[AUTH] Subscription listener — isPro atualizado:', isPro);
    });
}
