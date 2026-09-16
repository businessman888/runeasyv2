import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ActivitySyncService,
  CROSS_PROVIDER_EXCLUDED_SOURCES,
  DEVICE_LOCAL_SOURCES,
  DeviceLocalActivity,
  DeviceLocalSource,
  ReconciliationCandidate,
  crossProviderExcludedSources,
  selectReconciliationCandidate,
} from './activity-sync.service';
import { SupabaseService } from '../../database/supabase.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { TrainingService } from '../training/training.service';

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

// ─── dedup cross-provider: o mapa por fonte ────────────────────────────────

describe('CROSS_PROVIDER_EXCLUDED_SOURCES', () => {
  it('cobre todas as fontes device-local, sem entrada faltando', () => {
    for (const source of DEVICE_LOCAL_SOURCES) {
      expect(CROSS_PROVIDER_EXCLUDED_SOURCES[source]).toBeDefined();
    }
    expect(Object.keys(CROSS_PROVIDER_EXCLUDED_SOURCES).sort()).toEqual(
      [...DEVICE_LOCAL_SOURCES].sort(),
    );
  });

  it('toda fonte exclui a si mesma — a re-sincronização é resolvida pelo external_id', () => {
    for (const source of DEVICE_LOCAL_SOURCES) {
      expect(crossProviderExcludedSources(source)).toContain(source);
    }
  });

  it('É SIMÉTRICO: se A ignora B, B ignora A — nos DOIS sentidos', () => {
    // Uma entrada assimétrica não quebra nada visivelmente: ela só deixa a
    // duplicata passar quando a ordem de chegada é uma, e não a outra.
    for (const a of DEVICE_LOCAL_SOURCES) {
      for (const b of DEVICE_LOCAL_SOURCES) {
        if (a === b) continue;
        expect(crossProviderExcludedSources(a).includes(b)).toBe(
          crossProviderExcludedSources(b).includes(a),
        );
      }
    }
  });

  it('google_health e health_connect são candidatos UM DO OUTRO — é o gate da Fase 4', () => {
    expect(crossProviderExcludedSources('google_health')).not.toContain(
      'health_connect',
    );
    expect(crossProviderExcludedSources('health_connect')).not.toContain(
      'google_health',
    );
  });

  it('apple_health e health_connect mantêm o comportamento anterior entre si', () => {
    expect(crossProviderExcludedSources('apple_health')).toContain(
      'health_connect',
    );
    expect(crossProviderExcludedSources('health_connect')).toContain(
      'apple_health',
    );
  });
});

type Row = Record<string, unknown>;
type ChainResult = { data: unknown; error: null };

