import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingAIService, TrainingPlanRequest } from './training-ai.service';
import { SupabaseService } from '../../database';
import { GamificationService } from '../gamification/gamification.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { AiQuotaService, AIRouterService } from '../../common/ai';
import { FeedbackAIService } from '../feedback/feedback-ai.service';
import { VdotService } from './vdot.service';
import { PlanAdaptationService } from './plan-adaptation.service';
import { VolumePlannerService } from '../../common/volume-planner';

const request: TrainingPlanRequest = {
  goal: '5k',
  level: 'beginner',
  daysPerWeek: 3,
  targetWeeks: 8,
  preferredDays: [1, 3, 5],
  currentPace5k: null,
  limitations: null,
};
const fullPlan = {
  duration_weeks: 8,
  frequency_per_week: 3,
  vdot: 30,
  weeks: [
    {
      week_number: 1,
      workouts: [
        {
          type: 'easy_run',
          distance_km: 3,
          day_of_week: 1,
          segments: [],
          objective: 'Easy running',
          tips: [],
        },
      ],
    },
  ],
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('Training generation authorization', () => {
  let service: TrainingService;
  const rpc = jest.fn();
  const generate = jest.fn();
  const seed = jest.fn();
  let query: Record<string, jest.Mock>;
  const from = jest.fn();
  const reservation = (created: boolean, input = request) => ({
    data: {
      created,
      plan_id: 'plan-1',
      generation_status: 'generating',
      plan: { generation_attempt: 2 },
      request: input,
    },
    error: null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    query = {};
    for (const method of ['select', 'eq', 'update'])
      query[method] = jest.fn().mockReturnValue(query);
    query.maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: 'plan-1' }, error: null });
    query.limit = jest.fn().mockResolvedValue({ data: [], error: null });
    from.mockReturnValue(query);
    rpc.mockReset();
    generate.mockReset().mockResolvedValue(fullPlan);
    seed.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        TrainingService,
        {
          provide: SupabaseService,
          useValue: { from, getClient: () => ({ rpc }) },
        },
        {
          provide: TrainingAIService,
          useValue: { generateTrainingPlan: generate },
        },
        { provide: VdotService, useValue: { seedForPlan: seed } },
        {
          provide: AiQuotaService,
          useValue: {
            assertWithinLimit: jest.fn().mockResolvedValue(undefined),
          },
        },
        ...[
          GamificationService,
          SubscriptionService,
          AIRouterService,
          FeedbackAIService,
          PlanAdaptationService,
          VolumePlannerService,
          getQueueToken('feedback-queue'),
          getQueueToken('elevation-queue'),
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = module.get(TrainingService);
  });

  it('returns the reserved plan on replay without calling AI or writing workouts', async () => {
    rpc.mockResolvedValueOnce(reservation(false));
    const result = await service.createQuickPlan('user-1', request, {
      source: 'onboarding',
    });
    expect(result.plan_id).toBe('plan-1');
    expect(generate).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('replays an active legacy plan without stored generation inputs or a new AI call', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        created: false,
        plan_id: 'legacy-plan',
        generation_status: 'complete',
        request: null,
        plan: {
          generation_attempt: 0,
          goal: '10k',
          duration_weeks: 12,
          frequency_per_week: 4,
        },
      },
      error: null,
    });
    const result = await service.createQuickPlan('user-1', request, {
      source: 'onboarding',
    });
    expect(result.plan_id).toBe('legacy-plan');
    expect(result.planHeader).toEqual({
      objectiveShort: '10k',
      durationWeeks: '12 Sem',
      frequencyWeekly: '4x/Sem',
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('blocks implicit cycle renewal without calling AI', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'GENERATION_DECISION_REQUIRED' },
    });
    await expect(
      service.createQuickPlan('user-1', request, {
        source: 'subscription',
        eventId: 'event-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(generate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'reserve_training_plan',
      expect.objectContaining({
        p_source: 'subscription',
        p_event_id: 'event-1',
      }),
    );
  });

  it('fails closed if the reservation RPC is unavailable', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection error' },
    });
    await expect(
      service.createQuickPlan('user-1', request, { source: 'onboarding' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(generate).not.toHaveBeenCalled();
  });

  it('publishes workouts atomically and attributes AI usage to the authenticated user', async () => {
    rpc
      .mockResolvedValueOnce(reservation(true))
      .mockResolvedValueOnce({ data: { applied: true }, error: null });
    await service.createQuickPlan('user-1', request, {
      source: 'retrospective_accept',
      retrospectiveId: 'retro-1',
    });
    await flush();
    expect(generate).toHaveBeenCalledWith(request, 'user-1');
    expect(rpc).toHaveBeenLastCalledWith(
      'finalize_training_plan',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_plan_id: 'plan-1',
        p_attempt: 2,
        p_workouts: [
          expect.objectContaining({ status: 'pending', distance_km: 3 }),
        ],
      }),
    );
    expect(seed).toHaveBeenCalledWith('user-1', 'plan-1', 30);
    expect(query.update).not.toHaveBeenCalled();
  });

  it('retries using only the persisted decision rather than current onboarding', async () => {
    const savedRequest = { ...request, goal: '10k', targetWeeks: 12 };
    rpc
      .mockResolvedValueOnce(reservation(true, savedRequest))
      .mockResolvedValueOnce({ data: { applied: true }, error: null });
    await service.retryPlanGeneration('user-1', 'plan-1', 'retry-request');
    await flush();
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'reserve_training_plan',
      expect.objectContaining({
        p_source: 'retry',
        p_retry_plan_id: 'plan-1',
        p_request: {},
        p_plan: {},
        p_request_id: 'retry-request',
      }),
    );
    expect(generate).toHaveBeenCalledWith(savedRequest, 'user-1');
    expect(from).not.toHaveBeenCalledWith('user_onboarding');
  });

  it('does not start AI for a cancelled attempt', async () => {
    rpc.mockResolvedValueOnce(reservation(true));
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await service.createQuickPlan('user-1', request, { source: 'onboarding' });
    await flush();
    expect(generate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('discards a result when atomic finalization reports the attempt is stale', async () => {
    rpc.mockResolvedValueOnce(reservation(true)).mockResolvedValueOnce({
      data: { applied: false, reason: 'stale_attempt' },
      error: null,
    });
    await service.createQuickPlan('user-1', request, { source: 'onboarding' });
    await flush();
    expect(seed).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  });

  it('keeps failed decisions retryable and conditions failure writes on ownership and attempt', async () => {
    rpc.mockResolvedValueOnce(reservation(true));
    generate.mockRejectedValue(new Error('provider unavailable'));
    await service.createQuickPlan('user-1', request, { source: 'onboarding' });
    await flush();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_status: 'failed',
        generation_finished_at: expect.any(String),
      }),
    );
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('generation_attempt', 2);
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('marks the attempt failed when atomic publication fails without seeding a partial plan', async () => {
    rpc.mockResolvedValueOnce(reservation(true)).mockResolvedValueOnce({
      data: null,
      error: { message: 'transaction rolled back' },
    });
    await service.createQuickPlan('user-1', request, { source: 'onboarding' });
    await flush();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(seed).not.toHaveBeenCalled();
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ generation_status: 'failed' }),
    );
    expect(from).not.toHaveBeenCalledWith('workouts');
  });

  it('denies status for another user before counting workouts', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      service.getPlanGenerationStatus('foreign-plan', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(from).not.toHaveBeenCalledWith('workouts');
  });

  it('allows first generation only with no plan or retrospective history', async () => {
    await expect(service.canGenerateInitialPlan('user-1')).resolves.toBe(true);
    query.limit.mockResolvedValueOnce({
      data: [{ id: 'completed-plan' }],
      error: null,
    });
    await expect(service.canGenerateInitialPlan('user-1')).resolves.toBe(false);
    query.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'retro' }], error: null });
    await expect(service.canGenerateInitialPlan('user-1')).resolves.toBe(false);
    query.limit.mockResolvedValueOnce({
      data: null,
      error: { message: 'offline' },
    });
    await expect(
      service.canGenerateInitialPlan('user-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rpc).not.toHaveBeenCalled();
  });
});
