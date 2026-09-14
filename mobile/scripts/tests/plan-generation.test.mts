import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canStartInitialPlan, requestPlanRetry } from '../../src/services/planGenerationRequests.ts';

test('only a confirmed first-plan capability permits automatic generation', () => {
    assert.equal(canStartInitialPlan({ plan: null, can_generate_initial_plan: true }, false), true);
    for (const ready of [true, null]) {
        assert.equal(canStartInitialPlan({ plan: null, can_generate_initial_plan: true }, ready), false);
    }
    for (const payload of [null, {}, { plan: null }, { plan: null, can_generate_initial_plan: false },
        { plan: null, can_generate_initial_plan: 'true' }]) {
        assert.equal(canStartInitialPlan(payload, false), false);
    }
});

test('existing and failed plans never fall back to onboarding generation', () => {
    for (const generation_status of ['generating', 'complete', 'failed', 'partial']) {
        assert.equal(canStartInitialPlan({ plan: { id: 'plan-1', generation_status }, can_generate_initial_plan: true }, false), false);
    }
});

test('explicit retry addresses the same plan without replacing its goal or days', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestPlanRetry(async (url, init) => {
        calls.push({ url, init });
        return Response.json({ plan_id: 'plan-1', generation_status: 'generating' });
    }, 'https://api.example.test/api', 'plan-1', 'user-1');
    assert.deepEqual(calls, [{ url: 'https://api.example.test/api/training/plan/plan-1/retry',
        init: { method: 'POST', headers: { 'x-user-id': 'user-1' } } }]);
    assert.equal(result.plan_id, 'plan-1');
    assert.equal(result.generation_status, 'generating');
});

test('retry preserves an API conflict and does not attempt onboarding as fallback', async () => {
    let requests = 0;
    await assert.rejects(requestPlanRetry(async () => {
        requests++;
        return Response.json({ message: 'Plano indisponível para retry.' }, { status: 409 });
    }, 'https://api.example.test', 'plan-1', 'user-1'), /Plano indisponível para retry/);
    assert.equal(requests, 1);
});

test('retry rejects unavailable servers and malformed or foreign-plan responses', async () => {
    for (const response of [new Response('unavailable', { status: 503 }),
        Response.json({ plan_id: 'plan-2', generation_status: 'generating' }),
        Response.json({ plan_id: 'plan-1', generation_status: 'unexpected' }),
        Response.json(null)]) {
        await assert.rejects(requestPlanRetry(async () => response, 'https://api.example.test', 'plan-1', 'user-1'));
    }
});
