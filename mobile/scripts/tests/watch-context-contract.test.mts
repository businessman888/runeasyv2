import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
    WATCH_CONTEXT_MAX_BYTES,
    WATCH_CONTEXT_POLICY_VERSIONS,
    WATCH_CONTEXT_SCHEMA_VERSION,
    WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS,
    WatchContextPayloadTooLargeError,
    buildWatchContractFields,
    finalizeWatchApplicationContext,
    sanitizeWatchPropertyList,
    type WatchExecutionStep,
} from '../../src/services/watchContextContract.ts';

const fixturesPath = join(process.cwd(), 'shared', 'watch-contract', 'fixtures');

function readFixture(name: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(fixturesPath, name), 'utf8')) as Record<string, unknown>;
}

test('schema 3 mantem mapa e coach desligados por padrao', () => {
    const finalized = finalizeWatchApplicationContext({
        ...buildWatchContractFields({}),
        context_id: 'test-defaults',
    });

    assert.equal(finalized.payload.schema_version, 3);
    assert.equal(finalized.payload.watch_map_enabled, false);
    assert.equal(finalized.payload.watch_coach_enabled, false);
    assert.deepEqual(finalized.payload.policy_versions, WATCH_CONTEXT_POLICY_VERSIONS);
    assert.equal('coach_policy' in finalized.payload, false);
    assert.equal('execution_steps' in finalized.payload, false);
});

test('campos opcionais sao convertidos para snake_case sem perder unidades', () => {
    const step: WatchExecutionStep = {
        index: 1,
        blockIndex: 2,
        kind: 'work',
        metric: 'time',
        target: 90_000,
        paceMin: 280,
        paceMax: 300,
        repIndex: 1,
        repTotal: 6,
    };
    const fields = buildWatchContractFields({
        featureFlags: { liveMap: true, audioCoach: true },
        coachPolicy: {
            version: 1,
            audioOwner: 'watch',
            locale: 'pt-BR',
            splitIntervalMeters: 1_000,
            minimumCueGapSeconds: 20,
            cueTtlSeconds: 8,
            advancedCuesEnabled: false,
        },
        executionSteps: [step],
    });
    const finalized = finalizeWatchApplicationContext(fields);
    const coachPolicy = finalized.payload.coach_policy as Record<string, unknown>;
    const executionSteps = finalized.payload.execution_steps as Array<Record<string, unknown>>;

    assert.equal(coachPolicy.audio_owner, 'watch');
    assert.equal(coachPolicy.split_interval_meters, 1_000);
    assert.equal(executionSteps[0].block_index, 2);
    assert.equal(executionSteps[0].target, 90_000);
    assert.equal(executionSteps[0].rep_total, 6);
});

test('sanitizacao remove null, undefined, funcoes e numeros nao finitos', () => {
    const sanitized = sanitizeWatchPropertyList({
        keep: 'ok',
        nil: null,
        missing: undefined,
        invalidNumber: Number.NaN,
        invalidInfinity: Number.POSITIVE_INFINITY,
        callback: () => undefined,
        array: [1, null, Number.NaN, 'ok'],
        nested: { enabled: false, omitted: null },
    });

    assert.deepEqual(sanitized, {
        keep: 'ok',
        array: [1, 'ok'],
        nested: { enabled: false },
    });
});

test('payload grande remove campos opcionais e permanece abaixo do limite interno', () => {
    const repeatedSteps = Array.from({ length: 8_000 }, (_, index) => ({
        index,
        blockIndex: index,
        kind: 'work' as const,
        metric: 'distance' as const,
        target: 400,
        paceMin: 280,
        paceMax: 300,
    }));
    const finalized = finalizeWatchApplicationContext({
        ...buildWatchContractFields({ executionSteps: repeatedSteps }),
        context_id: 'test-large-optional',
        user_name: 'Atleta',
    });

    assert.equal(finalized.wasReduced, true);
    assert.ok(finalized.originalSizeBytes > WATCH_CONTEXT_MAX_BYTES);
    assert.ok(finalized.sizeBytes <= WATCH_CONTEXT_MAX_BYTES);
    assert.equal('execution_steps' in finalized.payload, false);
});

test('payload essencial acima do limite falha antes de chamar WatchConnectivity', () => {
    assert.throws(
        () => finalizeWatchApplicationContext({
            ...buildWatchContractFields({}),
            context_id: 'test-essential-too-large',
            user_name: 'A'.repeat(WATCH_CONTEXT_MAX_BYTES + 1),
        }),
        WatchContextPayloadTooLargeError,
    );
});

test('fixtures comuns cobrem leitor legado 2 e contrato completo 3', () => {
    const schema2 = readFixture('schema2-context.json');
    const schema3 = readFixture('schema3-context.json');

    assert.deepEqual(WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS, [2, 3]);
    assert.equal(WATCH_CONTEXT_SCHEMA_VERSION, 3);
    assert.equal(schema2.schema_version, 2);
    assert.equal(schema3.schema_version, 3);
    assert.equal(
        WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS.includes(schema2.schema_version as 2 | 3),
        true,
    );
    assert.equal(
        WATCH_CONTEXT_SUPPORTED_SCHEMA_VERSIONS.includes(schema3.schema_version as 2 | 3),
        true,
    );
    assert.deepEqual(sanitizeWatchPropertyList(schema2), schema2);
    assert.deepEqual(sanitizeWatchPropertyList(schema3), schema3);
});