/** Chains tipadas, no molde de `token-refresh.service.spec.ts`. */
interface ReadChain {
  select: jest.Mock<ReadChain, [string]>;
  eq: jest.Mock<ReadChain, [string, unknown]>;
  in: jest.Mock<ReadChain, [string, unknown[]]>;
  neq: jest.Mock<ReadChain, [string, unknown]>;
  gte: jest.Mock<ReadChain, [string, unknown]>;
  lte: jest.Mock<ReadChain, [string, unknown]>;
  update: jest.Mock<ReadChain, [Record<string, unknown>]>;
  single: jest.Mock<Promise<ChainResult>, []>;
  then: (
    resolve: (value: ChainResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

interface CrossProviderChain extends ReadChain {
  /** As fontes que a query pediu para EXCLUIR, para o teste inspecionar. */
  excluded: Set<string>;
}

function baseChain(): ReadChain {
  const c = {} as ReadChain;
  c.select = jest.fn<ReadChain, [string]>(() => c);
  c.eq = jest.fn<ReadChain, [string, unknown]>(() => c);
  c.in = jest.fn<ReadChain, [string, unknown[]]>(() => c);
  c.neq = jest.fn<ReadChain, [string, unknown]>(() => c);
  c.gte = jest.fn<ReadChain, [string, unknown]>(() => c);
  c.lte = jest.fn<ReadChain, [string, unknown]>(() => c);
  c.update = jest.fn<ReadChain, [Record<string, unknown>]>(() => c);
  c.single = jest.fn<Promise<ChainResult>, []>(() =>
    Promise.resolve({ data: null, error: null }),
  );
  c.then = (resolve, reject) =>
    Promise.resolve({ data: [], error: null } as ChainResult).then(
      resolve,
      reject,
    );
  return c;
}

/** `from('activities').select().eq('external_id').single()` — idempotência. */
function idempotencyChain(existing: Row | null): ReadChain {
  const c = baseChain();
  c.single = jest.fn<Promise<ChainResult>, []>(() =>
    Promise.resolve({ data: existing, error: null }),
  );
  return c;
}

/**
 * A query cross-provider. O mock APLICA os `neq('source', …)` sobre as linhas
 * fingidas — é o que faz este teste exercitar o mapa de verdade, em vez de
 * devolver o que foi plantado independentemente do filtro.
 */
function crossProviderChain(rows: Row[]): CrossProviderChain {
  const base = baseChain();
  const excluded = new Set<string>();
  const c = Object.assign(base, { excluded });
  c.neq = jest.fn<ReadChain, [string, unknown]>(
    (column: string, value: unknown) => {
      if (column === 'source' && typeof value === 'string') {
        excluded.add(value);
      }
      return c;
    },
  );
  c.then = (resolve, reject) =>
    Promise.resolve({
      data: rows.filter(
        (row) => typeof row.source === 'string' && !excluded.has(row.source),
      ),
      error: null,
    } as ChainResult).then(resolve, reject);
  return c;
}

function deviceLocalActivity(
  source: DeviceLocalSource,
  externalId: string,
): DeviceLocalActivity {
  return {
    external_id: externalId,
    source,
    user_id: 'user-1',
    name: 'Corrida',
    type: 'Run',
    start_date: '2026-09-15T10:30:00-03:00',
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    average_pace: 360,
    environment: 'outdoor',
  };
}

describe('processDeviceLocalActivity — dedup Google Health ⇄ Health Connect', () => {
  let service: ActivitySyncService;
  let from: jest.Mock<ReadChain, [string]>;
  let completeWorkout: jest.Mock<Promise<unknown>, [string, string, unknown]>;
  let completeFreeWorkout: jest.Mock<
    Promise<{ id: string } | null>,
    [string, unknown]
  >;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    from = jest.fn<ReadChain, [string]>();
    completeWorkout = jest.fn<Promise<unknown>, [string, string, unknown]>();
    completeFreeWorkout = jest.fn<
      Promise<{ id: string } | null>,
      [string, unknown]
    >();

    const module = await Test.createTestingModule({
      providers: [
        ActivitySyncService,
        { provide: SupabaseService, useValue: { from } },
        {
          provide: TrainingService,
          useValue: { completeWorkout, completeFreeWorkout },
        },
        {
          provide: SubscriptionService,
          useValue: { isProUser: jest.fn(() => Promise.resolve(true)) },
        },
      ],
    }).compile();

    service = module.get(ActivitySyncService);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Qualquer consulta que o caminho longo faça depois do cross-provider. */
  const emptyChain = baseChain;

  async function ingest(
    source: DeviceLocalSource,
    alreadyStored: { source: string; distance: number },
  ) {
    const cross = crossProviderChain([
      {
        id: 'existing-1',
        start_date: '2026-09-15T13:30:00Z',
        ...alreadyStored,
      },
    ]);
    completeFreeWorkout.mockResolvedValue({ id: 'workout-livre' });
    from
      .mockReturnValueOnce(idempotencyChain(null))
      .mockReturnValueOnce(cross)
      .mockReturnValue(emptyChain());

    const result = await service.processDeviceLocalActivity(
      deviceLocalActivity(source, `${source}_novo`),
      source,
    );
    return { result, cross };
  }

  it('Google Health chegando depois do Health Connect: recusado como skipped_crossprovider', async () => {
    const { result, cross } = await ingest('google_health', {
      source: 'health_connect',
      distance: 5050,
    });

    expect(result).toMatchObject({
      action: 'skipped_crossprovider',
      activityId: 'existing-1',
    });
    expect(cross.excluded.has('health_connect')).toBe(false);
    expect(completeWorkout).not.toHaveBeenCalled();
    expect(completeFreeWorkout).not.toHaveBeenCalled();
  });

  it('Health Connect chegando depois do Google Health: recusado também — a simetria é o ponto', async () => {
    const { result, cross } = await ingest('health_connect', {
      source: 'google_health',
      distance: 5050,
    });

    expect(result).toMatchObject({
      action: 'skipped_crossprovider',
      activityId: 'existing-1',
    });
    expect(cross.excluded.has('google_health')).toBe(false);
    expect(completeFreeWorkout).not.toHaveBeenCalled();
  });

  it('distância fora dos ±10% não é a mesma corrida — não recusa', async () => {
    const { result } = await ingest('google_health', {
      source: 'health_connect',
      distance: 9000,
    });

    expect(result).not.toMatchObject({ action: 'skipped_crossprovider' });
  });
});
