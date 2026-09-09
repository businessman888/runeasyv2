import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTodayActivities,
  resolveExecutedActivityMetrics,
} from '../../src/utils/watchActivityPresentation.ts';

test('uses canonical executed metrics instead of planned fallbacks', () => {
  const workout = {
    id: 'free-1',
    source: 'free',
    type: 'free_run',
    title: 'free_run',
    status: 'completed',
    scheduled_date: '2026-09-05',
    distance_km: 4.42,
    distance_run: 4.42,
    time_run_seconds: 2_000,
    pace_seconds_per_km: 452,
    target_pace_seconds: 360,
  };

  assert.deepEqual(resolveExecutedActivityMetrics(workout), {
    distanceKm: 4.42,
    durationSeconds: 2_000,
    paceSecondsPerKm: 452,
  });

  assert.deepEqual(buildTodayActivities([workout], new Date(2026, 8, 5, 12)), [
    {
      id: 'free-1',
      source: 'free',
      title: 'Corrida Livre',
      status: 'completed',
      distanceKm: 4.42,
      durationSeconds: 2_000,
      pace: '7:32',
    },
  ]);
});

test('derives pace only from real distance and duration', () => {
  const metrics = resolveExecutedActivityMetrics({
    distance_run: 5,
    time_run_seconds: 1_500,
    target_pace_seconds: 360,
  });

  assert.deepEqual(metrics, {
    distanceKm: 5,
    durationSeconds: 1_500,
    paceSecondsPerKm: 300,
  });
});

test('does not manufacture executed metrics for an incomplete legacy row', () => {
  assert.equal(
    resolveExecutedActivityMetrics({
      distance_run: 4.42,
      target_pace_seconds: 360,
    }),
    null,
  );
});

test('keeps legacy Watch aliases while canonical rows are drained', () => {
  assert.deepEqual(
    resolveExecutedActivityMetrics({
      distance_km: 2,
      duration_seconds: 720,
      avg_pace_seconds_per_km: 360,
    }),
    {
      distanceKm: 2,
      durationSeconds: 720,
      paceSecondsPerKm: 360,
    },
  );
});
