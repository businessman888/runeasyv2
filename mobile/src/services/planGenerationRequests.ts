/** Generation decisions shared by Home and the explicit retry action. */
export function canStartInitialPlan(
    response: unknown,
    retrospectiveReady: boolean | null,
): boolean {
    if (retrospectiveReady !== false || !response || typeof response !== 'object') return false;
    const payload = response as Record<string, unknown>;
    // Missing capability on an older server is deliberately not permission.
    return payload.plan === null && payload.can_generate_initial_plan === true;
}

export interface PlanRetryResponse {
    plan_id: string;
    generation_status: 'partial' | 'generating' | 'complete' | 'failed';
}

/** Retry the same authorized plan. Goal/days/onboarding are never submitted. */
export async function requestPlanRetry(
    fetcher: (url: string, init: RequestInit) => Promise<Response>,
    apiUrl: string,
    planId: string,
    userId: string,
): Promise<PlanRetryResponse> {
    const response = await fetcher(`${apiUrl}/training/plan/${encodeURIComponent(planId)}/retry`, {
        method: 'POST',
        headers: { 'x-user-id': userId },
    });
    const payload: unknown = await response.json().catch(() => null);
    const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    if (!response.ok) {
        throw new Error(typeof data?.message === 'string'
            ? data.message
            : 'Não foi possível retomar seu plano. Tente novamente.');
    }
    if (data?.plan_id !== planId || !['partial', 'generating', 'complete', 'failed'].includes(String(data.generation_status))) {
        throw new Error('Não foi possível confirmar a retomada do plano. Atualize a tela.');
    }
    return data as unknown as PlanRetryResponse;
}
