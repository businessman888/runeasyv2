import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { SubscriptionService } from './subscription.service';
import { TrainingService } from '../training/training.service';
import { ReferralService } from '../referral';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { RevenueCatWebhookBody } from './dto/revenuecat-event.dto';

describe('RevenueCat generation admission', () => {
  let service: RevenueCatWebhookService;
  const createQuickPlan = jest.fn();
  const getActivePlan = jest.fn();
  const reanchor = jest.fn();
  const updateSubscription = jest.fn();
  const insertEvent = jest.fn();
  const event: RevenueCatWebhookBody = {
    event: {
      id: 'purchase-1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'user-1',
      period_type: 'TRIAL',
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    getActivePlan.mockResolvedValue(null);
    createQuickPlan.mockResolvedValue({ plan_id: 'plan-1' });
    const module = await Test.createTestingModule({
      providers: [
        RevenueCatWebhookService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-only') },
        },
        {
          provide: SubscriptionService,
          useValue: {
            getState: jest.fn().mockResolvedValue({ isPro: false }),
            updateSubscription,
          },
        },
        {
          provide: TrainingService,
          useValue: {
            createQuickPlan,
            getActivePlan,
            reanchorRemainingWorkoutsToToday: reanchor,
          },
        },
        {
          provide: ReferralService,
          useValue: { processCommission: jest.fn() },
        },
        {
          provide: SupabaseService,
          useValue: {
            from: (table: string) => {
              const query = {
                select: jest.fn(),
                eq: jest.fn(),
                insert: insertEvent,
                maybeSingle: jest.fn().mockResolvedValue({
                  data:
                    table === 'user_onboarding'
                      ? {
                          goal: '5k',
                          level: 'beginner',
                          days_per_week: 3,
                          target_weeks: 8,
                          available_days: [1, 3, 5],
                          current_pace_5k: null,
                          limitations: null,
                        }
                      : null,
                  error: null,
                }),
              };
              query.select.mockReturnValue(query);
              query.eq.mockReturnValue(query);
              return query;
            },
          },
        },
      ],
    }).compile();
    service = module.get(RevenueCatWebhookService);
  });

  it('routes initial purchase through centralized authorization with its event identity', async () => {
    await expect(service.process(event)).resolves.toEqual({ handled: true });
    expect(createQuickPlan).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ goal: '5k' }),
      {
        source: 'subscription',
        eventId: 'purchase-1',
        requestId: 'purchase-1',
      },
    );
  });

  it('keeps the subscription activation when the cycle requires a retrospective decision', async () => {
    createQuickPlan.mockRejectedValue(
      new ConflictException('Cycle confirmation required'),
    );
    await expect(service.process(event)).resolves.toEqual({ handled: true });
    expect(updateSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subscription_plan: 'pro' }),
    );
    expect(createQuickPlan).toHaveBeenCalledTimes(1);
    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 'purchase-1' }),
    );
  });

  it('does not retry or replace an active failed plan on subscription activation', async () => {
    getActivePlan.mockResolvedValue({
      id: 'failed-plan',
      generation_status: 'failed',
    });
    await service.process(event);
    expect(createQuickPlan).not.toHaveBeenCalled();
  });
});
