import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RetrospectiveService } from './retrospective.service';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { TrainingService } from './training.service';
import { AIRouterService } from '../../common/ai';
import { PaceCalculatorService } from '../../common/pace-calculator';
import { PaceGoalService } from './pace-goal.service';

/**
 * Fase 1A — retrospectiva de fim de plano.
 *
 * A retrospectiva NUNCA rodou em produção (0 linhas em `plan_retrospectives`) e
 * tinha 0% de cobertura. Estes testes travam os defeitos que a fase corrigiu,
 * com foco no que produzia NÚMERO ERRADO em silêncio.
 *
 * ⚠️ `RetrospectiveService` usa `supabaseService.getClient().from(...)`, não
 * `supabaseService.from(...)` como os outros services — por isso o mock é
 * diferente do de `stats.service.spec.ts`. E como `calculateMetrics` consulta
 * 4 tabelas na mesma execução, o mock roteia por NOME DE TABELA; um chain stub
 * único não distinguiria as queries.
 */

type TableData = Record<string, unknown[]>;

/**
 * Builder encadeável que resolve o payload da tabela em qualquer profundidade.
 * Todo método de filtro devolve `this`; `.then` torna o objeto aguardável, e
 * `.single`/`.maybeSingle` resolvem a primeira linha.
 */
function makeChain(rows: unknown[]) {
  const result = { data: rows, error: null };
  const first = { data: rows[0] ?? null, error: null };
  const chain: Record<string, unknown> = {};
  const passthrough = [
    'select',
    'eq',
    'neq',
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
    'insert',
    'update',
    'delete',
    'upsert',
  ];
  for (const m of passthrough) chain[m] = jest.fn(() => chain);
  chain.single = jest.fn(() => Promise.resolve(first));
  chain.maybeSingle = jest.fn(() => Promise.resolve(first));
  chain.then = (
    onF: (v: typeof result) => unknown,
    onR?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onF, onR);
  return chain;
}

function buildSupabaseMock(tables: TableData) {
  const from = jest.fn((table: string) => makeChain(tables[table] ?? []));
  return {
    mock: {
      getClient: jest.fn(() => ({ from })),
    } as unknown as SupabaseService,
    from,
  };
}

/** Workout do plano. `distance_run` só existe quando concluído. */
const planWorkout = (over: Partial<Record<string, unknown>> = {}) => ({
  plan_id: 'plan-1',
  scheduled_date: '2026-06-01',
  status: 'pending',
  distance_km: 5,
  distance_run: null,
  time_run_seconds: null,
  instructions_json: [{ type: 'main', pace_min: 330, pace_max: 350 }],
  ...over,
});

