import { createClient } from '@supabase/supabase-js';
import * as Storage from '../utils/storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '[Supabase] CRITICAL: Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
    );
}

/**
 * Supabase client configured with ExpoSecureStoreAdapter for persistent sessions.
 * Uses SecureStore on native and localStorage on web via ../utils/storage.
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
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

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
