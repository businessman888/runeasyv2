import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WeeklyInsightService } from './weekly-insight.service';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService } from '../../common/ai';

/**
 * Fase 2A — gatilho, dedupe, falha e notificação do insight semanal.
 *
 * O mock aqui é mais esperto que o de `weekly-insight.metrics.spec.ts`: além de
 * rotear por tabela, ele PERSISTE os inserts em memória, porque estes testes
 * são sobre o ciclo de vida da linha (placeholder → completed/failed) e sobre
 * quais semanas são puladas.
 */

interface Row {
  [key: string]: unknown;
}

/**
 * Mock de Supabase com estado. `insert` grava, `update` altera a linha casada,
 * e `select` devolve as linhas filtradas pelos `.eq()` acumulados.
 */
function buildStatefulMock(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let autoId = 0;

  const from = jest.fn((table: string) => {
    if (!tables[table]) tables[table] = [];
    const filters: Array<[string, unknown]> = [];
    let pending: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};

    const matches = (row: Row) =>
      filters.every(([col, val]) => row[col] === val);

    const apply = (): Row[] => {
      if (pending === 'insert') {
        const created = {
          id: `row-${++autoId}`,
          created_at: 'now',
          ...payload,
        };
        tables[table].push(created);
        return [created];
      }
      if (pending === 'update') {
        const hit = tables[table].filter(matches);
        for (const row of hit) Object.assign(row, payload);
        return hit;
      }
      return tables[table].filter(matches);
    };

    const chain: Record<string, unknown> = {};
    const passthrough = [
      'gte',
      'lte',
      'gt',
      'lt',
      'in',
      'is',
      'not',
      'or',
      'order',
      'limit',
    ];
    for (const m of passthrough) chain[m] = jest.fn(() => chain);

    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    });
    chain.insert = jest.fn((data: Row) => {
      pending = 'insert';
      payload = data;
      return chain;
    });
    chain.update = jest.fn((data: Row) => {
      pending = 'update';
      payload = data;
      return chain;
    });
    chain.single = jest.fn(() => {
      const rows = apply();
      return Promise.resolve({
        data: rows[0] ?? null,
        error: rows[0] ? null : { message: 'no rows' },
      });
    });
    chain.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: apply()[0] ?? null, error: null }),
    );
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: apply(), error: null }).then(onF, onR);

    return chain;
  });

  return {
    mock: {
      getClient: jest.fn(() => ({ from })),
    } as unknown as SupabaseService,
    tables,
    from,
  };
}

/** Um treino de plano, concluído com a distância cheia. */
const doneWorkout = (weekNumber: number, date: string, id: string): Row => ({
  id,
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: weekNumber,
  scheduled_date: date,
  status: 'completed',
  distance_km: 5,
  distance_run: 5,
  time_run_seconds: 1650,
  pace_seconds_per_km: 330,
  instructions_json: [{ type: 'main', distance_km: 5, pace_min: 330 }],
  metadata: { zone: 'Z1' },
});

/**
 * Plano de 3 semanas, todas no passado. As semanas 1 e 2 são elegíveis; a 3 é a
 * última e fica suprimida.
 */
const THREE_WEEK_PLAN: Row[] = [
  doneWorkout(1, '2026-06-01', 'w1a'),
  doneWorkout(1, '2026-06-03', 'w1b'),
  doneWorkout(2, '2026-06-08', 'w2a'),
  doneWorkout(2, '2026-06-10', 'w2b'),
  doneWorkout(3, '2026-06-15', 'w3a'),
  doneWorkout(3, '2026-06-17', 'w3b'),
];

