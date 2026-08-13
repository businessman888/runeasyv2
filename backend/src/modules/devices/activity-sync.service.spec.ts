import {
  ReconciliationCandidate,
  selectReconciliationCandidate,
} from './activity-sync.service';

const candidate = (
  overrides: Partial<ReconciliationCandidate> = {},
): ReconciliationCandidate => ({
  id: 'workout-1',
  source: 'plan',
  scheduled_date: '2026-08-13',
  distance_km: 5,
  ...overrides,
});

describe('selectReconciliationCandidate', () => {
  it('matches a high-confidence plan workout on the same day', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 5.2, [candidate()]),
    ).toMatchObject({ id: 'workout-1', source: 'plan' });
  });

  it('also supports manual workouts', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 9.8, [
        candidate({ id: 'manual-1', source: 'manual', distance_km: 10 }),
      ]),
    ).toMatchObject({ id: 'manual-1', source: 'manual' });
  });

  it('does not associate a workout from another calendar day', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 5, [
        candidate({ scheduled_date: '2026-08-12' }),
      ]),
    ).toBeNull();
  });

  it('rejects distance outside the ten-percent tolerance', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 5.6, [candidate()]),
    ).toBeNull();
  });

  it('does not guess when two candidates have similar distance', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 5, [
        candidate({ id: 'plan-1', distance_km: 5 }),
        candidate({ id: 'manual-1', source: 'manual', distance_km: 5.1 }),
      ]),
    ).toBeNull();
  });

  it('selects a clearly better candidate', () => {
    expect(
      selectReconciliationCandidate('2026-08-13', 5, [
        candidate({ id: 'plan-1', distance_km: 5 }),
        candidate({ id: 'manual-1', source: 'manual', distance_km: 5.5 }),
      ]),
    ).toMatchObject({ id: 'plan-1' });
  });
});
