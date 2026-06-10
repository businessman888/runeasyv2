/**
 * Races API — thin fetch wrappers (project uses fetch + Zustand, not axios/React Query).
 * Identification follows the app convention: the `x-user-id` header.
 */
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import { useAuthStore } from '../stores/authStore';
import type { Race, RaceSearchParams } from '../types/races.types';

function authHeaders(): Record<string, string> {
    const userId = useAuthStore.getState().user?.id;
    return userId ? { 'x-user-id': userId } : {};
}

function buildQuery(params: RaceSearchParams): string {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.city) q.set('city', params.city);
    if (params.state) q.set('state', params.state);
    if (params.distance != null) q.set('distance', String(params.distance));
    if (params.level) q.set('level', params.level);
    if (params.terrain) q.set('terrain', params.terrain);
    if (params.dateFrom) q.set('dateFrom', params.dateFrom);
    if (params.dateTo) q.set('dateTo', params.dateTo);
    if (params.limit != null) q.set('limit', String(params.limit));
    const s = q.toString();
    return s ? `?${s}` : '';
}

export async function searchRaces(params: RaceSearchParams = {}): Promise<Race[]> {
    const res = await authedFetch(`${BASE_API_URL}/races${buildQuery(params)}`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`searchRaces failed: ${res.status}`);
    return res.json();
}

export async function getSuggestedRaces(): Promise<Race[]> {
    const res = await authedFetch(`${BASE_API_URL}/races/suggested`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`getSuggestedRaces failed: ${res.status}`);
    return res.json();
}

export async function getRace(idOrSlug: string): Promise<Race> {
    const res = await authedFetch(`${BASE_API_URL}/races/${idOrSlug}`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`getRace failed: ${res.status}`);
    return res.json();
}
