import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
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
    const response = await authedFetch(`${BASE_API_URL}/devices`, { headers });

    if (!response.ok) throw new Error('Failed to fetch devices');

    const data = await response.json();
    return data.devices;
}

/**
 * Get sync status — connected providers and last synced activity.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
    const headers = await getHeaders();
    const response = await authedFetch(`${BASE_API_URL}/devices/sync-status`, { headers });

    if (!response.ok) throw new Error('Failed to fetch sync status');

    return response.json();
}

/**
 * Connect a device manually (sem OAuth). Usado pelo Apple Watch — que não tem
 * fluxo OAuth e basta registrar o pareamento como um connected_device para o
 * resto do app reconhecer. Para Garmin/Fitbit/Polar continuamos usando o fluxo
 * OAuth via `wearable-auth.ts`.
 */
export async function connectDeviceManual(
    provider: string,
    deviceName?: string,
): Promise<ConnectedDevice> {
    const headers = await getHeaders();
    const response = await authedFetch(`${BASE_API_URL}/devices/connect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, device_name: deviceName }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to connect device: ${errorText}`);
    }

    const data = await response.json();
    return data.device;
}

/**
 * Disconnect a device by provider name.
 */
export async function disconnectDevice(provider: string): Promise<void> {
    const headers = await getHeaders();
    const response = await authedFetch(`${BASE_API_URL}/devices/${provider}`, {
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
    const response = await authedFetch(`${BASE_API_URL}/devices/status/${provider}`, { headers });

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
        apple_health: 'Apple Health',
        health_connect: 'Health Connect',
    };
    return labels[provider] || provider;
}
