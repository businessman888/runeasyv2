import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import * as Storage from '../utils/storage';
import type { WellnessSummary } from '../types/wellness.types';

async function getHeaders(): Promise<Record<string, string>> {
    const userId = await Storage.getItemAsync('user_id');
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
    };
}

export async function getWellnessSummary(): Promise<WellnessSummary> {
    const headers = await getHeaders();
    const response = await authedFetch(`${BASE_API_URL}/training/wellness-summary`, {
        headers,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to fetch wellness summary (${response.status}): ${text}`);
    }

    return response.json();
}
