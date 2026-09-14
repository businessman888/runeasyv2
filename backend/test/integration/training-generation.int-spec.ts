import { Client, PoolClient } from 'pg';
import { closePool, getPool, newClient, resetData } from '../db/db';
import { seedPlan } from '../db/fixtures';

const plan = { goal: '10k', duration_weeks: 12, frequency_per_week: 3 };
const request = {
  goal: '10k',
  duration: 12,
  frequency: 3,
  availableDays: [1, 3, 6],
  targetTime: 3600,
};
const workouts = [
  {
    week_number: 1,
    scheduled_date: '2026-09-15',
    type: 'easy_run',
    distance_km: 5,
    instructions_json: [],
    tips: [],
    title: 'Easy',
  },
];
const reserveSql = `SELECT public.reserve_training_plan($1::uuid,$2::text,$3::jsonb,$4::jsonb,$5::uuid,$6::uuid,$7::text,$8::text) AS result`;
const reserveSignature =
  'public.reserve_training_plan(uuid,text,jsonb,jsonb,uuid,uuid,text,text)';
const finalizeSignature =
  'public.finalize_training_plan(uuid,uuid,integer,jsonb,jsonb)';
type DbClient = Client | PoolClient;
interface Reservation {
  created: boolean;
  plan_id: string;
  generation_status: string;
  plan: {
    id: string;
    generation_attempt: number;
    status: string;
    generation_source: string;
  };
  request: typeof request;
}
interface ReserveArgs {
  userId: string;
  source?: string;
  retroId?: string;
  retryId?: string;
  plan?: Record<string, unknown>;
  request?: Record<string, unknown>;
}
function params(a: ReserveArgs) {
  return [
    a.userId,
    a.source ?? 'onboarding',
    JSON.stringify(a.plan ?? plan),
    JSON.stringify(a.request ?? request),
    a.retroId ?? null,
    a.retryId ?? null,
    'local-test-request',
    'local-test-event',
  ];
}
async function asRole<T>(
  role: 'service_role' | 'anon' | 'authenticated',
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${role}`);
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
async function reserveOn(c: DbClient, a: ReserveArgs): Promise<Reservation> {
  return (await c.query(reserveSql, params(a))).rows[0].result;
}
function reserve(a: ReserveArgs): Promise<Reservation> {
  return asRole('service_role', (c) => reserveOn(c, a));
}
async function finalize(
  userId: string,
  planId: string,
  attempt: number,
  resultWorkouts: unknown = workouts,
) {
  return asRole(
    'service_role',
    async (c) =>
      (
        await c.query(
          'SELECT public.finalize_training_plan($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::jsonb) AS result',
          [
            userId,
            planId,
            attempt,
            JSON.stringify({ weeks: [{ week: 1 }] }),
            JSON.stringify(resultWorkouts),
          ],
        )
      ).rows[0].result,
  );
}
async function newUser(): Promise<string> {
  const { rows } = await getPool().query(
    'INSERT INTO auth.users(id) VALUES(gen_random_uuid()) RETURNING id',
  );
  const id = rows[0].id;
  await getPool().query(
    `INSERT INTO public.users(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING`,
    [id, `${id}@example.test`],
  );
  return id;
}
async function endedCycle(status = 'completed') {
  const seeded = await seedPlan({
    planStatus: 'completed',
    generationStatus: 'complete',
    workouts: [],
  });
  const { rows } = await getPool().query(
    'INSERT INTO public.plan_retrospectives(user_id,plan_id,status) VALUES($1,$2,$3) RETURNING id',
    [seeded.userId, seeded.planId, status],
  );
  return { ...seeded, retroId: rows[0].id };
}
async function activeIds(userId: string) {
  return (
    await getPool().query(
      "SELECT id FROM public.training_plans WHERE user_id=$1 AND status='active'",
      [userId],
    )
  ).rows.map((r) => r.id);
}
async function retroStatus(retroId: string) {
  return (
    await getPool().query(
      'SELECT status FROM public.plan_retrospectives WHERE id=$1',
      [retroId],
    )
  ).rows[0].status;
}
async function markFailed(planId: string) {
  await getPool().query(
    "UPDATE public.training_plans SET generation_status='failed' WHERE id=$1",
    [planId],
  );
}

// Two independent sessions prove lock waiting, not just two sequential promises.
async function concurrentReservations(first: ReserveArgs, second: ReserveArgs) {
  const a = await newClient();
  const b = await newClient();
  let pending: Promise<Reservation> | undefined;
  try {
    await a.query('BEGIN');
    await a.query('SET LOCAL ROLE service_role');
    await b.query("SET lock_timeout = '5s'");
    await b.query('SET ROLE service_role');
    const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const winner = await reserveOn(a, first);
    pending = reserveOn(b, second);
    // Attach handler immediately so failures do not escape while checking lock.
    void pending.catch(() => undefined);
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      const { rows } = await getPool().query(
        'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
        [pid],
      );
      if (rows[0].blocked) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked).toBe(true);
    await a.query('COMMIT');
    return [winner, await pending];
  } finally {
    await a.query('ROLLBACK');
    if (pending) await pending.catch(() => undefined);
    await Promise.all([a.end(), b.end()]);
  }
}

beforeEach(() => resetData());
afterAll(async () => {
  await resetData();
  await closePool();
});

describe('Training generation reservation in real PostgreSQL', () => {
  it('serializes onboarding and subscription requests into one paid generation', async () => {
    const userId = await newUser();
    const [a, b] = await concurrentReservations(
      { userId },
      { userId, source: 'subscription' },
    );
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.plan_id).toBe(a.plan_id);
    expect(await activeIds(userId)).toEqual([a.plan_id]);
  });

  it.each(['onboarding', 'subscription'])(
    'blocks %s after a completed cycle even without a retrospective',
    async (source) => {
      const { userId } = await seedPlan({
        planStatus: 'completed',
        workouts: [],
      });
      await expect(reserve({ userId, source })).rejects.toThrow(
        'GENERATION_CYCLE_CONFIRMATION_REQUIRED',
      );
      expect(await activeIds(userId)).toEqual([]);
    },
  );

  it('returns a failed active plan without silently retrying paid AI', async () => {
    const userId = await newUser();
    const first = await reserve({ userId });
    await markFailed(first.plan_id);
    const replay = await reserve({ userId });
    expect(replay.created).toBe(false);
    expect(replay.generation_status).toBe('failed');
    expect(replay.plan.generation_attempt).toBe(1);
  });

  it('serializes accept/customize, archives only once, and persists the winning request', async () => {
    const cycle = await endedCycle();
    const [a, b] = await concurrentReservations(
      {
        userId: cycle.userId,
        source: 'retrospective_customize',
        retroId: cycle.retroId,
      },
      {
        userId: cycle.userId,
        source: 'retrospective_accept',
        retroId: cycle.retroId,
        request: { goal: '5k' },
      },
    );
    expect([a.created, b.created]).toEqual([true, false]);
    expect(b.plan_id).toBe(a.plan_id);
    expect(b.request).toEqual(request);
    expect(await retroStatus(cycle.retroId)).toBe('archived');
    expect(await activeIds(cycle.userId)).toEqual([a.plan_id]);
  });

  it('rolls back cancellation and archival when plan validation fails', async () => {
    const cycle = await endedCycle();
    const { rows } = await getPool().query(
      "INSERT INTO public.training_plans(user_id,status) VALUES($1,'active') RETURNING id",
      [cycle.userId],
    );
    await expect(
      reserve({
        userId: cycle.userId,
        source: 'retrospective_accept',
        retroId: cycle.retroId,
        plan: { ...plan, duration_weeks: 'invalid' },
      }),
    ).rejects.toThrow();
    expect(await activeIds(cycle.userId)).toEqual([rows[0].id]);
    expect(await retroStatus(cycle.retroId)).toBe('completed');
    expect(
      (
        await getPool().query(
          'SELECT count(*)::int AS count FROM public.training_plan_generation_requests',
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it.each(['pending', 'processing', 'failed', 'archived'])(
    'rejects a %s retrospective without creating a plan',
    async (status) => {
      const cycle = await endedCycle(status);
      await expect(
        reserve({
          userId: cycle.userId,
          source: 'retrospective_accept',
          retroId: cycle.retroId,
        }),
      ).rejects.toThrow(
        /GENERATION_RETROSPECTIVE_(NOT_READY|ALREADY_CONSUMED)/,
      );
      expect(await activeIds(cycle.userId)).toEqual([]);
    },
  );

  it('rejects foreign retrospective and retry ownership', async () => {
    const cycle = await endedCycle();
    const stranger = await newUser();
    await expect(
      reserve({
        userId: stranger,
        source: 'retrospective_accept',
        retroId: cycle.retroId,
      }),
    ).rejects.toThrow('GENERATION_RETROSPECTIVE_NOT_FOUND');
    const own = await reserve({
      userId: cycle.userId,
      source: 'retrospective_accept',
      retroId: cycle.retroId,
    });
    await markFailed(own.plan_id);
    await expect(
      reserve({ userId: stranger, source: 'retry', retryId: own.plan_id }),
    ).rejects.toThrow('GENERATION_RETRY_NOT_ALLOWED');
    expect((await finalize(stranger, own.plan_id, 1)).applied).toBe(false);
  });

  it('does not revive an old consumed retrospective after its plan is cancelled', async () => {
    const cycle = await endedCycle();
    const first = await reserve({
      userId: cycle.userId,
      source: 'retrospective_accept',
      retroId: cycle.retroId,
    });
    await getPool().query(
      "UPDATE public.training_plans SET status='cancelled' WHERE id=$1",
      [first.plan_id],
    );
    const replay = await reserve({
      userId: cycle.userId,
      source: 'retrospective_customize',
      retroId: cycle.retroId,
    });
    expect(replay.created).toBe(false);
    expect(replay.plan.status).toBe('cancelled');
    expect(await activeIds(cycle.userId)).toEqual([]);
  });

  it('retries only the same failed plan with persisted inputs and fences the old attempt', async () => {
    const userId = await newUser();
    const first = await reserve({ userId });
    await markFailed(first.plan_id);
    const retry = await reserve({
      userId,
      source: 'retry',
      retryId: first.plan_id,
      request: { goal: 'marathon' },
    });
    expect(retry.created).toBe(true);
    expect(retry.plan_id).toBe(first.plan_id);
    expect(retry.request).toEqual(request);
    expect(retry.plan.generation_attempt).toBe(2);
    expect((await finalize(userId, first.plan_id, 1)).applied).toBe(false);
    expect((await finalize(userId, first.plan_id, 2)).applied).toBe(true);
    expect((await finalize(userId, first.plan_id, 2)).applied).toBe(false);
    expect(
      (
        await getPool().query(
          'SELECT count(*)::int AS count FROM public.workouts WHERE plan_id=$1',
          [first.plan_id],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('rejects retry for running, complete, cancelled, and legacy failed plans', async () => {
    const userId = await newUser();
    const first = await reserve({ userId });
    await expect(
      reserve({ userId, source: 'retry', retryId: first.plan_id }),
    ).rejects.toThrow('GENERATION_RETRY_NOT_ALLOWED');
    await finalize(userId, first.plan_id, 1);
    await expect(
      reserve({ userId, source: 'retry', retryId: first.plan_id }),
    ).rejects.toThrow('GENERATION_RETRY_NOT_ALLOWED');
    await getPool().query(
      "UPDATE public.training_plans SET status='cancelled',generation_status='failed' WHERE id=$1",
      [first.plan_id],
    );
    await expect(
      reserve({ userId, source: 'retry', retryId: first.plan_id }),
    ).rejects.toThrow('GENERATION_RETRY_NOT_ALLOWED');
    const legacy = await seedPlan({ generationStatus: 'failed', workouts: [] });
    await expect(
      reserve({
        userId: legacy.userId,
        source: 'retry',
        retryId: legacy.planId,
      }),
    ).rejects.toThrow('GENERATION_REQUEST_MISSING');
  });

  it('rolls back all workout writes on an invalid result, then permits a valid finalization', async () => {
    const userId = await newUser();
    const first = await reserve({ userId });
    await expect(
      finalize(userId, first.plan_id, 1, [
        workouts[0],
        { ...workouts[0], scheduled_date: 'invalid' },
      ]),
    ).rejects.toThrow();
    expect(
      (
        await getPool().query(
          'SELECT count(*)::int AS count FROM public.workouts WHERE plan_id=$1',
          [first.plan_id],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await getPool().query(
          'SELECT generation_status FROM public.training_plans WHERE id=$1',
          [first.plan_id],
        )
      ).rows[0].generation_status,
    ).toBe('generating');
    expect((await finalize(userId, first.plan_id, 1)).applied).toBe(true);
  });

  it('does not finalize a cancelled plan or write foreign supplied ownership fields', async () => {
    const userId = await newUser();
    const stranger = await newUser();
    const first = await reserve({ userId });
    await getPool().query(
      "UPDATE public.training_plans SET status='cancelled' WHERE id=$1",
      [first.plan_id],
    );
    expect((await finalize(userId, first.plan_id, 1)).applied).toBe(false);
    const second = await reserve({ userId: stranger });
    expect(
      (
        await finalize(stranger, second.plan_id, 1, [
          { ...workouts[0], user_id: userId, plan_id: first.plan_id },
        ])
      ).applied,
    ).toBe(true);
    expect(
      (await getPool().query('SELECT user_id,plan_id FROM public.workouts'))
        .rows,
    ).toEqual([{ user_id: stranger, plan_id: second.plan_id }]);
  });

  it('replaces an accidental active plan atomically and preserves its completed workouts', async () => {
    const cycle = await endedCycle();
    const { rows } = await getPool().query(
      "INSERT INTO public.training_plans(user_id,status) VALUES($1,'active') RETURNING id",
      [cycle.userId],
    );
    const accidentalId = rows[0].id;
    await getPool().query(
      "INSERT INTO public.workouts(user_id,plan_id,status) VALUES($1,$2,'completed')",
      [cycle.userId, accidentalId],
    );
    const next = await reserve({
      userId: cycle.userId,
      source: 'retrospective_customize',
      retroId: cycle.retroId,
    });
    expect(await activeIds(cycle.userId)).toEqual([next.plan_id]);
    expect(
      (
        await getPool().query(
          'SELECT status FROM public.training_plans WHERE id=$1',
          [accidentalId],
        )
      ).rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await getPool().query(
          'SELECT status FROM public.workouts WHERE plan_id=$1',
          [accidentalId],
        )
      ).rows,
    ).toEqual([{ status: 'completed' }]);
    expect(await retroStatus(cycle.retroId)).toBe('archived');
  });

  it('rejects a stale retrospective when a newer cycle already ended', async () => {
    const cycle = await endedCycle();
    await getPool().query(
      "INSERT INTO public.training_plans(user_id,status,created_at) VALUES($1,'completed',now())",
      [cycle.userId],
    );
    await expect(
      reserve({
        userId: cycle.userId,
        source: 'retrospective_accept',
        retroId: cycle.retroId,
      }),
    ).rejects.toThrow('GENERATION_STALE_RETROSPECTIVE');
    expect(await retroStatus(cycle.retroId)).toBe('completed');
    expect(await activeIds(cycle.userId)).toEqual([]);
  });

  it('rejects retry when workouts exist, preserving the prior result', async () => {
    const userId = await newUser();
    const first = await reserve({ userId });
    await markFailed(first.plan_id);
    await getPool().query(
      "INSERT INTO public.workouts(user_id,plan_id,status) VALUES($1,$2,'completed')",
      [userId, first.plan_id],
    );
    await expect(
      reserve({ userId, source: 'retry', retryId: first.plan_id }),
    ).rejects.toThrow('GENERATION_RETRY_NOT_ALLOWED');
    expect(
      (
        await getPool().query(
          'SELECT generation_attempt FROM public.training_plans WHERE id=$1',
          [first.plan_id],
        )
      ).rows[0].generation_attempt,
    ).toBe(1);
    expect(
      (
        await getPool().query(
          'SELECT status FROM public.workouts WHERE plan_id=$1',
          [first.plan_id],
        )
      ).rows,
    ).toEqual([{ status: 'completed' }]);
  });

  it('makes an old worker wait for replacement and reject its cancelled reservation', async () => {
    const cycle = await endedCycle();
    const { rows } = await getPool().query(
      "INSERT INTO public.training_plans(user_id,status,generation_status,generation_attempt) VALUES($1,'active','generating',1) RETURNING id",
      [cycle.userId],
    );
    const oldId = rows[0].id;
    const a = await newClient();
    const b = await newClient();
    let pending: Promise<any> | undefined;
    try {
      await a.query('BEGIN');
      await a.query('SET LOCAL ROLE service_role');
      await b.query("SET lock_timeout = '5s'");
      await b.query('SET ROLE service_role');
      const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const next = await reserveOn(a, {
        userId: cycle.userId,
        source: 'retrospective_accept',
        retroId: cycle.retroId,
      });
      pending = b.query(
        'SELECT public.finalize_training_plan($1,$2,1,$3,$4) AS result',
        [cycle.userId, oldId, '{}', JSON.stringify(workouts)],
      );
      void pending.catch(() => undefined);
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (
          await getPool().query(
            'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
            [pid],
          )
        ).rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await a.query('COMMIT');
      expect((await pending).rows[0].result.applied).toBe(false);
      expect(await activeIds(cycle.userId)).toEqual([next.plan_id]);
      expect(
        (
          await getPool().query(
            'SELECT count(*)::int AS count FROM public.workouts WHERE plan_id=$1',
            [oldId],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await a.query('ROLLBACK');
      if (pending) await pending.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('restricts sensitive parameters and generation RPCs to service_role', async () => {
    const userId = await newUser();
    const reserved = await reserve({ userId });
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        asRole(role, (c) => reserveOn(c, { userId })),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asRole(role, (c) =>
          c.query('SELECT public.finalize_training_plan($1,$2,1,$3,$4)', [
            userId,
            reserved.plan_id,
            '{}',
            '[]',
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asRole(role, (c) =>
          c.query(
            'SELECT request FROM public.training_plan_generation_requests',
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      const { rows } = await getPool().query(
        "SELECT has_function_privilege($1,$2,'EXECUTE') AS reserve,has_function_privilege($1,$3,'EXECUTE') AS finalize",
        [role, reserveSignature, finalizeSignature],
      );
      expect(rows[0]).toEqual({ reserve: false, finalize: false });
    }
    const security = (
      await getPool().query(
        `SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public.training_plan_generation_requests'::regclass`,
      )
    ).rows[0];
    expect(security.rls).toBe(true);
    const functions = (
      await getPool().query(
        `SELECT prosecdef FROM pg_proc WHERE oid IN ($1::regprocedure,$2::regprocedure)`,
        [reserveSignature, finalizeSignature],
      )
    ).rows;
    expect(functions).toEqual([{ prosecdef: false }, { prosecdef: false }]);
    expect(
      (
        await asRole('service_role', (c) =>
          c.query(
            'SELECT request FROM public.training_plan_generation_requests',
          ),
        )
      ).rows[0].request,
    ).toEqual(request);
  });
});
