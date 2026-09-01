import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    isWatchContext,
    mergeMonotonicWatchContext,
} from '../../src/services/watchContextMerge.ts';

function context(overrides: Record<string, unknown> = {}) {
    return {
        accountId: 'user-1',
        userName: 'Atleta',
        isPro: true,
        todayWorkout: null,
        ...overrides,
    };
}

function workout(status: 'pending' | 'completed' = 'pending') {
    return {
        id: 'workout-1',
        type: 'rodagem',
        title: 'Rodagem',
        distanceKm: 5,
        targetPace: '6:00',
        instructions: '',
        status,
    };
}

test('primeiro envio em dia de descanso aceita previous null sem crash', () => {
    const next = context();
    assert.doesNotThrow(() => mergeMonotonicWatchContext(null, next));
    assert.deepEqual(mergeMonotonicWatchContext(null, next), next);
});

test('descanso seguido de descanso permanece válido', () => {
    const previous = context();
    const next = context({ userName: 'Atleta Atualizado' });
    assert.deepEqual(mergeMonotonicWatchContext(previous, next), next);
});

test('primeiro envio com treino também aceita previous null', () => {
    const next = context({ todayWorkout: workout() });
    assert.deepEqual(mergeMonotonicWatchContext(null, next), next);
});

test('estado concluído não regride para pendente no mesmo treino', () => {
    const previous = context({ todayWorkout: workout('completed') });
    const next = context({ todayWorkout: workout('pending') });
    const merged = mergeMonotonicWatchContext(previous, next);

    assert.equal(merged?.todayWorkout?.status, 'completed');
});

test('um treino diferente não herda conclusão do anterior', () => {
    const previous = context({ todayWorkout: workout('completed') });
    const nextWorkout = { ...workout('pending'), id: 'workout-2' };
    const next = context({ todayWorkout: nextWorkout });

    assert.deepEqual(mergeMonotonicWatchContext(previous, next), next);
});

test('um treino concluído pode avançar para um contexto de descanso', () => {
    const previous = context({ todayWorkout: workout('completed') });
    const next = context();
    assert.deepEqual(mergeMonotonicWatchContext(previous, next), next);
});

test('contexto novo null, undefined ou incompleto é recusado sem lançar', () => {
    for (const invalid of [null, undefined, {}, { todayWorkout: null }]) {
        assert.doesNotThrow(() => mergeMonotonicWatchContext(null, invalid));
        assert.equal(mergeMonotonicWatchContext(null, invalid), null);
        assert.equal(isWatchContext(invalid), false);
    }
});

test('estado anterior legado/inválido é descartado e o contexto novo segue', () => {
    const next = context({ todayWorkout: workout() });
    assert.deepEqual(mergeMonotonicWatchContext({ stale: true }, next), next);
});

test('todayWorkout null é contexto válido e não é confundido com payload inválido', () => {
    assert.equal(isWatchContext(context()), true);
});
