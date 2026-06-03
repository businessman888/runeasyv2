import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { SupabaseService } from '../../database';
import { TrainingAIService } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';
import { SubscriptionService } from '../subscription/subscription.service';

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

  describe('reanchorPendingWorkoutsToToday (Q3 — resume frozen plan)', () => {
    const setup = (
      pendingRows: Array<{ id: string; scheduled_date: string }>,
    ) => {
      const rpc = jest
        .fn()
        .mockResolvedValue({ data: pendingRows.length, error: null });
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: pendingRows, error: null }),
      });
      (mockSupabaseService.getClient as jest.Mock).mockReturnValue({ rpc });
      return rpc;
    };

    it('shifts stale pending workouts forward by a multiple of 7 days', async () => {
      const rpc = setup([{ id: 'w1', scheduled_date: '2000-01-01' }]);

      const result = await service.reanchorPendingWorkoutsToToday(
        'user-1',
        'plan-1',
      );

      expect(rpc).toHaveBeenCalledTimes(1);
      const args = rpc.mock.calls[0][1] as { p_plan_id: string; p_days: number };
      expect(args.p_plan_id).toBe('plan-1');
      expect(args.p_days).toBeGreaterThan(0);
      expect(args.p_days % 7).toBe(0); // preserves the chosen weekday
      expect(result.deltaDays % 7).toBe(0);
      expect(result.shifted).toBe(1);
    });

    it('is a no-op when there are no pending workouts', async () => {
      const rpc = setup([]);
      const result = await service.reanchorPendingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });

    it('is a no-op when the earliest pending is already in the future', async () => {
      const rpc = setup([{ id: 'w1', scheduled_date: '2999-01-01' }]);
      const result = await service.reanchorPendingWorkoutsToToday(
        'user-1',
        'plan-1',
      );
      expect(rpc).not.toHaveBeenCalled();
      expect(result).toEqual({ shifted: 0, deltaDays: 0 });
    });
  });
});
