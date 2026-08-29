import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { SupabaseService } from '../../database';
import { TrainingAIService } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { AiQuotaService, AIRouterService } from '../../common/ai';
import { FeedbackAIService } from '../feedback/feedback-ai.service';
import { VdotService } from './vdot.service';
import { PlanAdaptationService } from './plan-adaptation.service';
import { VolumePlannerService } from '../../common/volume-planner';

describe('TrainingService', () => {
  let service: TrainingService;
  let mockSupabaseService: Partial<SupabaseService>;
  let mockTrainingAIService: Partial<TrainingAIService>;
  let mockPlanAdaptation: {
    getStateDigest: jest.Mock;
    applyScheduleShift: jest.Mock;
  };
  const mockSubscriptionService = {
    isProUser: jest.fn(),
  };

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
    mockSubscriptionService.isProUser.mockReset().mockResolvedValue(true);
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
        single: jest.fn().mockResolvedValue({ data: mockPlan, error: null }),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: mockPlan, error: null }),
      }),
      getClient: jest.fn().mockReturnValue({
        rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      }),
    };

    // Dublê da fundação. Por padrão o apply "dá certo" e devolve a contagem de
    // IDs recebida — os testes da re-âncora inspecionam `workoutIds` para
    // provar QUAL conjunto foi enviado, que é o coração da mina 2.
    mockPlanAdaptation = {
      getStateDigest: jest.fn().mockResolvedValue('digest-fake'),
      applyScheduleShift: jest.fn(
        async ({
          workoutIds,
          deltaDays,
        }: {
          workoutIds: string[];
          deltaDays: number;
        }) => ({
          applied: true,
          shifted: workoutIds.length,
          reclaimed: 0,
          deltaDays,
        }),
      ),
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
          useValue: mockSubscriptionService,
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
          useValue: {
            enqueueGeneration: jest.fn().mockResolvedValue(undefined),
          },
        },
        // Fase 3: o TrainingService só semeia o VDOT do plano recém-gerado.
        // Best-effort por construção, então o mock nunca falha.
        {
          provide: VdotService,
          useValue: { seedForPlan: jest.fn().mockResolvedValue(undefined) },
        },
        // Fase 6.1 — a fundação. Aqui só a re-âncora a consome; o dublê
        // registra a chamada para os testes provarem QUE CONJUNTO de IDs foi
        // enviado, que é o ponto da mina 2. O comportamento real da função SQL
        // (lock, CAS, atomicidade) é provado em `test/integration/`.
        { provide: PlanAdaptationService, useValue: mockPlanAdaptation },
        // Motor puro, sem I/O — usado no overview para RECOMPUTAR a fase da
        // semana. Instanciado de verdade: mocká-lo tornaria o teste da fase
        // um teste do mock.
        VolumePlannerService,
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('completeWorkout idempotency', () => {
    it('returns an already completed workout without repeating side effects', async () => {
      const completedWorkout = {
        id: 'w-completed',
        user_id: 'user-123',
        source: 'plan',
        status: 'completed',
        activity_id: 'activity-1',
      };
      const workoutQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: completedWorkout, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockReturnValue(workoutQuery);

      const result = await service.completeWorkout('user-123', 'w-completed', {
        route_points: [],
        total_distance_meters: 5000,
        duration_seconds: 1800,
        source: 'apple_watch',
        external_id: 'apple_watch_run-1',
        started_at: '2026-08-13T10:00:00.000Z',
      });

      expect(result).toEqual(completedWorkout);
      expect(mockSupabaseService.from).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionService.isProUser).not.toHaveBeenCalled();
    });

    it('treats a second physical run for an already completed workout as a replay', async () => {
      const completedWorkout = {
        id: 'w-completed',
        user_id: 'user-123',
        source: 'plan',
        status: 'completed',
        activity_id: 'canonical-activity',
      };
      const workoutQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: completedWorkout, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockReturnValue(workoutQuery);
      mockSubscriptionService.isProUser.mockResolvedValue(false);

      const result = await service.completeWorkout('user-123', 'w-completed', {
        route_points: [],
        total_distance_meters: 6060,
        duration_seconds: 2160,
        source: 'apple_watch',
        external_id: 'apple_watch_a-different-run-id',
        started_at: '2026-08-29T10:00:00.000Z',
      });

      expect(result).toEqual(completedWorkout);
      expect(mockSubscriptionService.isProUser).not.toHaveBeenCalled();
      expect(mockSupabaseService.from).toHaveBeenCalledTimes(1);
    });

    it('keeps a planned run queued when subscription lookup is unavailable', async () => {
      const pendingWorkout = {
        id: 'w-pending',
        user_id: 'user-123',
        source: 'plan',
        status: 'pending',
      };
      const workoutQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: pendingWorkout, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockReturnValue(workoutQuery);
      mockSubscriptionService.isProUser.mockRejectedValue(
        new Error('subscription timeout'),
      );

      await expect(
        service.completeWorkout('user-123', 'w-pending', {
          route_points: [],
          total_distance_meters: 5000,
          duration_seconds: 1800,
          source: 'apple_watch',
          external_id: 'apple_watch_retry-me',
          started_at: '2026-08-29T10:00:00.000Z',
        }),
      ).rejects.toThrow('O treino será reenviado');

      expect(mockSupabaseService.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('completeFreeWorkout identity', () => {
    it('reuses the claimed free workout on a durable retry', async () => {
      const claimedWorkout = {
        id: 'free-workout-1',
        user_id: 'user-123',
        source: 'free',
        status: 'pending',
        completion_external_id: 'apple_watch_run-42',
      };
      const claimQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: claimedWorkout, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockReturnValue(claimQuery);
      const completeSpy = jest
        .spyOn(service, 'completeWorkout')
        .mockResolvedValue({ ...claimedWorkout, status: 'completed' });

      const result = await service.completeFreeWorkout('user-123', {
        route_points: [],
        total_distance_meters: 6060,
        duration_seconds: 2160,
        source: 'apple_watch',
        external_id: 'apple_watch_run-42',
        started_at: '2026-08-29T10:00:00.000Z',
      });

      expect(completeSpy).toHaveBeenCalledWith(
        'user-123',
        'free-workout-1',
        expect.objectContaining({
          external_id: 'apple_watch_run-42',
          source: 'apple_watch',
        }),
        true,
      );
      expect(result.status).toBe('completed');
    });

    it('rejects a free run without a stable completion identity', async () => {
      await expect(
        service.completeFreeWorkout('user-123', {
          route_points: [],
          total_distance_meters: 1000,
          duration_seconds: 360,
          source: 'phone',
        }),
      ).rejects.toThrow('external_id ou started_at');

      expect(mockSupabaseService.from).not.toHaveBeenCalled();
    });
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
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: mockPlan, error: null }),
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

    it('oculta sessão futura pendente de plano encerrado sem apagar o histórico', async () => {
      const rows = [
        {
          id: 'active-future',
          plan_id: 'plan-1',
          status: 'pending',
          scheduled_date: '2999-01-02',
        },
        {
          id: 'old-future',
          plan_id: 'plan-old',
          status: 'pending',
          scheduled_date: '2999-01-02',
        },
        {
          id: 'old-completed',
          plan_id: 'plan-old',
          status: 'completed',
          scheduled_date: '2999-01-02',
        },
        {
          id: 'old-history',
          plan_id: 'plan-old',
          status: 'missed',
          scheduled_date: '2000-01-02',
        },
        {
          id: 'manual-future',
          plan_id: null,
          source: 'manual',
          status: 'pending',
          scheduled_date: '2999-01-02',
        },
      ];
      const planQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: mockPlan, error: null }),
      };
      const workoutQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: rows, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockImplementation(
        (table: string) =>
          table === 'training_plans' ? planQuery : workoutQuery,
      );

      const result = await service.getWorkouts(
        'user-123',
        '2000-01-01',
        '2999-01-31',
      );

      expect(result.map((w: { id: string }) => w.id)).toEqual([
        'active-future',
        'old-completed',
        'old-history',
        'manual-future',
      ]);
      expect(result.map((w: { id: string }) => w.id)).not.toContain(
        'old-future',
      );
    });
  });

  describe('getUpcomingWorkouts', () => {
    it('should return upcoming pending workouts', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: mockPlan, error: null }),
        or: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
      };
      (mockSupabaseService.from as jest.Mock).mockReturnValue(query);

      const result = await service.getUpcomingWorkouts('user-123', 5);
      expect(result).toEqual(mockWorkouts);
      expect(query.or).toHaveBeenCalledWith(
        'plan_id.is.null,plan_id.eq.plan-1',
      );
    });
  });

  describe('skipWorkout', () => {
    /**
     * Fase 6.1 — a rota ganhou guards.
     *
     * Ela aceitava QUALQUER workout do usuário: passado, já concluído, de um
     * ciclo encerrado. A partir da 6.2 a adaptação escreve `skipped` pela
     * fundação, com fronteira; deixar a rota manual sem as mesmas regras
     * manteria uma porta lateral para exatamente o que a fundação impede.
     */
    const FUTURO = '2999-01-01';

    /**
     * `skipWorkout` faz três acessos em sequência: lê o treino, lê o plano
     * ativo (`loadActivePlanId`) e escreve. O mock responde na ordem.
     */
    const arrange = (workout: Record<string, unknown> | null) => {
      const updated = {
        ...mockWorkouts[0],
        status: 'skipped',
        skip_reason: 'sick',
      };
      const from = mockSupabaseService.from as jest.Mock;
      from.mockReset();
      from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: workout, error: null }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: { id: 'plan-1' }, error: null }),
        })
        .mockReturnValue({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: updated, error: null }),
        });
    };

    it('marca como skipped um treino FUTURO do plano ativo', async () => {
      arrange({
        id: 'w1',
        plan_id: 'plan-1',
        status: 'pending',
        scheduled_date: FUTURO,
        is_race_day: false,
      });

      const result = await service.skipWorkout('user-123', 'w1', 'sick');
      expect(result.status).toBe('skipped');
      expect(result.skip_reason).toBe('sick');
    });

    it('RECUSA pular um treino já concluído — apagaria a execução', async () => {
      arrange({
        id: 'w1',
        plan_id: 'plan-1',
        status: 'completed',
        scheduled_date: FUTURO,
        is_race_day: false,
      });

      await expect(service.skipWorkout('user-123', 'w1', 'sick')).rejects.toThrow(
        /concluído|pulado|perdido/i,
      );
    });

    it('RECUSA pular treino do passado — mexeria em insight já fechado', async () => {
      arrange({
        id: 'w1',
        plan_id: 'plan-1',
        status: 'pending',
        scheduled_date: '2000-01-01',
        is_race_day: false,
      });

      await expect(service.skipWorkout('user-123', 'w1', 'sick')).rejects.toThrow(
        /a partir de amanhã/i,
      );
    });

    it('RECUSA pular treino de plano encerrado', async () => {
      arrange({
        id: 'w1',
        plan_id: 'plano-antigo',
        status: 'pending',
        scheduled_date: FUTURO,
        is_race_day: false,
      });

      await expect(service.skipWorkout('user-123', 'w1', 'sick')).rejects.toThrow(
        /plano ativo/i,
      );
    });

    it('RECUSA pular o dia da prova — invariante do contrato', async () => {
      arrange({
        id: 'w1',
        plan_id: 'plan-1',
        status: 'pending',
        scheduled_date: FUTURO,
        is_race_day: true,
      });

      await expect(service.skipWorkout('user-123', 'w1', 'sick')).rejects.toThrow(
        /prova/i,
      );
    });

    it('404 quando o treino não é do usuário', async () => {
      arrange(null);
      await expect(service.skipWorkout('user-123', 'w1', 'sick')).rejects.toThrow(
        /não encontrado/i,
      );
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
      expect(resolve('2999-01-01').toISOString().slice(0, 10)).toBe(
        '2999-01-01',
      );
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
    // ── O QUE MUDOU NA FASE 6.1 ────────────────────────────────────────────
    //
    // Antes o serviço fazia DUAS escritas: um UPDATE reclamando os `missed` e
    // depois a RPC `shift_pending_workouts`. E aí estava a mina 2 — a RPC
    // ignorava a seleção calculada aqui e deslocava TODOS os pendentes do
    // plano. Os testes não podiam pegar isso: eles mockavam a RPC e só
    // conferiam `p_days`.
    //
    // Agora o serviço faz UMA chamada, com a LISTA DE IDS. Isso torna o
    // conjunto observável — e é sobre ele que estes testes passam a afirmar.
    // Que o SQL desloque exatamente esses IDs (e nada além) é provado contra
    // Postgres real em `test/integration/schedule-shift.int-spec.ts`.
    const setup = (
      rows: Array<{ id: string; scheduled_date: string; status: string }>,
    ) => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: rows, error: null }),
      });
      return mockPlanAdaptation.applyScheduleShift;
    };

    /** Os IDs que o serviço mandou deslocar, na ordem em que os selecionou. */
    const shiftedIds = (shift: jest.Mock): string[] =>
      (shift.mock.calls[0][0] as { workoutIds: string[] }).workoutIds;

    it('reclaims lapse-missed sessions and shifts the block by whole weeks', async () => {
      const shift = setup([
        { id: 'w1', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'w2', scheduled_date: '2000-01-03', status: 'pending' },
      ]);

      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );

      expect(shift).toHaveBeenCalledTimes(1);
      // O `missed` da lapsa entra JUNTO do pendente — o reclaim acontece
      // dentro da mesma transação do deslocamento.
      expect(shiftedIds(shift)).toEqual(['w1', 'w2']);

      const args = shift.mock.calls[0][0] as {
        planId: string;
        userId: string;
        deltaDays: number;
      };
      expect(args.planId).toBe('plan-1');
      // `userId` viaja: o backend usa service role e ignora RLS, então a
      // propriedade só é garantida se for passada explicitamente.
      expect(args.userId).toBe('user-1');
      expect(args.deltaDays).toBeGreaterThan(0);
      expect(args.deltaDays % 7).toBe(0); // preserva o dia da semana
      expect(result.deltaDays % 7).toBe(0);
    });

    it('is a no-op when nothing is left to run', async () => {
      const shift = setup([
        { id: 'c1', scheduled_date: '2000-01-01', status: 'completed' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(shift).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('is a no-op when the remaining plan already resumes in the future', async () => {
      const shift = setup([
        { id: 'w1', scheduled_date: '2999-01-01', status: 'pending' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(shift).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('does not resurrect sessions missed before the progress frontier', async () => {
      // m1 (missed) is BEFORE the last completed workout (c1) — a legit earlier
      // miss that must not be reclaimed. The only remaining session (p1) is future.
      const shift = setup([
        { id: 'm1', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'c1', scheduled_date: '2000-02-01', status: 'completed' },
        { id: 'p1', scheduled_date: '2999-01-01', status: 'pending' },
      ]);
      const result = await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(shift).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('um `skipped` FUTURO não empurra a fronteira de progresso', async () => {
      // ── O DEFEITO QUE ISTO TRAVA (Fase 6.1) ──────────────────────────────
      //
      // A partir da 6.2, "reduzir frequência" marca um treino FUTURO como
      // `skipped`. A fronteira de progresso considerava qualquer
      // completed/skipped, então esse skip a empurraria para o futuro — e uma
      // re-âncora posterior ("repetir semana") deixaria para trás TODOS os
      // pendentes anteriores a ele. Calendário furado, sem erro nenhum.
      //
      // Progresso é o que já ACONTECEU: a fronteira agora só conta o passado.
      const shift = setup([
        { id: 'atrasado', scheduled_date: '2000-01-03', status: 'pending' },
        { id: 'futuro-skip', scheduled_date: '2999-01-01', status: 'skipped' },
      ]);

      await service.reanchorRemainingWorkoutsToToday('user-1', 'plan-1');

      // Sem o corte em `hoje`, a fronteira seria 2999-01-01 e `atrasado`
      // (anterior a ela) sairia do conjunto — nada seria deslocado.
      expect(shift).toHaveBeenCalledTimes(1);
      expect(shiftedIds(shift)).toEqual(['atrasado']);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Fase 2B — `reclaimFromDate` ("repetir semana")
    // ─────────────────────────────────────────────────────────────────────────

    it('reclaimFromDate RECUPERA a sessão perdida no meio da semana repetida', async () => {
      // O defeito que isto trava: numa semana em que a pessoa treinou SEGUNDA e
      // QUARTA e faltou TERÇA, a fronteira de progresso é QUARTA — e a terça,
      // sendo anterior, ficaria para trás. Repetir a semana perderia justamente
      // uma das sessões que ela precisa refazer.
      const shift = setup([
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
      expect(shiftedIds(shift)).toEqual(['ter', 'sex']);
      expect(shift).toHaveBeenCalledTimes(1);
      expect(result.deltaDays % 7).toBe(0);
    });

    it('SEM reclaimFromDate a mesma semana perde a terça (comportamento do webhook)', async () => {
      // Contraprova do teste acima: quem chama sem o parâmetro — o webhook do
      // RevenueCat — mantém a fronteira, e é assim que tem que ser lá.
      const shift = setup([
        { id: 'seg', scheduled_date: '2000-01-03', status: 'completed' },
        { id: 'ter', scheduled_date: '2000-01-04', status: 'missed' },
        { id: 'qua', scheduled_date: '2000-01-05', status: 'completed' },
        { id: 'sex', scheduled_date: '2000-01-07', status: 'missed' },
      ]);

      await service.reanchorRemainingWorkoutsToToday('user-1', 'plan-1');

      expect(shiftedIds(shift)).toEqual(['sex']);
    });

    it('reclaimFromDate não ressuscita sessão de ANTES da janela pedida', async () => {
      // A abertura da fronteira é limitada à semana repetida — uma falta de um
      // ciclo anterior continua sendo uma falta.
      const shift = setup([
        { id: 'antiga', scheduled_date: '2000-01-01', status: 'missed' },
        { id: 'ter', scheduled_date: '2000-01-04', status: 'missed' },
        { id: 'qua', scheduled_date: '2000-01-05', status: 'completed' },
      ]);

      await service.reanchorRemainingWorkoutsToToday(
        'user-1',
        'plan-1',
        '2000-01-03',
      );

      expect(shiftedIds(shift)).toEqual(['ter']);
    });
  });
});
