import { createClient } from '@supabase/supabase-js';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '[Supabase] CRITICAL: Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
    );
}

/**
 * Supabase client configured with ExpoSecureStoreAdapter for persistent sessions.
 * autoRefreshToken is DISABLED because some ISP DNS can't resolve the Supabase host.
 * Token refresh is handled manually via the backend (POST /api/auth/refresh).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: {
            getItem: async (key: string) => {
                return await Storage.getItemAsync(key);
            },
            setItem: async (key: string, value: string) => {
                await Storage.setItemAsync(key, value);
            },
            removeItem: async (key: string) => {
                await Storage.deleteItemAsync(key);
            },
        },
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

/**
 * Refresh the Supabase session via the backend to avoid DNS issues.
 * Returns the new session or null if refresh failed.
 */
export async function refreshSessionViaBackend(): Promise<boolean> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.refresh_token) {
            console.warn('[Supabase] No refresh token available');
            return false;
        }

        const baseUrl = BASE_API_URL.replace(/\/api$/, '');
        const response = await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: session.refresh_token }),
        });

        if (!response.ok) {
            console.warn('[Supabase] Backend refresh failed:', response.status);
            return false;
        }

        const data = await response.json();

        // Update the local session with new tokens
        const { error } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
        });

        if (error) {
            console.warn('[Supabase] Failed to set refreshed session:', error.message);
            return false;
        }

        console.log('[Supabase] Session refreshed via backend');
        return true;
    } catch (err) {
        console.warn('[Supabase] Session refresh error:', err);
        return false;
    }
}

/**
 * Get the current authenticated user ID from Supabase session
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return null;
        return user.id;
    } catch (error) {
        console.error('[Supabase] Error getting authenticated user:', error);
        return null;
    }
}

/**
 * Check if the user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
    const userId = await getAuthenticatedUserId();
    return userId !== null;
}

/**
 * Get the current session access token
 */
export async function getSessionToken(): Promise<string | null> {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return null;
        return session.access_token;
    } catch (error) {
        console.error('[Supabase] Error getting session token:', error);
        return null;
    }
}
