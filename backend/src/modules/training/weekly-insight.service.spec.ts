import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WeeklyInsightService } from './weekly-insight.service';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService } from '../../common/ai';
import { VdotService } from './vdot.service';
import { MesoInsightService } from './meso-insight.service';
import { TrainingService } from './training.service';

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
    // `.is()` precisa filtrar de verdade, não ser passthrough: é ele que dá a
    // idempotência de `markSeen` (`.is('seen_at', null)` deixa de casar depois
    // do primeiro carimbo). Como passthrough, o teste de idempotência passaria
    // por acidente — validando o mock, não o código.
    chain.is = jest.fn((col: string, val: unknown) => {
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
  let vdotService: {
    reestimateForPlan: jest.Mock;
    describeQualityEfforts: jest.Mock;
  };
  let mesoInsightService: { maybeGenerateForClosedWeek: jest.Mock };
  let trainingService: { reanchorRemainingWorkoutsToToday: jest.Mock };

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
    // Fase 3: por padrão "nenhuma mudança de VDOT" — o caso da imensa maioria
    // das semanas. Testes que exercitam a reestimativa sobrescrevem.
    vdotService = {
      reestimateForPlan: jest.fn().mockResolvedValue(null),
      // Sem tiro medido é o default honesto: a maioria das semanas é base pura.
      describeQualityEfforts: jest.fn().mockResolvedValue([]),
    };
    // Fase 4: por padrão "nenhum bloco fechou" — o caso de 3 em cada 4 semanas.
    // Os testes do gatilho sobrescrevem.
    mesoInsightService = {
      maybeGenerateForClosedWeek: jest.fn().mockResolvedValue(null),
    };
    trainingService = {
      reanchorRemainingWorkoutsToToday: jest
        .fn()
        .mockResolvedValue({ shifted: 0, deltaDays: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightService,
        { provide: SupabaseService, useValue: built.mock },
        { provide: TrainingService, useValue: trainingService },
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
        { provide: VdotService, useValue: vdotService },
        { provide: MesoInsightService, useValue: mesoInsightService },
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
  // Fase 2B — "visto" e aplicação do reajuste.
  // ───────────────────────────────────────────────────────────────────────────
  describe('markSeen / getLatest', () => {
    const seedInsight = (over: Row = {}): Row => ({
      id: 'wi-1',
      user_id: 'user-1',
      plan_id: 'plan-1',
      week_number: 2,
      week_start: '2026-06-08',
      week_end: '2026-06-14',
      status: 'completed',
      seen_at: null,
      adjustment_applied_at: null,
      suggested_adjustment: { code: 'manter', class: 'none' },
      ...over,
    });

    it('getLatest devolve o insight do usuário', async () => {
      await build(seedPlan({ plan_week_insights: [seedInsight()] }));
      const row = await service.getLatest('user-1');
      expect(row?.id).toBe('wi-1');
    });

    it('getLatest NÃO filtra por seen_at — semana já vista continua vindo', async () => {
      // É o que sustenta o card persistente: ele existe justamente para reler o
      // insight depois de fechado. Quem decide sobre o MODAL é o app, olhando
      // `seen_at` desta mesma linha.
      //
      // A regressão que isto trava: existia um `getUnseen` que buscava "o mais
      // recente ENTRE OS NÃO VISTOS". Com a semana 2 lida e a semana 1 (zerada)
      // nunca aberta, ele trazia a semana 1 de volta e o modal exibia 0 km como
      // se fosse novidade. Semana antiga não vista é histórico, não notificação.
      await build(
        seedPlan({
          plan_week_insights: [
            seedInsight({ seen_at: '2026-06-15T10:00:00Z' }),
          ],
        }),
      );

      const row = await service.getLatest('user-1');
      expect(row?.id).toBe('wi-1');
      expect(row?.seen_at).toBeTruthy();
    });

    it('markSeen carimba e vira idempotente', async () => {
      await build(seedPlan({ plan_week_insights: [seedInsight()] }));

      expect(await service.markSeen('user-1', 'wi-1')).toBe(true);
      expect(tables.plan_week_insights[0].seen_at).toBeTruthy();

      // Segunda chamada não acha linha com seen_at nulo → false, sem erro.
      expect(await service.markSeen('user-1', 'wi-1')).toBe(false);
    });

    it('markSeen filtra por user_id — id vazado não carimba o insight alheio', async () => {
      await build(seedPlan({ plan_week_insights: [seedInsight()] }));

      expect(await service.markSeen('outro-user', 'wi-1')).toBe(false);
      expect(tables.plan_week_insights[0].seen_at).toBeNull();
    });
  });

  describe('applyScheduleAdjustment', () => {
    const insightWith = (
      adjustment: Record<string, unknown>,
      over: Row = {},
    ): Row => ({
      id: 'wi-1',
      user_id: 'user-1',
      plan_id: 'plan-1',
      week_number: 2,
      week_start: '2026-06-08',
      status: 'completed',
      seen_at: null,
      adjustment_applied_at: null,
      suggested_adjustment: adjustment,
      ...over,
    });

    it('aplica adiar_semana e carimba adjustment_applied_at', async () => {
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith({ code: 'adiar_semana', class: 'schedule' }),
          ],
        }),
      );
      trainingService.reanchorRemainingWorkoutsToToday.mockResolvedValue({
        shifted: 9,
        deltaDays: 7,
      });

      const r = await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(r).toMatchObject({ applied: true, shifted: 9, deltaDays: 7 });
      expect(tables.plan_week_insights[0].adjustment_applied_at).toBeTruthy();
    });

    it('adiar_semana NÃO passa reclaimFromDate — a semana está zerada', async () => {
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith({ code: 'adiar_semana', class: 'schedule' }),
          ],
        }),
      );
      trainingService.reanchorRemainingWorkoutsToToday.mockResolvedValue({
        shifted: 5,
        deltaDays: 7,
      });

      await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(
        trainingService.reanchorRemainingWorkoutsToToday,
      ).toHaveBeenCalledWith('user-1', 'plan-1', undefined);
    });

    it('repetir_semana ABRE a fronteira no início da semana repetida', async () => {
      // O ponto do teste: sem `reclaimFromDate`, uma sessão perdida na TERÇA de
      // uma semana em que a QUARTA foi cumprida ficaria para trás — a fronteira
      // de progresso seria quarta, e a terça é anterior a ela.
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith(
              { code: 'repetir_semana', class: 'schedule' },
              { week_start: '2026-06-08' },
            ),
          ],
        }),
      );
      trainingService.reanchorRemainingWorkoutsToToday.mockResolvedValue({
        shifted: 7,
        deltaDays: 14,
      });

      await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(
        trainingService.reanchorRemainingWorkoutsToToday,
      ).toHaveBeenCalledWith('user-1', 'plan-1', '2026-06-08');
    });

    it('RECUSA a classe prescription — mexer no volume é Fase 6', async () => {
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith({ code: 'aliviar_ritmo', class: 'prescription' }),
          ],
        }),
      );

      const r = await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(r).toMatchObject({
        applied: false,
        reason: 'not_actionable',
        code: 'aliviar_ritmo',
      });
      expect(
        trainingService.reanchorRemainingWorkoutsToToday,
      ).not.toHaveBeenCalled();
    });

    it('recusa manter (classe none)', async () => {
      await build(
        seedPlan({
          plan_week_insights: [insightWith({ code: 'manter', class: 'none' })],
        }),
      );
      const r = await service.applyScheduleAdjustment('user-1', 'wi-1');
      expect(r.reason).toBe('not_actionable');
    });

    it('TRAVA o toque duplo — já aplicado não re-ancora de novo', async () => {
      // Sem esta trava, dois toques empurrariam o plano DUAS semanas.
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith(
              { code: 'adiar_semana', class: 'schedule' },
              { adjustment_applied_at: '2026-06-20T10:00:00Z' },
            ),
          ],
        }),
      );

      const r = await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(r).toMatchObject({ applied: false, reason: 'already_applied' });
      expect(
        trainingService.reanchorRemainingWorkoutsToToday,
      ).not.toHaveBeenCalled();
    });

    it('não carimba quando não havia o que mover', async () => {
      // O plano já retoma no futuro. Deixar sem carimbo permite tentar de novo.
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith({ code: 'adiar_semana', class: 'schedule' }),
          ],
        }),
      );
      trainingService.reanchorRemainingWorkoutsToToday.mockResolvedValue({
        shifted: 0,
        deltaDays: 0,
      });

      const r = await service.applyScheduleAdjustment('user-1', 'wi-1');

      expect(r).toMatchObject({ applied: false, reason: 'nothing_to_shift' });
      expect(tables.plan_week_insights[0].adjustment_applied_at).toBeNull();
    });

    it('insight de outro usuário não é aplicável', async () => {
      await build(
        seedPlan({
          plan_week_insights: [
            insightWith({ code: 'adiar_semana', class: 'schedule' }),
          ],
        }),
      );

      const r = await service.applyScheduleAdjustment('outro-user', 'wi-1');

      expect(r).toMatchObject({ applied: false, reason: 'not_found' });
      expect(
        trainingService.reanchorRemainingWorkoutsToToday,
      ).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * Fase 4 — a colisão entre o insight semanal e o de mesociclo.
   *
   * Na madrugada em que um bloco de 4 semanas fecha, os dois são gerados. Um
   * push só sai, e é o de maior altitude — repetir o duplo-push seria voltar ao
   * bug que a Fase 1A corrigiu na retrospectiva.
   */
  describe('convivência com o insight de mesociclo', () => {
    it('quando o meso é gerado, o semanal daquela semana cala o push', async () => {
      await build(seedPlan());
      freezeToday();
      mesoInsightService.maybeGenerateForClosedWeek.mockResolvedValue({
        id: 'meso-1',
      });

      await service.checkForClosedPlanWeeks();

      // A linha do semanal continua existindo — a tela e o card dependem dela.
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);
      expect(week2.status).toBe('completed');
      // Mas sem push: quem notificou foi o meso.
      expect(week2.notified_at).toBeNull();
      expect(notificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('meso que FALHA devolve o push ao semanal — a madrugada não fica muda', async () => {
      await build(seedPlan());
      freezeToday();
      mesoInsightService.maybeGenerateForClosedWeek.mockRejectedValue(
        new Error('meso down'),
      );

      const generated = await service.checkForClosedPlanWeeks();

      expect(generated).toHaveLength(2);
      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);
      expect(week2.notified_at).toBeTruthy();
      expect(notificationService.sendPushNotification).toHaveBeenCalled();
    });

    it('meso que não tinha bloco a fechar não interfere', async () => {
      await build(seedPlan());
      freezeToday();
      // `null` = a semana não fecha bloco (o caso de 3 em cada 4).
      mesoInsightService.maybeGenerateForClosedWeek.mockResolvedValue(null);

      await service.checkForClosedPlanWeeks();

      const week2 = tables.plan_week_insights.find((r) => r.week_number === 2);
      expect(week2.notified_at).toBeTruthy();
    });

    it('o meso é consultado ANTES do semanal ser gravado', async () => {
      // A ordem é o que garante o fallback: só dá para silenciar o semanal
      // depois de saber que o meso existe.
      await build(seedPlan());
      freezeToday();
      const ordem: string[] = [];
      mesoInsightService.maybeGenerateForClosedWeek.mockImplementation(() => {
        ordem.push('meso');
        return Promise.resolve(null);
      });
      notificationService.createNotification.mockImplementation(() => {
        ordem.push('push-semanal');
        return Promise.resolve({ id: 'n' });
      });

      await service.checkForClosedPlanWeeks();

      expect(ordem[0]).toBe('meso');
    });
  });

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

    /**
     * O prompt é a superfície onde os 3 escorregões do Haiku nasceram. Cada um
     * virou um número errado (ou uma causa inventada) entregue ao corredor, e
     * nenhum aparece nos testes do motor determinístico — só aqui.
     */
    describe('prompt', () => {
      /** Último `userMessage` enviado ao modelo. */
      const promptEnviado = (): string =>
        aiRouter.call.mock.calls.at(-1)?.[0]?.userMessage ?? '';
      const systemEnviado = (): string =>
        aiRouter.call.mock.calls.at(-1)?.[0]?.systemPrompt?.[0]?.text ?? '';

      const comIA = async () => {
        await build(seedPlan());
        freezeToday();
        aiRouter.isAvailable = true;
        aiRouter.call.mockResolvedValue({ data: { narrative: 'ok' } });
      };

      it('o ritmo de tiro vem do bloco de qualidade, não da média do treino', async () => {
        await comIA();
        vdotService.describeQualityEfforts.mockResolvedValue([
          {
            workoutId: 'w-q1',
            dateStr: '2026-06-12',
            zones: ['Z4'],
            paceSecPerKm: 292,
            prescribedPaceMin: 297,
            prescribedPaceMax: 313,
            prescribedKm: 4,
            deltaSeconds: -5,
          },
        ]);

        await service.checkForClosedPlanWeeks();
        const prompt = promptEnviado();

        // O alvo REAL da zona e o pace REAL dos tiros, lado a lado.
        expect(prompt).toContain('TIROS DA SEMANA');
        expect(prompt).toContain(
          'zona Z4: alvo 4:57–5:13/km, você fez 4:52/km',
        );
        // E a média do treino inteiro deixa de se parecer com alvo de zona.
        expect(prompt).not.toContain('zona principal Z');
        expect(prompt).toContain(
          'NUNCA escreva "os X/km da zona Y" com estes números',
        );
        expect(systemEnviado()).toContain(
          'use SÓ os números do bloco TIROS DA SEMANA',
        );
      });

      it('semana sem tiro medido diz isso em voz alta', async () => {
        await comIA();

        await service.checkForClosedPlanWeeks();

        // A ausência tem de ser explícita: calada, o modelo vai buscar um
        // substituto na média do treino inteiro — que foi o defeito original.
        expect(promptEnviado()).toContain(
          'TIROS DA SEMANA: nenhum treino de qualidade medido por GPS',
        );
      });

      it('a mudança de nível chega com a causa real e sem espaço para inventar outra', async () => {
        await comIA();
        vdotService.reestimateForPlan.mockResolvedValue({
          planId: 'plan-1',
          vdotBefore: 40,
          vdotAfter: 41,
          direction: 'up',
          reason: '3 treinos de qualidade consistentemente acima do prescrito',
          sampleSize: 3,
          avgDeltaSeconds: -22,
          workoutsRepriced: 9,
          briefingsInvalidated: 0,
          evidence: [
            {
              workoutId: 'w-q1',
              dateStr: '2026-06-12',
              zones: ['Z4'],
              paceSecPerKm: 292,
              prescribedPaceMin: 297,
              prescribedPaceMax: 313,
              prescribedKm: 4,
              deltaSeconds: -5,
            },
          ],
        });

        await service.checkForClosedPlanWeeks();
        const prompt = promptEnviado();

        expect(prompt).toContain('A CAUSA foram exatamente estes treinos');
        expect(prompt).toContain(
          '2026-06-12 (Z4): alvo 4:57–5:13/km, executado 4:52/km',
        );
        // O escorregão real: atribuir a subida aos easy corridos lentos, que
        // são justamente os dados que a regra EXCLUI do sinal.
        expect(prompt).toContain('treinos leves/easy');
        expect(prompt).toContain('NÃO entram nessa conta');
      });

      it('km do plano nunca podem ser chamados de extra', async () => {
        await comIA();

        await service.checkForClosedPlanWeeks();

        expect(promptEnviado()).toContain(
          'NUNCA o descreva como "a mais", "extra"',
        );
        expect(systemEnviado()).toContain('Km do plano nunca são extras');
      });

      it('medição dos tiros que falha não derruba o insight', async () => {
        await comIA();
        vdotService.describeQualityEfforts.mockRejectedValue(
          new Error('replay down'),
        );

        const generated = await service.checkForClosedPlanWeeks();

        expect(generated).toHaveLength(2);
        expect(promptEnviado()).toContain('TIROS DA SEMANA: nenhum treino');
      });
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
