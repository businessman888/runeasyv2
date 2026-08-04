import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { SupabaseService } from '../../database';
import { TrainingAIService } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { AiQuotaService, AIRouterService } from '../../common/ai';
import { FeedbackAIService } from '../feedback/feedback-ai.service';

describe('TrainingService', () => {
  let service: TrainingService;
  let mockSupabaseService: Partial<SupabaseService>;
  let mockTrainingAIService: Partial<TrainingAIService>;

  const mockWorkouts = [
    {
      id: 'w1',
      type: 'easy_run',
      distance_km: 5,
      scheduled_date: '2024-01-15',
    },
    {
      id: 'w2',
      type: 'long_run',
      distance_km: 12,
      scheduled_date: '2024-01-17',
    },
  ];

  const mockPlan = {
    id: 'plan-1',
    user_id: 'user-123',
    goal: '10k',
    status: 'active',
    duration_weeks: 8,
  };

  beforeEach(async () => {
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
        single: jest.fn().mockResolvedValue({ data: mockPlan, error: null }),
      }),
      getClient: jest.fn().mockReturnValue({
        rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      }),
    };

    mockTrainingAIService = {
      generateTrainingPlan: jest.fn().mockResolvedValue({
        duration_weeks: 8,
        frequency_per_week: 3,
        weeks: [
          {
            week_number: 1,
            workouts: [
              {
                type: 'easy_run',
                distance_km: 5,
                day_of_week: 1,
                segments: [],
                objective: 'Build base',
                tips: [],
              },
            ],
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: TrainingAIService, useValue: mockTrainingAIService },
        { provide: GamificationService, useValue: { awardPoints: jest.fn() } },
        // Default Pro for tests so completeWorkout doesn't degrade to the
        // free path. Override per-test with .mockResolvedValueOnce(false)
        // when explicitly testing the Free degradation flow.
        {
          provide: SubscriptionService,
          useValue: { isProUser: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: getQueueToken('feedback-queue'),
          useValue: { add: jest.fn() },
        },
        {
          provide: getQueueToken('elevation-queue'),
          useValue: { add: jest.fn() },
        },
        // AI quota: allow by default; tests don't exercise the limit path.
        {
          provide: AiQuotaService,
          useValue: {
            assertWithinLimit: jest.fn().mockResolvedValue(undefined),
            isWithinLimit: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: AIRouterService,
          useValue: {
            isAvailable: true,
            call: jest.fn(),
          },
        },
        // Injetado com forwardRef no TrainingService. Único método consumido é
        // enqueueGeneration (pós-treino); mockado para não subir fila real.
        {
          provide: FeedbackAIService,
          useValue: { enqueueGeneration: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getActivePlan', () => {
    it('should return active plan for user', async () => {
      const result = await service.getActivePlan('user-123');
      expect(result).toEqual(mockPlan);
      expect(mockSupabaseService.from).toHaveBeenCalledWith('training_plans');
    });

    it('should return null when no active plan', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      });

      const result = await service.getActivePlan('user-456');
      expect(result).toBeNull();
    });
  });

  describe('getWorkouts', () => {
    it('should return workouts for date range', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
      });

      const result = await service.getWorkouts(
        'user-123',
        '2024-01-01',
        '2024-01-31',
      );
      // Behavior: returns the workouts in range. (The service enriches each row
      // with feedback_id, so assert on identity/length rather than deep-equality
      // with the raw fixture.)
      expect(result).toHaveLength(2);
      expect(result.map((w: { id: string }) => w.id)).toEqual(['w1', 'w2']);
    });
  });

  describe('getUpcomingWorkouts', () => {
    it('should return upcoming pending workouts', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
      });

      const result = await service.getUpcomingWorkouts('user-123', 5);
      expect(result).toEqual(mockWorkouts);
    });
  });

  describe('skipWorkout', () => {
    it('should mark workout as skipped with reason', async () => {
      const skippedWorkout = {
        ...mockWorkouts[0],
        status: 'skipped',
        skip_reason: 'sick',
      };

      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: skippedWorkout, error: null }),
      });

      const result = await service.skipWorkout('user-123', 'w1', 'sick');
      expect(result.status).toBe('skipped');
      expect(result.skip_reason).toBe('sick');
    });
  });

  describe('getWorkout', () => {
    it('should return single workout with plan details', async () => {
      const workoutWithPlan = { ...mockWorkouts[0], training_plans: mockPlan };

      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: workoutWithPlan, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await service.getWorkout('user-123', 'w1');
      expect(result.training_plans).toBeDefined();
    });
  });

  describe('resolvePlanStartDate (Q2 — clamp start date to today)', () => {
    // Private, pure date math (no DB) — exercised via a typed cast.
    const resolve = (s: string | null) =>
      (
        service as unknown as {
          resolvePlanStartDate: (x: string | null) => Date;
        }
      ).resolvePlanStartDate(s);

    it('keeps a future start date untouched', () => {
      expect(resolve('2999-01-01').toISOString().slice(0, 10)).toBe('2999-01-01');
    });

    it('clamps a past start date to today (== the null/today result)', () => {
      expect(resolve('2000-01-01').getTime()).toBe(resolve(null).getTime());
    });

    it('uses today when start date is null (future > today)', () => {
      expect(resolve('2999-01-01').getTime()).toBeGreaterThan(
        resolve(null).getTime(),
      );
    });
  });

  describe('reanchorRemainingWorkoutsToToday (Q3 — resume frozen plan)', () => {
    const setup = (
      rows: Array<{ id: string; scheduled_date: string; status: string }>,
    ) => {
      const rpc = jest.fn().mockResolvedValue({ data: 99, error: null });
      const inFn = jest.fn().mockResolvedValue({ error: null });
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: rows, error: null }),
        update: jest.fn().mockReturnValue({ in: inFn }),
      });
      (mockSupabaseService.getClient as jest.Mock).mockReturnValue({ rpc });
      return { rpc, inFn };
    };

    it('reclaims lapse-missed sessions and shifts the block by whole weeks', async () => {
      const { rpc, inFn } = setup([
        { id: 'w1', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'w2', scheduled_date: '2000-01-03', status: 'pending' },
      ]);

      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );

      // Reclaimed the missed session back to pending...
      expect(inFn).toHaveBeenCalledWith('id', ['w1']);
      // ...then shifted by a whole number of weeks (preserves the weekday).
      expect(rpc).toHaveBeenCalledTimes(1);
      const args = rpc.mock.calls[0][1] as { p_plan_id: string; p_days: number };
      expect(args.p_plan_id).toBe('plan-1');
      expect(args.p_days).toBeGreaterThan(0);
      expect(args.p_days % 7).toBe(0);
      expect(result.deltaDays % 7).toBe(0);
    });

    it('is a no-op when nothing is left to run', async () => {
      const { rpc, inFn } = setup([
        { id: 'c1', scheduled_date: '2000-01-01', status: 'completed' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(inFn).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('is a no-op when the remaining plan already resumes in the future', async () => {
      const { rpc } = setup([
        { id: 'w1', scheduled_date: '2999-01-01', status: 'pending' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('does not resurrect sessions missed before the progress frontier', async () => {
      // m1 (missed) is BEFORE the last completed workout (c1) — a legit earlier
      // miss that must not be reclaimed. The only remaining session (p1) is future.
      const { rpc, inFn } = setup([
        { id: 'm1', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'c1', scheduled_date: '2000-02-01', status: 'completed' },
        { id: 'p1', scheduled_date: '2999-01-01', status: 'pending' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(inFn).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Fase 2B — `reclaimFromDate` ("repetir semana")
    // ─────────────────────────────────────────────────────────────────────────

    it('reclaimFromDate RECUPERA a sessão perdida no meio da semana repetida', async () => {
      // O defeito que isto trava: numa semana em que a pessoa treinou SEGUNDA e
      // QUARTA e faltou TERÇA, a fronteira de progresso é QUARTA — e a terça,
      // sendo anterior, ficaria para trás. Repetir a semana perderia justamente
      // uma das sessões que ela precisa refazer.
      const { rpc, inFn } = setup([
        { id: 'seg', scheduled_date: '2000-01-03', status: 'completed' },
        { id: 'ter', scheduled_date: '2000-01-04', status: 'missed' },
        { id: 'qua', scheduled_date: '2000-01-05', status: 'completed' },
        { id: 'sex', scheduled_date: '2000-01-07', status: 'missed' },
      ]);

      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
        '2000-01-03', // week_start da semana repetida
      );

      // TERÇA entra junto de SEXTA — é isso que o parâmetro existe para fazer.
      expect(inFn).toHaveBeenCalledWith('id', ['ter', 'sex']);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(result.deltaDays % 7).toBe(0);
    });

    it('SEM reclaimFromDate a mesma semana perde a terça (comportamento do webhook)', async () => {
      // Contraprova do teste acima: quem chama sem o parâmetro — o webhook do
      // RevenueCat — mantém a fronteira, e é assim que tem que ser lá.
      const { inFn } = setup([
        { id: 'seg', scheduled_date: '2000-01-03', status: 'completed' },
        { id: 'ter', scheduled_date: '2000-01-04', status: 'missed' },
        { id: 'qua', scheduled_date: '2000-01-05', status: 'completed' },
        { id: 'sex', scheduled_date: '2000-01-07', status: 'missed' },
      ]);

      await service.reanchorRemainingWorkoutsToToday('user-1', 'plan-1');

      expect(inFn).toHaveBeenCalledWith('id', ['sex']);
    });

    it('reclaimFromDate não ressuscita sessão de ANTES da janela pedida', async () => {
      // A abertura da fronteira é limitada à semana repetida — uma falta de um
      // ciclo anterior continua sendo uma falta.
      const { inFn } = setup([
        { id: 'antiga', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'ter', scheduled_date: '2000-01-04', status: 'missed' },
        { id: 'qua', scheduled_date: '2000-01-05', status: 'completed' },
      ]);

      await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
        '2000-01-03',
      );

      expect(inFn).toHaveBeenCalledWith('id', ['ter']);
    });
  });
});