describe('WeeklyInsightService — gatilho e ciclo de vida', () => {
  let service: WeeklyInsightService;
  let tables: Record<string, Row[]>;
  let notificationService: {
    createNotification: jest.Mock;
    sendPushNotification: jest.Mock;
  };
  let aiRouter: { isAvailable: boolean; call: jest.Mock };

  const build = async (
    seed: Record<string, Row[]>,
    opts: { startDate?: string } = {},
  ) => {
    const built = buildStatefulMock(seed);
    tables = built.tables;
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };
    aiRouter = { isAvailable: false, call: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightService,
        { provide: SupabaseService, useValue: built.mock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'WEEKLY_INSIGHT_START_DATE'
                ? (opts.startDate ?? '2026-01-01')
                : undefined,
            ),
          },
        },
        { provide: NotificationService, useValue: notificationService },
        { provide: AIRouterService, useValue: aiRouter },
      ],
    }).compile();

    service = module.get(WeeklyInsightService);
  };

  /** "Hoje" fixo bem depois do plano, para todas as semanas estarem fechadas. */
  const freezeToday = (dateStr = '2026-07-01') => {
    jest
      .spyOn(
        service as unknown as { saoPauloTodayStr: () => string },
        'saoPauloTodayStr',
      )
      .mockReturnValue(dateStr);
  };

  const seedPlan = (over: Record<string, Row[]> = {}) => ({
    training_plans: [
      {
        id: 'plan-1',
        user_id: 'user-1',
        frequency_per_week: 2,
        status: 'active',
      },
    ],
    users: [{ id: 'user-1', subscription_plan: 'pro' }],
    workouts: THREE_WEEK_PLAN,
    plan_week_insights: [],
    activities: [],
    ...over,
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('quais semanas entram', () => {
    it('gera para as semanas fechadas e SUPRIME a última do plano', async () => {
      await build(seedPlan());
      freezeToday();

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated.map((g) => g.weekNumber).sort()).toEqual([1, 2]);
      // A semana 3 é a última — a retrospectiva de fim de ciclo cobre.
      expect(generated.some((g) => g.weekNumber === 3)).toBe(false);
    });

    it('NÃO gera para semana que ainda não fechou', async () => {
      await build(seedPlan());
      // Dia do último treino da semana 2: ela ainda está correndo (endStr é
      // inclusivo).
      freezeToday('2026-06-10');

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated.map((g) => g.weekNumber)).toEqual([1]);
    });

    it('SEM BACKFILL — pula semana que fechou antes do cutoff', async () => {
      await build(seedPlan(), { startDate: '2026-06-09' });
      freezeToday();

      const generated = await service.checkForClosedPlanWeeks();

      // Semana 1 termina em 06-03, antes do cutoff. Só a 2 entra.
      expect(generated.map((g) => g.weekNumber)).toEqual([2]);
    });

    it('dedupe: pula semana que já tem linha', async () => {
      await build(
        seedPlan({
          plan_week_insights: [
            {
              id: 'existing',
              plan_id: 'plan-1',
              week_number: 1,
              status: 'completed',
            },
          ],
        }),
      );
      freezeToday();

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated.map((g) => g.weekNumber)).toEqual([2]);
    });

    it('é idempotente — a segunda varredura não gera nada', async () => {
      await build(seedPlan());
      freezeToday();

      const first = await service.checkForClosedPlanWeeks();
      const second = await service.checkForClosedPlanWeeks();

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(0);
      expect(tables.plan_week_insights).toHaveLength(2);
    });

    it('Pro-only: plano de usuário free é ignorado', async () => {
      await build(
        seedPlan({ users: [{ id: 'user-1', subscription_plan: 'free' }] }),
      );
      freezeToday();

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated).toHaveLength(0);
      expect(tables.plan_week_insights).toHaveLength(0);
    });

    it('ignora semana sem treino (source=fallback) — não há o que medir', async () => {
      // Só a semana 1 tem treino. `derivePlanWeeks` sem fallback não inventa
      // as outras, e uma semana única também é a última → suprimida.
      await build(
        seedPlan({
          workouts: [
            doneWorkout(1, '2026-06-01', 'w1a'),
            doneWorkout(1, '2026-06-03', 'w1b'),
          ],
        }),
      );
      freezeToday();

      const generated = await service.checkForClosedPlanWeeks();
      expect(generated).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('persistência', () => {
    it('grava a semana completa com status completed', async () => {
      await build(seedPlan());
      freezeToday();

      await service.checkForClosedPlanWeeks();
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);

      expect(week2.status).toBe('completed');
      expect(week2.week_start).toBe('2026-06-08');
      expect(week2.week_end).toBe('2026-06-10');
      expect(week2.completed_workouts).toBe(2);
      expect(week2.planned_workouts).toBe(2);
      expect(week2.completion_rate).toBe(100);
      expect(week2.processed_at).toBeTruthy();
      expect(week2.ai_narrative).toEqual(expect.any(String));
      expect(week2.suggested_adjustment).toMatchObject({ code: 'manter' });
    });

    it('na falha marca status=failed e NÃO apaga a linha', async () => {
      await build(seedPlan());
      freezeToday();
      jest
        .spyOn(service, 'buildPlanWeekMetrics')
        .mockRejectedValue(new Error('boom'));

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated).toHaveLength(0);
      // As duas semanas elegíveis deixaram linha 'failed' — retry-able, e a
      // UNIQUE já garante que não vira duplicata.
      expect(tables.plan_week_insights).toHaveLength(2);
      for (const row of tables.plan_week_insights) {
        expect(row.status).toBe('failed');
        expect(row.processed_at).toBeTruthy();
      }
    });

    it('um plano quebrado não derruba a varredura dos outros', async () => {
      await build({
        training_plans: [
          {
            id: 'plan-1',
            user_id: 'user-1',
            frequency_per_week: 2,
            status: 'active',
          },
        ],
        users: [{ id: 'user-1', subscription_plan: 'pro' }],
        workouts: THREE_WEEK_PLAN,
        plan_week_insights: [],
        activities: [],
      });
      freezeToday();
      jest
        .spyOn(
          service as unknown as { processPlan: () => Promise<unknown> },
          'processPlan',
        )
        .mockRejectedValue(new Error('db down'));

      await expect(service.checkForClosedPlanWeeks()).resolves.toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('notificação', () => {
    it('envia EXATAMENTE 1 notificação por semana gerada', async () => {
      await build(seedPlan());
      freezeToday();

      await service.checkForClosedPlanWeeks();

      expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
      expect(notificationService.sendPushNotification).toHaveBeenCalledTimes(2);

      const [userId, type, , , metadata] =
        notificationService.createNotification.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(type).toBe('weekly_insight');
      expect(metadata).toMatchObject({ planId: 'plan-1', weekNumber: 1 });
      expect(metadata.weeklyInsightId).toEqual(expect.any(String));
    });

    it('falha de notificação não derruba a geração', async () => {
      await build(seedPlan());
      freezeToday();
      notificationService.createNotification.mockRejectedValue(
        new Error('push down'),
      );

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated).toHaveLength(2);
      expect(
        tables.plan_week_insights.every((r) => r.status === 'completed'),
      ).toBe(true);
    });

    describe('semana zerada', () => {
      /** Plano de 3 semanas em que ninguém treinou nada. */
      const emptyPlan = (): Row[] =>
        THREE_WEEK_PLAN.map((w) => ({
          ...w,
          status: 'pending',
          distance_run: null,
          time_run_seconds: null,
          pace_seconds_per_km: null,
        }));

      it('notifica na PRIMEIRA semana zerada', async () => {
        await build(seedPlan({ workouts: emptyPlan() }));
        freezeToday();

        await service.checkForClosedPlanWeeks();

        const week1 = tables.plan_week_insights.find(
          (r) => r.week_number === 1,
        );
        expect(week1.completed_workouts).toBe(0);
        expect(week1.notified_at).toBeTruthy();
      });

      it('SUPRIME o push na segunda zerada consecutiva', async () => {
        await build(seedPlan({ workouts: emptyPlan() }));
        freezeToday();

        await service.checkForClosedPlanWeeks();

        const week2 = tables.plan_week_insights.find(
          (r) => r.week_number === 2,
        );
        expect(week2.status).toBe('completed');
        expect(week2.notified_at).toBeNull();

        // Uma notificação no total (a da semana 1), não duas.
        expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
      });

      it('semana com treino notifica mesmo depois de uma zerada', async () => {
        // Semana 1 vazia, semana 2 com treino: o push volta.
        const mixed = THREE_WEEK_PLAN.map((w) =>
          w.week_number === 1
            ? { ...w, status: 'pending', distance_run: null }
            : w,
        );
        await build(seedPlan({ workouts: mixed }));
        freezeToday();

        await service.checkForClosedPlanWeeks();

        const week2 = tables.plan_week_insights.find(
          (r) => r.week_number === 2,
        );
        expect(week2.notified_at).toBeTruthy();
        expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('gatilho manual', () => {
    it('gera a ÚLTIMA semana elegível', async () => {
      await build(seedPlan());
      freezeToday();

      const result = await service.generateLatestClosedWeek('user-1');

      expect(result).toMatchObject({ generated: true, weekNumber: 2 });
      expect(tables.plan_week_insights).toHaveLength(1);
    });

    it('respeita a supressão da última semana e o cutoff', async () => {
      await build(seedPlan(), { startDate: '2026-06-11' });
      freezeToday();

      const result = await service.generateLatestClosedWeek('user-1');

      // Semana 3 suprimida; 1 e 2 fecharam antes do cutoff.
      expect(result).toMatchObject({
        generated: false,
        reason: 'no_eligible_week',
      });
    });

    it('informa quando não há plano ativo', async () => {
      await build(seedPlan({ training_plans: [] }));
      freezeToday();

      const result = await service.generateLatestClosedWeek('user-1');
      expect(result).toMatchObject({
        generated: false,
        reason: 'no_active_plan',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('narrativa', () => {
    it('cai para o texto determinístico sem IA disponível, citando os números', async () => {
      await build(seedPlan());
      freezeToday();

      await service.checkForClosedPlanWeeks();
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);

      expect(week2.ai_narrative).toContain('2 de 2');
      expect(aiRouter.call).not.toHaveBeenCalled();
    });

    it('usa a narrativa da IA quando disponível', async () => {
      await build(seedPlan());
      freezeToday();
      aiRouter.isAvailable = true;
      aiRouter.call.mockResolvedValue({
        data: { narrative: 'Semana firme, 10 km no plano.' },
      });

      await service.checkForClosedPlanWeeks();
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);

      expect(week2.ai_narrative).toBe('Semana firme, 10 km no plano.');
    });

    it('IA que falha não derruba a geração — cai no fallback', async () => {
      await build(seedPlan());
      freezeToday();
      aiRouter.isAvailable = true;
      aiRouter.call.mockRejectedValue(new Error('haiku down'));

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated).toHaveLength(2);
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);
      expect(week2.status).toBe('completed');
      expect(week2.ai_narrative).toEqual(expect.any(String));
    });
  });
});
