import {
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { RetrospectiveService } from './retrospective.service';
import { SupabaseService } from '../../database';
import { UsersService } from '../users/users.service';

const USER = 'fixture-user';
const PLAN = 'fixture-plan';

function queryResult(data: unknown, error: unknown = null) {
  const result = { data, error };
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    upsert: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };
  for (const name of ['select', 'eq', 'order', 'limit', 'upsert'] as const) {
    query[name].mockReturnValue(query);
  }
  return query;
}

describe('TrainingController generation authorization', () => {
  let app: INestApplication;
  let controller: TrainingController;
  const training = {
    createQuickPlan: jest.fn(),
    getActivePlan: jest.fn(),
    canGenerateInitialPlan: jest.fn(),
    getPlanGenerationStatus: jest.fn(),
    retryPlanGeneration: jest.fn(),
  };
  const retrospective = {
    generateRetrospective: jest.fn(),
    acceptSuggestion: jest.fn(),
    customizePlan: jest.fn(),
  };
  const database = { from: jest.fn() };
  const users = { updateProfile: jest.fn(), markOnboardingComplete: jest.fn() };
  let subscription: string;

  beforeAll(async () => {
    const types = Reflect.getMetadata(
      'design:paramtypes',
      TrainingController,
    ) as Function[];
    const values = new Map<Function, object>([
      [TrainingService, training],
      [RetrospectiveService, retrospective],
      [SupabaseService, database],
      [UsersService, users],
    ]);
    const module = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: types.map((type) => ({
        provide: type,
        useValue: values.get(type) ?? {},
      })),
    }).compile();
    controller = module.get(TrainingController);
    app = module.createNestApplication();
    // Represents the validated identity produced by the global auth guard.
    // The request's x-user-id is deliberately not used as an identity source.
    app.use(
      (
        req: { headers: Record<string, string>; user?: { id: string } },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers.authorization === 'Bearer fixture-session')
          req.user = { id: USER };
        next();
      },
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    subscription = 'pro';
    database.from.mockImplementation((table: string) => {
      if (table === 'users')
        return queryResult({ subscription_plan: subscription });
      if (table === 'user_onboarding')
        return queryResult({
          goal: '5k',
          level: 'beginner',
          days_per_week: 3,
          target_weeks: 8,
        });
      return queryResult(null);
    });
    training.createQuickPlan.mockResolvedValue({
      plan_id: PLAN,
      generation_status: 'generating',
      workouts_count: 0,
    });
    training.retryPlanGeneration.mockResolvedValue({
      plan_id: PLAN,
      generation_status: 'generating',
    });
    retrospective.generateRetrospective.mockResolvedValue({
      id: 'fixture-retro',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('removes the reset route even for an authenticated subscriber', async () => {
    await request(app.getHttpServer())
      .delete('/training/retrospective/reset')
      .set('Authorization', 'Bearer fixture-session')
      .expect(404);
    expect(database.from).not.toHaveBeenCalled();
  });

  it('requires authentication on retry and ignores a forged user header', async () => {
    await request(app.getHttpServer())
      .post(`/training/plan/${PLAN}/retry`)
      .set('x-user-id', USER)
      .expect(401);
    expect(training.retryPlanGeneration).not.toHaveBeenCalled();
  });

  it.each([
    'plan/fixture-plan/retry',
    'retrospective/fixture-retro/accept',
    'retrospective/fixture-retro/customize',
  ])('rejects free subscribers on %s', async (path) => {
    subscription = 'free';
    await request(app.getHttpServer())
      .post(`/training/${path}`)
      .set('Authorization', 'Bearer fixture-session')
      .send({})
      .expect(403);
    expect(training.retryPlanGeneration).not.toHaveBeenCalled();
    expect(retrospective.acceptSuggestion).not.toHaveBeenCalled();
    expect(retrospective.customizePlan).not.toHaveBeenCalled();
  });

  it('retries the owned plan with saved parameters and a server trace id', async () => {
    await request(app.getHttpServer())
      .post(`/training/plan/${PLAN}/retry`)
      .set('Authorization', 'Bearer fixture-session')
      .set('x-user-id', 'other-user')
      .send({ goal: 'marathon', user_id: 'other-user' })
      .expect(201);
    expect(training.retryPlanGeneration).toHaveBeenCalledWith(
      USER,
      PLAN,
      expect.any(String),
    );
    expect(training.createQuickPlan).not.toHaveBeenCalled();
  });

  it('passes validated identity to status ownership and preserves 404', async () => {
    training.getPlanGenerationStatus.mockRejectedValueOnce(
      new NotFoundException(),
    );
    await request(app.getHttpServer())
      .get(`/training/plan/${PLAN}/status`)
      .set('Authorization', 'Bearer fixture-session')
      .set('x-user-id', 'other-user')
      .expect(404);
    expect(training.getPlanGenerationStatus).toHaveBeenCalledWith(PLAN, USER);
  });

  it.each([false, true])(
    'returns explicit initial eligibility %s when there is no plan',
    async (eligible) => {
      training.getActivePlan.mockResolvedValueOnce(null);
      training.canGenerateInitialPlan.mockResolvedValueOnce(eligible);
      await expect(controller.getActivePlan(USER)).resolves.toEqual({
        plan: null,
        can_generate_initial_plan: eligible,
      });
    },
  );

  it('never offers initial generation when an active failed plan exists', async () => {
    const plan = { id: PLAN, generation_status: 'failed' };
    training.getActivePlan.mockResolvedValueOnce(plan);
    training.canGenerateInitialPlan.mockResolvedValueOnce(true);
    await expect(controller.getActivePlan(USER)).resolves.toEqual({
      plan,
      can_generate_initial_plan: false,
    });
  });

  it.each(['free', 'unknown'])(
    'refuses onboarding generation without explicit Pro entitlement (%s)',
    async (plan) => {
      subscription = plan;
      await expect(
        controller.generatePlanFromOnboarding(USER),
      ).resolves.toEqual({ generated: false, reason: 'free_plan' });
      expect(training.createQuickPlan).not.toHaveBeenCalled();
    },
  );

  it('delegates onboarding reservation with source and preserves cycle conflict', async () => {
    const conflict = new ConflictException('Use retrospective');
    training.createQuickPlan.mockRejectedValueOnce(conflict);
    await expect(controller.generatePlanFromOnboarding(USER)).rejects.toBe(
      conflict,
    );
    expect(training.createQuickPlan).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ goal: '5k' }),
      {
        source: 'onboarding',
        requestId: expect.any(String),
      },
    );
    expect(database.from).not.toHaveBeenCalledWith('training_plans');
  });

  it('saving onboarding leaves a reserved or failed plan intact', async () => {
    const dto = {
      goal: '5k',
      level: 'beginner',
      days_per_week: 3,
      available_days: [1, 3, 5],
      target_weeks: 8,
    };
    await expect(
      controller.saveOnboardingOnly(
        USER,
        dto as Parameters<TrainingController['saveOnboardingOnly']>[1],
      ),
    ).resolves.toEqual({ success: true });
    expect(database.from).not.toHaveBeenCalledWith('training_plans');
    expect(users.markOnboardingComplete).toHaveBeenCalledWith(USER);
  });

  it.each(['accept', 'customize'])(
    'preserves retrospective %s conflicts',
    async (action) => {
      const conflict = new ConflictException('Already consumed');
      if (action === 'accept') {
        retrospective.acceptSuggestion.mockRejectedValueOnce(conflict);
        await expect(
          controller.acceptRetrospectiveSuggestion(USER, 'fixture-retro'),
        ).rejects.toBe(conflict);
      } else {
        retrospective.customizePlan.mockRejectedValueOnce(conflict);
        await expect(
          controller.customizeRetrospectivePlan(
            USER,
            'fixture-retro',
            {} as Parameters<
              TrainingController['customizeRetrospectivePlan']
            >[2],
          ),
        ).rejects.toBe(conflict);
      }
    },
  );

  describe('manual retrospective temporal boundary', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2026-09-13T02:30:00Z')); // Still Sep 12 in Sao Paulo.
    });
    afterEach(() => jest.useRealTimers());

    function cycle(
      lastDate: string | null,
      generationStatus = 'complete',
      workoutError: unknown = null,
    ) {
      database.from.mockImplementation((table: string) => {
        if (table === 'training_plans')
          return queryResult({
            id: PLAN,
            status: 'active',
            generation_status: generationStatus,
            created_at: '2026-01-01T03:00:00Z',
            duration_weeks: 4,
          });
        if (table === 'workouts')
          return queryResult(
            lastDate ? { scheduled_date: lastDate } : null,
            workoutError,
          );
        return queryResult(null);
      });
    }

    it.each(['2026-09-12', '2026-10-01', null])(
      'blocks a cycle ending %s before completion',
      async (lastDate) => {
        cycle(lastDate);
        await expect(
          controller.manuallyGenerateRetrospective(USER),
        ).rejects.toMatchObject({ status: 409 });
        expect(retrospective.generateRetrospective).not.toHaveBeenCalled();
      },
    );

    it('allows recovery after the last scheduled local day', async () => {
      cycle('2026-09-11');
      await expect(
        controller.manuallyGenerateRetrospective(USER),
      ).resolves.toMatchObject({ success: true });
      expect(retrospective.generateRetrospective).toHaveBeenCalledWith(
        USER,
        PLAN,
      );
    });

    it('blocks an incomplete plan even with old workouts', async () => {
      cycle('2026-01-10', 'generating');
      await expect(
        controller.manuallyGenerateRetrospective(USER),
      ).rejects.toMatchObject({ status: 409 });
      expect(retrospective.generateRetrospective).not.toHaveBeenCalled();
    });

    it('fails closed when the authoritative workouts query fails', async () => {
      cycle(null, 'complete', new Error('Fixture database unavailable'));
      await expect(
        controller.manuallyGenerateRetrospective(USER),
      ).rejects.toMatchObject({ status: 500 });
      expect(retrospective.generateRetrospective).not.toHaveBeenCalled();
    });
  });
});
