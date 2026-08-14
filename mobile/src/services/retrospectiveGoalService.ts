import { BASE_API_URL } from '../config/api.config';
import { authedFetch } from './apiClient';
import * as Storage from '../utils/storage';

export type GoalKind = 'distance' | 'pace';
export type PaceGoalVerdict = 'feasible' | 'aggressive' | 'unrealistic';

export interface PaceGoalFeasibility {
    verdict: PaceGoalVerdict;
    currentVDOT: number;
    targetVDOT: number;
    vdotGap: number;
    realisticGain: number;
    targetTimeSeconds: number;
    targetPaceSeconds: number;
    alternativeTimeSeconds: number | null;
    alternativePaceSeconds: number | null;
    targetTimeFormatted: string;
    targetPaceFormatted: string;
    alternativeTimeFormatted: string | null;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
    const userId = await Storage.getItemAsync('user_id');
    const response = await authedFetch(`${BASE_API_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId ?? '',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message ?? 'Não foi possível concluir esta ação.');
    }
    return payload as T;
}

export const retrospectiveGoalService = {
    acceptSuggestion: (retrospectiveId: string) =>
        post<{ success: true; newPlanId: string }>(`/training/retrospective/${retrospectiveId}/accept`),

    assessPaceGoal: (
        retrospectiveId: string,
        input: { distance_goal: string; time_goal: string; duration_weeks: number },
    ) => post<PaceGoalFeasibility>(`/training/retrospective/${retrospectiveId}/pace-feasibility`, input),

    customize: (
        retrospectiveId: string,
        input: {
            goal_kind: GoalKind;
            distance_goal: string;
            time_goal?: string;
            duration_weeks: number;
            training_days: string[];
        },
    ) => post<{ success: true; newPlanId: string }>(`/training/retrospective/${retrospectiveId}/customize`, input),
};
