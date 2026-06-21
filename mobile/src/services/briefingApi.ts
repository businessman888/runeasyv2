/**
 * Workout deep-dive briefing API — thin fetch wrappers (project convention:
 * fetch + Zustand, identification via `x-user-id` header).
 *
 * - GET reads the persisted briefing without triggering generation (used on
 *   screen load to decide between the "+" prompt and the saved content).
 * - POST generates (or returns the existing) briefing. Pro-gated on the backend
 *   (ProGuard) — a 403 means the user is not Pro.
 */
import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import { useAuthStore } from '../stores/authStore';

export interface WorkoutBriefing {
    content: string;
    athlete_level: string | null;
    created_at: string;
}

function authHeaders(): Record<string, string> {
    const userId = useAuthStore.getState().user?.id;
    return userId ? { 'x-user-id': userId } : {};
}

/** Returns the saved briefing for a workout, or null when none exists yet. */
export async function getWorkoutBriefing(
    workoutId: string,
): Promise<WorkoutBriefing | null> {
    const res = await authedFetch(
        `${BASE_API_URL}/training/workouts/${workoutId}/briefing`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error(`getWorkoutBriefing failed: ${res.status}`);
    const data = await res.json();
    return data?.briefing ?? null;
}

/** Generates (or returns the existing) deep-dive briefing. Throws on 403 (not Pro). */
export async function generateWorkoutBriefing(
    workoutId: string,
): Promise<WorkoutBriefing> {
    const res = await authedFetch(
        `${BASE_API_URL}/training/workouts/${workoutId}/briefing`,
        { method: 'POST', headers: authHeaders() },
    );
    if (!res.ok) {
        const err = new Error(`generateWorkoutBriefing failed: ${res.status}`);
        (err as any).status = res.status;
        throw err;
    }
    const data = await res.json();
    return data.briefing as WorkoutBriefing;
}
