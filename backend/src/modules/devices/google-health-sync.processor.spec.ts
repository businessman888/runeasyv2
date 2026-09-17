import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { SupabaseService } from '../../database/supabase.service';
import { ActivitySyncService } from './activity-sync.service';
import { RefreshTokenInvalidError } from './token-refresher';
import { GoogleHealthSyncProcessor } from './google-health-sync.processor';
import {
  GoogleHealthApiClient,
  GoogleHealthRateLimitError,
} from './providers/google-health-api.client';
import { GoogleHealthNormalizer } from './providers/google-health.normalizer';
import {
  GOOGLE_HEALTH_JOB_BACKFILL,
  GOOGLE_HEALTH_JOB_DELETE,
  GOOGLE_HEALTH_JOB_SYNC_WINDOW,
  GOOGLE_HEALTH_SYNC_QUEUE,
} from './providers/google-health-webhook.types';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const ACTIVITY_ID = 'activity-1';
const DATA_POINT_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

type ChainResult = { data?: unknown; error?: { message: string } | null };

/** Chain do supabase-js: tudo devolve `this`, e `this` é thenable. */
interface Chain {
  select: jest.Mock<Chain, [string]>;
  update: jest.Mock<Chain, [Record<string, unknown>]>;
  delete: jest.Mock<Chain, []>;
  eq: jest.Mock<Chain, [string, unknown]>;
  in: jest.Mock<Chain, [string, unknown[]]>;
  maybeSingle: jest.Mock<Promise<ChainResult>, []>;
  then: (
    resolve: (value: ChainResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function chain(result: ChainResult = { error: null }): Chain {
  const c = {} as Chain;
  c.select = jest.fn<Chain, [string]>(() => c);
  c.update = jest.fn<Chain, [Record<string, unknown>]>(() => c);
  c.delete = jest.fn<Chain, []>(() => c);
  c.eq = jest.fn<Chain, [string, unknown]>(() => c);
  c.in = jest.fn<Chain, [string, unknown[]]>(() => c);
  c.maybeSingle = jest.fn<Promise<ChainResult>, []>(() =>
    Promise.resolve(result),
  );
  c.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return c;
}

interface ConnectionState {
  scope: string;
  hasLocationScope: boolean;
  hasActivityScope: boolean;
  providerUserId: string | null;
}

interface ListResult {
  dataPoints: unknown[];
  truncated: boolean;
}

interface SyncOutcome {
  action: string;
  activityId: string | null;
}

function job(name: string, data: unknown): Job<unknown, unknown, string> {
  return {
    id: 'job-1',
    name,
    data,
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as unknown as Job<unknown, unknown, string>;
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    clientProvidedSubscriptionName: USER_ID,
    dataType: 'exercise',
    operation: 'UPSERT',
    intervals: [
      {
        physicalTimeInterval: {
          startTime: '2026-09-15T10:30:00Z',
          endTime: '2026-09-15T11:00:00Z',
        },
      },
    ],
    ...overrides,
  };
}

function runningDataPoint() {
  return {
    name: `users/abcd1234/dataTypes/exercise/dataPoints/${DATA_POINT_ID}`,
    exercise: {
      exerciseType: 'RUNNING',
      activeDuration: '1800s',
      interval: {
        startTime: '2026-09-15T10:30:00Z',
        startUtcOffset: '-10800s',
        civilStartTime: '2026-09-15T07:30:00',
      },
      metricsSummary: {
        distanceMillimeters: 5000000,
        averageSpeedMillimetersPerSecond: 2777.78,
      },
      exerciseMetadata: { hasGps: true },
    },
  };
}

describe('GoogleHealthSyncProcessor', () => {
  let processor: GoogleHealthSyncProcessor;
  let from: jest.Mock<Chain, [string]>;
  let tables: Record<string, Chain[]>;
  let apiClient: {
    getConnectionState: jest.Mock<Promise<ConnectionState>, [string]>;
    listAllExercise: jest.Mock<
      Promise<ListResult>,
      [string, { kind: string; startTime: string; endTime: string }, number]
    >;
    persistHealthUserId: jest.Mock<
      Promise<string | null>,
      [string, unknown[], string | null]
    >;
  };
  let activitySync: {
    processDeviceLocalActivity: jest.Mock<
      Promise<SyncOutcome>,
      [Record<string, unknown>, string]
    >;
  };
  let queue: {
    add: jest.Mock<
      Promise<unknown>,
      [string, unknown, Record<string, unknown>]
    >;
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    tables = {};
    from = jest.fn<Chain, [string]>((table: string) => {
      const pending = tables[table];
      if (!pending || pending.length === 0) {
        throw new Error(`consulta inesperada em '${table}'`);
      }
      return pending.length === 1 ? pending[0] : pending.shift();
    });

    apiClient = {
      getConnectionState: jest.fn<Promise<ConnectionState>, [string]>(() =>
        Promise.resolve({
          scope: '',
          hasLocationScope: true,
          hasActivityScope: true,
          providerUserId: null,
        }),
      ),
      listAllExercise: jest.fn<
        Promise<ListResult>,
        [string, { kind: string; startTime: string; endTime: string }, number]
      >(() => Promise.resolve({ dataPoints: [], truncated: false })),
      persistHealthUserId: jest.fn<
        Promise<string | null>,
        [string, unknown[], string | null]
      >(() => Promise.resolve(null)),
    };

    activitySync = {
      processDeviceLocalActivity: jest.fn<
        Promise<SyncOutcome>,
        [Record<string, unknown>, string]
      >(() => Promise.resolve({ action: 'inserted', activityId: ACTIVITY_ID })),
    };

    queue = {
      add: jest.fn<
        Promise<unknown>,
        [string, unknown, Record<string, unknown>]
      >(() => Promise.resolve({})),
    };

    const module = await Test.createTestingModule({
      providers: [
        GoogleHealthSyncProcessor,
        GoogleHealthNormalizer,
        { provide: getQueueToken(GOOGLE_HEALTH_SYNC_QUEUE), useValue: queue },
        { provide: GoogleHealthApiClient, useValue: apiClient },
        { provide: ActivitySyncService, useValue: activitySync },
        { provide: SupabaseService, useValue: { from } },
      ],
    }).compile();

    processor = module.get(GoogleHealthSyncProcessor);
  });

  afterEach(() => jest.restoreAllMocks());

  /** A conexão existe: `resolveUserId` acha a linha pelo subscriptionId. */
  function connectionFound() {
    tables.connected_devices = [
      chain({ data: { user_id: USER_ID }, error: null }),
    ];
  }

  // ─── token morto ⇒ UnrecoverableError ────────────────────────────────────

  describe('RefreshTokenInvalidError', () => {
    it('vira UnrecoverableError — sem isso as 3 tentativas herdadas queimam contra um token morto', async () => {
      connectionFound();
      apiClient.getConnectionState.mockRejectedValue(
        new RefreshTokenInvalidError('invalid_grant: Token has been expired'),
      );

      const error = await processor
        .process(
          job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
            notification: notification(),
            receivedAt: '2026-09-15T11:05:00Z',
          }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect((error as Error).message).toContain('degraded');
    });

    it('dispositivo desconectado (NotFoundException) também é irrecuperável', async () => {
      connectionFound();
      apiClient.getConnectionState.mockRejectedValue(
        new NotFoundException('No google_health device found for user'),
      );

      const error = await processor
        .process(
          job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
            notification: notification(),
            receivedAt: '2026-09-15T11:05:00Z',
          }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnrecoverableError);
    });

    it('429 NÃO é irrecuperável — ele sobe como está, para o retry acontecer', async () => {
      connectionFound();
      apiClient.listAllExercise.mockRejectedValue(
        new GoogleHealthRateLimitError(90),
      );

      const error = await processor
        .process(
          job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
            notification: notification(),
            receivedAt: '2026-09-15T11:05:00Z',
          }),
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GoogleHealthRateLimitError);
      expect(error).not.toBeInstanceOf(UnrecoverableError);
    });
  });

