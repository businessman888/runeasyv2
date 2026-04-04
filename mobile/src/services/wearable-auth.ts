import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';

/**
 * Supported OAuth providers for wearable connection.
 */
export type WearableProvider = 'fitbit' | 'polar' | 'garmin' | 'apple_watch';

/**
 * Result of the OAuth connection flow.
 */
export interface WearableAuthResult {
    success: boolean;
    provider: string;
    error?: string;
}

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

/**
 * Start the OAuth flow for a wearable provider.
 * Opens the browser for authorization and waits for the deep link callback.
 */
export async function connectWearable(provider: WearableProvider): Promise<WearableAuthResult> {
    if (provider === 'garmin' || provider === 'apple_watch') {
        return {
            success: false,
            provider,
            error: `${provider} integration coming soon`,
        };
    }

    try {
        const headers = await getHeaders();

        // 1. Get the authorization URL from backend
        const response = await fetch(`${BASE_API_URL}/devices/${provider}/auth`, { headers });

        if (!response.ok) {
            throw new Error(`Failed to get auth URL: ${response.status}`);
        }

        const { url } = await response.json();

        // 2. Open the browser for OAuth authorization
        // The backend callback will redirect to runeasy://wearable-connected?...
        const result = await WebBrowser.openAuthSessionAsync(
            url,
            'runeasy://wearable-connected',
        );

        if (result.type === 'success' && result.url) {
            // Parse the callback URL
            const parsed = Linking.parse(result.url);
            const success = parsed.queryParams?.success === 'true';
            const error = parsed.queryParams?.error as string | undefined;

            return {
                success,
                provider,
                error: error ? decodeURIComponent(error) : undefined,
            };
        }

        if (result.type === 'cancel' || result.type === 'dismiss') {
            return {
                success: false,
                provider,
                error: 'Authorization cancelled',
            };
        }

        return {
            success: false,
            provider,
            error: 'Authorization failed',
        };
    } catch (error: any) {
        return {
            success: false,
            provider,
            error: error.message || 'Unknown error',
        };
    }
}

/**
 * Dismiss the web browser (cleanup).
 */
export function dismissBrowser() {
    WebBrowser.dismissBrowser();
}