describe('RetrospectiveService', () => {
  let service: RetrospectiveService;
  let notificationService: {
    createNotification: jest.Mock;
    sendPushNotification: jest.Mock;
  };
  let trainingService: { createQuickPlan: jest.Mock };

  const build = async (tables: TableData) => {
    const { mock, from } = buildSupabaseMock(tables);
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };
    trainingService = {
      createQuickPlan: jest
        .fn()
        .mockResolvedValue({
          plan_id: 'plan-2',
          planHeader: {},
          planHeadline: '',
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrospectiveService,
        { provide: SupabaseService, useValue: mock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NotificationService, useValue: notificationService },
        { provide: TrainingService, useValue: trainingService },
        // isAvailable:false força getFallbackInsights — determinístico, sem rede.
        {
          provide: AIRouterService,
          useValue: { isAvailable: false, call: jest.fn() },
        },
        PaceCalculatorService,
        PaceGoalService,
      ],
    }).compile();

    service = module.get(RetrospectiveService);
    return { from };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // D1 — escopo por plano. A aderência não pode inflar com corrida livre.
  // ─────────────────────────────────────────────────────────────────────────
  describe('calculateMetrics — escopo por plano', () => {
    /** 12 planejados (60 km), 6 concluídos (30 km reais). */
    const twelvePlannedSixDone = () => {
      const workouts = [];
      for (let i = 0; i < 12; i++) {
        const done = i < 6;
        workouts.push(
          planWorkout({
            scheduled_date: `2026-06-${String(i * 2 + 1).padStart(2, '0')}`,
            status: done ? 'completed' : 'pending',
            distance_km: 5,
            distance_run: done ? 5 : null,
            time_run_seconds: done ? 1650 : null, // 5:30/km
          }),
        );
      }
      return workouts;
    };

    it('NÃO infla a aderência com corrida livre', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: twelvePlannedSixDone(),
        // 70 km no período: 30 do plano + 40 de corrida livre.
        activities: [
          { start_date: '2026-06-05T10:00:00Z', distance: 30000 },
          { start_date: '2026-06-12T10:00:00Z', distance: 40000 },
        ],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');

      // O número que o defeito produzia era 70/60 = 117%.
      expect(m.distanceVsGoalPercent).toBe(50);
      expect(m.planDistanceCompletedKm).toBe(30);
      expect(m.totalDistancePlannedKm).toBe(60);
      // O total continua existindo — separado, não somado à aderência.
      expect(m.totalDistanceKm).toBe(70);
      expect(m.freeRunDistanceKm).toBe(40);
      expect(m.totalRunsInPeriod).toBe(2);
    });

    it('a aderência NUNCA lê activities — zero activities, mesma aderência', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: twelvePlannedSixDone(),
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');

      expect(m.distanceVsGoalPercent).toBe(50);
      expect(m.planDistanceCompletedKm).toBe(30);
      expect(m.totalDistanceKm).toBe(0);
      expect(m.freeRunDistanceKm).toBe(0); // piso em 0, nunca negativo
    });

    it('usa distance_km como fallback quando distance_run é null (linha legada)', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: [
          planWorkout({
            status: 'completed',
            distance_km: 5,
            distance_run: null,
          }),
        ],
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');
      expect(m.planDistanceCompletedKm).toBe(5);
    });

    it('o recorde do ciclo conta a CORRIDA LIVRE quando ela é a maior', async () => {
      // Escopo do recorde é deliberadamente diferente do da aderência: os
      // treinos do plano vão até 5 km, a corrida livre fez 15 km. O clímax dos
      // stories tem que mostrar 15 — esconder seria mentir por tecnicismo.
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: twelvePlannedSixDone(),
        activities: [
          { start_date: '2026-06-05T10:00:00Z', distance: 5000 },
          { start_date: '2026-06-20T18:00:00Z', distance: 15000 }, // livre
        ],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');

      expect(m.longestRunKm).toBe(15);
      expect(m.longestRunDate).toBe('2026-06-20');
      // A aderência continua plano-only — os dois escopos coexistem.
      expect(m.planDistanceCompletedKm).toBe(30);
    });

    it('sem corridas no período, o recorde é 0/null (card de clímax some)', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: twelvePlannedSixDone(),
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');
      expect(m.longestRunKm).toBe(0);
      expect(m.longestRunDate).toBeNull();
    });

    it('deriva o pace dos treinos do plano, não das activities', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 3,
          },
        ],
        workouts: [
          planWorkout({
            status: 'completed',
            distance_km: 5,
            distance_run: 5,
            time_run_seconds: 1650, // 330 s/km
          }),
        ],
        // Corrida livre absurdamente rápida — não pode contaminar o pace do plano.
        activities: [{ start_date: '2026-06-05T10:00:00Z', distance: 10000 }],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');
      expect(m.avgPaceSeconds).toBe(330);
      expect(m.targetPaceSeconds).toBe(330); // do instructions_json
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D3 — frequência é métrica própria, não cópia de completionRate.
  // ─────────────────────────────────────────────────────────────────────────
  describe('frequencyVsGoalPercent', () => {
    /** 12 planejados em 4 semanas, 9 concluídos, alvo 4 treinos/semana. */
    const fourWeekPlan = (lastDate: string) => {
      const workouts = [];
      for (let i = 0; i < 12; i++) {
        const done = i < 9;
        workouts.push(
          planWorkout({
            scheduled_date:
              i === 11 ? lastDate : `2026-06-${String(i + 1).padStart(2, '0')}`,
            status: done ? 'completed' : 'pending',
            distance_run: done ? 5 : null,
            time_run_seconds: done ? 1650 : null,
          }),
        );
      }
      return workouts;
    };

    it('É DIFERENTE de completionRate', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 4,
          },
        ],
        workouts: fourWeekPlan('2026-06-28'), // janela de 4 semanas
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');

      expect(m.completionRate).toBe(75); // 9/12 por sessão
      expect(m.frequencyActualPerWeek).toBe(2.25); // 9 ÷ 4 semanas
      expect(m.frequencyTargetPerWeek).toBe(4);
      expect(m.frequencyVsGoalPercent).toBe(56); // 2.25/4
      // O defeito era `frequencyVsGoalPercent = completionRate`.
      expect(m.frequencyVsGoalPercent).not.toBe(m.completionRate);
    });

    it('cai pela metade quando a re-âncora estica a janela, com completionRate intacto', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: 4,
          },
        ],
        // Mesmas 9 concluídas, mas o último treino foi empurrado para 8 semanas.
        workouts: fourWeekPlan('2026-07-26'),
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');

      expect(m.completionRate).toBe(75); // inalterado
      expect(m.frequencyActualPerWeek).toBeLessThan(2.25); // a cadência caiu
      expect(m.frequencyVsGoalPercent).toBeLessThan(56);
    });

    it('deriva o alvo do plano quando frequency_per_week é nulo, sem NaN', async () => {
      await build({
        training_plans: [
          {
            created_at: '2026-06-01T12:00:00Z',
            duration_weeks: 4,
            frequency_per_week: null,
          },
        ],
        workouts: fourWeekPlan('2026-06-28'),
        activities: [],
        readiness_history: [],
      });

      const m = await (service as any).calculateMetrics('user-1', 'plan-1');
      expect(Number.isFinite(m.frequencyVsGoalPercent)).toBe(true);
      expect(m.frequencyTargetPerWeek).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D2 — disparo único de notificação.
  // ─────────────────────────────────────────────────────────────────────────
  describe('generateRetrospective — notificação', () => {
    const happyTables = (): TableData => ({
      plan_retrospectives: [
        { id: 'retro-1', user_id: 'user-1', plan_id: 'plan-1' },
      ],
      training_plans: [
        {
          created_at: '2026-06-01T12:00:00Z',
          duration_weeks: 4,
          frequency_per_week: 3,
        },
      ],
      workouts: [
        planWorkout({
          status: 'completed',
          distance_run: 5,
          time_run_seconds: 1650,
        }),
      ],
      activities: [],
      readiness_history: [],
      user_onboarding: [{ goal: '5k', level: 'beginner' }],
    });

    it('envia EXATAMENTE uma notificação e um push', async () => {
      await build(happyTables());
      await service.generateRetrospective('user-1', 'plan-1');

      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
      expect(notificationService.sendPushNotification).toHaveBeenCalledTimes(1);
    });

    it('grava metadata.retrospectiveId — a chave usada pela limpeza', async () => {
      await build(happyTables());
      await service.generateRetrospective('user-1', 'plan-1');

      const [, type, , , metadata] =
        notificationService.createNotification.mock.calls[0];
      expect(type).toBe('recovery_analysis');
      expect(metadata).toMatchObject({ retrospectiveId: 'retro-1' });
    });

    it('não notifica quando a geração falha, e limpa o placeholder órfão', async () => {
      const { from } = await build(happyTables());
      jest
        .spyOn(service as any, 'calculateMetrics')
        .mockRejectedValue(new Error('boom'));

      const result = await service.generateRetrospective('user-1', 'plan-1');

      expect(result).toBeNull();
      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(notificationService.sendPushNotification).not.toHaveBeenCalled();
      // A linha 'processing' precisa sumir — senão a checagem de existência
      // (que ignora `status`) bloqueia o plano para sempre.
      const deleteChain = from.mock.results
        .map((r) => r.value as Record<string, jest.Mock>)
        .find((c) => c.delete.mock.calls.length > 0);
      expect(deleteChain).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D5 — onboarding real em vez de hardcode.
  // ─────────────────────────────────────────────────────────────────────────
  describe('acceptSuggestion — dados do onboarding', () => {
    const onboardingTables = (): TableData => ({
      plan_retrospectives: [
        {
          id: 'retro-1',
          user_id: 'user-1',
          plan_id: 'plan-1',
          suggested_next_goal_type: '10k',
          avg_pace_seconds: 330,
        },
      ],
      training_plans: [
        {
          id: 'plan-1',
          goal: '5k',
          duration_weeks: 12,
          frequency_per_week: 5,
          goal_type: 'distance',
          vdot_current: 40,
        },
      ],
      user_onboarding: [
        {
          level: 'beginner',
          days_per_week: 5,
          target_weeks: 12,
          has_limitations: true,
          limitations: 'joelho',
          preferred_days: [2, 4],
          available_days: [1, 3, 5, 6, 0],
          current_pace_5k: 6.5,
          calculated_pace: 6.2,
          recent_distance: 5,
          recent_frequency: '2x',
          current_weekly_km: '10_20',
        },
      ],
      notifications: [],
    });

    it('usa level/semanas/dias reais — não os hardcodes', async () => {
      await build(onboardingTables());
      await service.acceptSuggestion('user-1', 'retro-1');

      const [, req] = trainingService.createQuickPlan.mock.calls[0];

      expect(req.level).toBe('beginner');
      expect(req.targetWeeks).toBe(12);
      expect(req.daysPerWeek).toBe(5);
      expect(req.limitations).toBe('joelho');
      // available_days vence preferred_days (o mobile nunca popula o legado).
      expect(req.preferredDays).toEqual([1, 3, 5, 6, 0]);

      // Asserts NEGATIVOS: os valores que o defeito produzia sempre.
      expect(req.level).not.toBe('intermediate');
      expect(req.targetWeeks).not.toBe(8);
      expect(req.preferredDays).not.toEqual([]);
    });

    it('repassa os sinais de capacidade da Fase A/B', async () => {
      await build(onboardingTables());
      await service.acceptSuggestion('user-1', 'retro-1');

      const [, req] = trainingService.createQuickPlan.mock.calls[0];
      expect(req.calculatedPace).toBe(6.2);
      expect(req.recentDistanceKm).toBe(5);
      expect(req.recentFrequency).toBe('2x');
      expect(req.currentWeeklyKm).toBe('10_20');
    });

    it('cai para preferred_days quando available_days está vazio', async () => {
      const tables = onboardingTables();
      (tables.user_onboarding[0] as Record<string, unknown>).available_days =
        [];
      await build(tables);
      await service.acceptSuggestion('user-1', 'retro-1');

      const [, req] = trainingService.createQuickPlan.mock.calls[0];
      expect(req.preferredDays).toEqual([2, 4]);
    });

    it('não arrasta limitação obsoleta quando has_limitations é false', async () => {
      const tables = onboardingTables();
      (tables.user_onboarding[0] as Record<string, unknown>).has_limitations =
        false;
      await build(tables);
      await service.acceptSuggestion('user-1', 'retro-1');

      const [, req] = trainingService.createQuickPlan.mock.calls[0];
      expect(req.limitations).toBeNull();
    });

    it('pace_improvement vira meta de tempo rotulada, sem cair em distância muda', async () => {
      const tables = onboardingTables();
      (
        tables.plan_retrospectives[0] as Record<string, unknown>
      ).suggested_next_goal_type = 'pace_improvement';
      await build(tables);

      await service.acceptSuggestion('user-1', 'retro-1');

      const [, req] = trainingService.createQuickPlan.mock.calls[0];
      expect(req.goal).toBe('5k');
      expect(req.goalMode).toBe('time');
      expect(req.targetTime).toMatch(/^\d{2}:\d{2}$/);
      expect(req.targetPace).toMatch(/^\d+:\d{2}$/);
      expect(req.targetVDOT).toBeCloseTo(41, 0);
      expect(req.currentVDOT).toBe(40);
      expect(req.goalLabel).toMatch(/^5 Km em \d{2}:\d{2}$/);
      expect(req.goalLabel).not.toBe('pace_improvement');
    });

    /**
     * Guarda do 42703: o select antigo pedia `level`, `days_per_week` e
     * `target_pace`, que não existem em `training_plans`. O PostgREST devolvia
     * erro, o código não checava, e `oldPlan` vinha null em 100% das execuções.
     * Assertar a STRING do select pega a regressão sem depender do PostgREST.
     */
    it('não pede colunas inexistentes de training_plans', async () => {
      const { from } = await build(onboardingTables());
      await service.acceptSuggestion('user-1', 'retro-1');

      const selects = from.mock.results
        .map((r) => r.value as Record<string, jest.Mock>)
        .flatMap((c) => c.select.mock.calls.map((args) => String(args[0])));
      const planSelect = selects.find((s) => s.includes('frequency_per_week'));

      expect(planSelect).toBeDefined();
      expect(planSelect).not.toContain('level');
      expect(planSelect).not.toContain('days_per_week');
      expect(planSelect).not.toContain('target_pace');
    });
  });
});
