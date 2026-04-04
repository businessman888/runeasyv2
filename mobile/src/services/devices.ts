import { BASE_API_URL } from '../config/api.config';
import * as Storage from '../utils/storage';

export interface ConnectedDevice {
    id: string;
    provider: string;
    provider_user_id: string | null;
    device_name: string | null;
    scope: string | null;
    expires_at: string | null;
    connected_at: string;
    updated_at: string;
}

export interface SyncStatus {
    hasConnectedDevice: boolean;
    connectedProviders: Array<{
        provider: string;
        deviceName: string | null;
        connectedAt: string;
    }>;
    lastSyncedActivity: {
        source: string;
        date: string;
    } | null;
}

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

/**
 * Get all connected devices for the current user.
 */
export async function listDevices(): Promise<ConnectedDevice[]> {
    const headers = await getHeaders();
    const response = await fetch(`${BASE_API_URL}/devices`, { headers });

    if (!response.ok) throw new Error('Failed to fetch devices');

    const data = await response.json();
    return data.devices;
}

/**
 * Get sync status — connected providers and last synced activity.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
    const headers = await getHeaders();
    const response = await fetch(`${BASE_API_URL}/devices/sync-status`, { headers });

    if (!response.ok) throw new Error('Failed to fetch sync status');

    return response.json();
}

/**
 * Disconnect a device by provider name.
 */
export async function disconnectDevice(provider: string): Promise<void> {
    const headers = await getHeaders();
    const response = await fetch(`${BASE_API_URL}/devices/${provider}`, {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) throw new Error('Failed to disconnect device');
}

/**
 * Check if a specific provider is connected.
 */
export async function checkProviderStatus(provider: string): Promise<boolean> {
    const headers = await getHeaders();
    const response = await fetch(`${BASE_API_URL}/devices/status/${provider}`, { headers });

    if (!response.ok) return false;

    const data = await response.json();
    return data.connected;
}

/**
 * Get display label for a provider.
 */
export function getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
        garmin: 'Garmin',
        polar: 'Polar',
        fitbit: 'Fitbit',
        apple_watch: 'Apple Watch',
    };
    return labels[provider] || provider;
}