  // ─── sync-window ─────────────────────────────────────────────────────────

  describe('sync-window', () => {
    it('ingere a corrida por processDeviceLocalActivity com source google_health', async () => {
      connectionFound();
      apiClient.listAllExercise.mockResolvedValue({
        dataPoints: [runningDataPoint()],
        truncated: false,
      });

      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification(),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(activitySync.processDeviceLocalActivity).toHaveBeenCalledTimes(1);
      const [activity, source] =
        activitySync.processDeviceLocalActivity.mock.calls[0];
      expect(source).toBe('google_health');
      expect(activity.external_id).toBe(`gh_${DATA_POINT_ID}`);
      expect(activity.distance).toBe(5000);
      expect(activity.user_id).toBe(USER_ID);
      expect(result).toMatchObject({ ingested: 1 });
    });

    it('a janela sai dos intervals da PRÓPRIA notificação, não de last_sync_at (coluna do Commit C)', async () => {
      connectionFound();

      await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification(),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      const [, window] = apiClient.listAllExercise.mock.calls[0];
      // Sem intervalo civil na notificação, a janela é derivada do físico e
      // alargada em 1 dia para cada lado: o fuso de quem correu é desconhecido.
      expect(window.startTime).toBe('2026-09-14T10:30:00');
      expect(window.endTime).toBe('2026-09-16T11:00:00');
    });

    it('prefere o intervalo CIVIL da notificação — é o único que a API filtra', async () => {
      // Medido em 2026-09-17: `exercise.interval.start_time` devolve 400
      // INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER; só o civil é filtrável. E a
      // notificação já traz o civil pronto, então não há fuso a adivinhar.
      connectionFound();

      await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification({
            intervals: [
              {
                physicalTimeInterval: {
                  startTime: '2026-09-15T10:30:00Z',
                  endTime: '2026-09-15T11:00:00Z',
                },
                civilIso8601TimeInterval: {
                  startTime: '2026-09-15T07:30:00',
                  endTime: '2026-09-15T08:00:00',
                },
              },
            ],
          }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      const [, window] = apiClient.listAllExercise.mock.calls[0];
      // Janela estreita (±1 min), porque o civil é exato — e sem sufixo de fuso.
      expect(window.startTime).toBe('2026-09-15T07:29:00');
      expect(window.endTime).toBe('2026-09-15T08:01:00');
    });

    it('descarta o que não é corrida sem chamar a convergência', async () => {
      connectionFound();
      const walk = runningDataPoint();
      walk.exercise.exerciseType = 'WALKING';
      apiClient.listAllExercise.mockResolvedValue({
        dataPoints: [walk],
        truncated: false,
      });

      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification(),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(activitySync.processDeviceLocalActivity).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ingested: 0, rejected: 1 });
    });

    it('notificação sem usuário correspondente é ignorada — não queima 3 tentativas', async () => {
      tables.connected_devices = [
        chain({ data: null, error: null }),
        chain({ data: null, error: null }),
      ];

      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification({ healthUserId: 'gh-user' }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(result).toMatchObject({ ignored: true });
      expect(apiClient.listAllExercise).not.toHaveBeenCalled();
    });

    it('dataType fora de escopo é ignorado sem tocar na API', async () => {
      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification({ dataType: 'sleep' }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(result).toMatchObject({ ignored: true });
      expect(apiClient.listAllExercise).not.toHaveBeenCalled();
    });

    it('resolve o usuário pelo healthUserId quando não há subscription (antes do Commit C)', async () => {
      tables.connected_devices = [
        chain({ data: { user_id: USER_ID }, error: null }),
      ];

      await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification({
            clientProvidedSubscriptionName: undefined,
            healthUserId: 'abcd1234',
          }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(apiClient.listAllExercise).toHaveBeenCalled();
    });

    it('persiste o healthUserId que veio de graça no name — o Commit C precisa dele', async () => {
      connectionFound();
      apiClient.listAllExercise.mockResolvedValue({
        dataPoints: [runningDataPoint()],
        truncated: false,
      });

      await processor.process(
        job(GOOGLE_HEALTH_JOB_SYNC_WINDOW, {
          notification: notification(),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(apiClient.persistHealthUserId).toHaveBeenCalledWith(
        USER_ID,
        expect.any(Array),
        null,
      );
    });
  });

  // ─── backfill ────────────────────────────────────────────────────────────

  describe('backfill', () => {
    it('é job SEPARADO, com attempts/backoff próprios — 3×5 s não cobre rate limit', async () => {
      await processor.enqueueBackfill({
        userId: USER_ID,
        startTime: '2026-06-01T00:00:00.000Z',
        endTime: '2026-09-01T00:00:00.000Z',
      });

      const [name, , rawOpts] = queue.add.mock.calls[0];
      const opts = rawOpts as {
        attempts: number;
        backoff: { delay: number };
        jobId: string;
      };
      expect(name).toBe(GOOGLE_HEALTH_JOB_BACKFILL);
      expect(name).not.toBe(GOOGLE_HEALTH_JOB_SYNC_WINDOW);
      expect(opts.attempts).toBeGreaterThan(3);
      expect(opts.backoff.delay).toBeGreaterThanOrEqual(60_000);
      // Sem `:` — o BullMQ compõe chave de Redis com dois-pontos.
      expect(opts.jobId).not.toContain(':');
    });

    it('usa a janela recebida por parâmetro, não a de uma notificação', async () => {
      await processor.process(
        job(GOOGLE_HEALTH_JOB_BACKFILL, {
          userId: USER_ID,
          startTime: '2026-06-01T00:00:00.000Z',
          endTime: '2026-09-01T00:00:00.000Z',
        }),
      );

      const [userId, window, maxPages] =
        apiClient.listAllExercise.mock.calls[0];
      expect(userId).toBe(USER_ID);
      expect(window.startTime).toBe('2026-06-01T00:00:00.000Z');
      expect(maxPages).toBeGreaterThan(8);
    });
  });

  // ─── DELETE ──────────────────────────────────────────────────────────────

  describe('operation: DELETE', () => {
    it('apaga a activity, ANULA workouts.activity_id e deixa o workout como completed', async () => {
      const connection = chain({ data: { user_id: USER_ID }, error: null });
      const activityLookup = chain({ data: { id: ACTIVITY_ID }, error: null });
      const activityDelete = chain({ error: null });
      const workoutLookup = chain({ data: [{ id: 'workout-9' }], error: null });
      const workoutUnlink = chain({ error: null });

      tables.connected_devices = [connection];
      tables.activities = [activityLookup, activityDelete];
      tables.workouts = [workoutLookup, workoutUnlink];

      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_DELETE, {
          notification: notification({
            operation: 'DELETE',
            recordId: DATA_POINT_ID,
          }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(activityLookup.eq).toHaveBeenCalledWith(
        'external_id',
        `gh_${DATA_POINT_ID}`,
      );
      expect(workoutUnlink.update).toHaveBeenCalledWith({ activity_id: null });
      // O workout NÃO volta para `pending` — decisão adiada, registrada.
      expect(workoutUnlink.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
      expect(activityDelete.delete).toHaveBeenCalled();
      expect(result).toMatchObject({
        deleted: true,
        workoutIds: ['workout-9'],
      });
    });

    it('registra EXPLICITAMENTE o que não foi estornado — XP, badges, rota e workout', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      tables.connected_devices = [
        chain({ data: { user_id: USER_ID }, error: null }),
      ];
      tables.activities = [
        chain({ data: { id: ACTIVITY_ID }, error: null }),
        chain({ error: null }),
      ];
      tables.workouts = [
        chain({ data: [{ id: 'workout-9' }], error: null }),
        chain({ error: null }),
      ];

      await processor.process(
        job(GOOGLE_HEALTH_JOB_DELETE, {
          notification: notification({
            operation: 'DELETE',
            recordId: DATA_POINT_ID,
          }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      const audit = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(audit).toContain(USER_ID);
      expect(audit).toContain(`gh_${DATA_POINT_ID}`);
      expect(audit).toContain('workout-9');
      expect(audit).toContain('XP');
      expect(audit).toContain('badges');
      expect(audit).toContain('workout_routes');
      expect(audit).toContain('completed');
    });

    it('activity inexistente é no-op idempotente — reentrega não erra', async () => {
      tables.connected_devices = [
        chain({ data: { user_id: USER_ID }, error: null }),
      ];
      tables.activities = [chain({ data: null, error: null })];

      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_DELETE, {
          notification: notification({
            operation: 'DELETE',
            recordId: DATA_POINT_ID,
          }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(result).toMatchObject({ deleted: false, reason: 'not_found' });
    });

    it('sem recordId não há o que apagar — ignorado, sem consultar nada', async () => {
      const result = await processor.process(
        job(GOOGLE_HEALTH_JOB_DELETE, {
          notification: notification({ operation: 'DELETE' }),
          receivedAt: '2026-09-15T11:05:00Z',
        }),
      );

      expect(result).toMatchObject({ ignored: true });
      expect(from).not.toHaveBeenCalled();
    });
  });

  it('job name desconhecido é ignorado, não retentado', async () => {
    await expect(
      processor.process(job('coisa-nova', {})),
    ).resolves.toMatchObject({ ignored: true });
  });
});
