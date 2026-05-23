import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database';
import { SubscriptionService } from './subscription.service';
import { TrainingService } from '../training/training.service';
import {
  RevenueCatEvent,
  RevenueCatWebhookBody,
} from './dto/revenuecat-event.dto';

@Injectable()
export class RevenueCatWebhookService {
  private readonly logger = new Logger(RevenueCatWebhookService.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly subscriptionService: SubscriptionService,
    private readonly trainingService: TrainingService,
  ) {
    this.webhookSecret = config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    if (!this.webhookSecret) {
      this.logger.warn(
        'REVENUECAT_WEBHOOK_SECRET not set — webhook will reject all requests',
      );
    }
  }

  verifyAuth(authHeader: string | undefined): void {
    if (!this.webhookSecret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }
    const expected = `Bearer ${this.webhookSecret}`;
    if (authHeader !== expected) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async process(
    body: RevenueCatWebhookBody,
  ): Promise<{ handled: boolean; reason?: string }> {
    const event = body?.event;
    if (!event?.id || !event?.type || !event?.app_user_id) {
      this.logger.warn('Malformed RevenueCat webhook payload', body);
      return { handled: false, reason: 'malformed' };
    }

    // Idempotency: skip if event_id was already processed.
    const { data: existing } = await this.supabase
      .from('revenuecat_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      this.logger.log(`[RC] Event ${event.id} already processed, skipping`);
      return { handled: true, reason: 'duplicate' };
    }

    const userId = event.app_user_id;

    try {
      switch (event.type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'UNCANCELLATION':
          await this.handleActivation(userId, event);
          break;
        case 'PRODUCT_CHANGE':
          await this.handleActivation(userId, event);
          break;
        case 'CANCELLATION':
          await this.handleCancellation(userId, event);
          break;
        case 'EXPIRATION':
          await this.handleExpiration(userId);
          break;
        case 'BILLING_ISSUE':
          await this.handleBillingIssue(userId);
          break;
        case 'SUBSCRIBER_ALIAS':
        case 'TRANSFER':
        case 'NON_RENEWING_PURCHASE':
          this.logger.log(
            `[RC] Ignoring event type ${event.type} for ${userId}`,
          );
          break;
        default:
          this.logger.warn(`[RC] Unknown event type: ${event.type as string}`);
      }

      await this.supabase.from('revenuecat_events').insert({
        event_id: event.id,
        user_id: userId,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      });

      return { handled: true };
    } catch (err) {
      this.logger.error(
        `[RC] Failed to process event ${event.id} for ${userId}`,
        err,
      );
      throw err;
    }
  }

  private async handleActivation(
    userId: string,
    event: RevenueCatEvent,
  ): Promise<void> {
    const isTrial = event.period_type === 'TRIAL';
    const purchasedAt = event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : null;
    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    const prior = await this.subscriptionService
      .getState(userId)
      .catch(() => null);

    await this.subscriptionService.updateSubscription(userId, {
      subscription_plan: 'pro',
      subscription_status: isTrial ? 'trial' : 'active',
      ...(isTrial
        ? { trial_started_at: purchasedAt, trial_expires_at: expiresAt }
        : {
            subscription_started_at: purchasedAt,
            subscription_expires_at: expiresAt,
          }),
      revenuecat_user_id: event.original_app_user_id ?? userId,
      grace_period_expires_at: null,
    });

    this.logger.log(
      `[RC] Activated Pro for user ${userId} (trial=${isTrial}, expires=${expiresAt})`,
    );

    // First transition to Pro → generate plan if onboarding exists and no plan yet
    if (!prior?.isPro) {
      await this.maybeGeneratePlan(userId);
    }
  }

  private async handleCancellation(
    userId: string,
    event: RevenueCatEvent,
  ): Promise<void> {
    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
    await this.subscriptionService.updateSubscription(userId, {
      subscription_status: 'cancelled',
      subscription_expires_at: expiresAt,
    });
    this.logger.log(
      `[RC] Cancelled subscription for user ${userId}, keeps Pro until ${expiresAt}`,
    );
  }

  private async handleExpiration(userId: string): Promise<void> {
    await this.subscriptionService.updateSubscription(userId, {
      subscription_plan: 'free',
      subscription_status: 'expired',
    });
    this.logger.log(
      `[RC] Subscription expired for user ${userId}, downgraded to free`,
    );
  }

  private async handleBillingIssue(userId: string): Promise<void> {
    const grace = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await this.subscriptionService.updateSubscription(userId, {
      subscription_status: 'billing_issue',
      grace_period_expires_at: grace,
    });
    this.logger.log(
      `[RC] Billing issue for user ${userId}, grace until ${grace}`,
    );
  }

  private async maybeGeneratePlan(userId: string): Promise<void> {
    const existingPlan = await this.trainingService.getActivePlan(userId);
    if (existingPlan) {
      this.logger.log(
        `[RC] User ${userId} already has active plan — skipping generation`,
      );
      return;
    }

    const { data: onboarding, error } = await this.supabase
      .from('user_onboarding')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !onboarding) {
      this.logger.log(
        `[RC] No onboarding data for ${userId} — skipping plan generation`,
      );
      return;
    }

    const dto = onboarding.responses_json || onboarding;
    const selectedDays =
      (dto.available_days?.length ? dto.available_days : null) ||
      (onboarding.available_days?.length ? onboarding.available_days : null) ||
      dto.preferred_days ||
      onboarding.preferred_days ||
      [];

    try {
      const result = await this.trainingService.createQuickPlan(userId, {
        goal: dto.goal || onboarding.goal,
        level: dto.level || onboarding.level,
        daysPerWeek: dto.days_per_week || onboarding.days_per_week,
        currentPace5k: dto.current_pace_5k || onboarding.current_pace_5k,
        targetWeeks: dto.target_weeks || onboarding.target_weeks,
        limitations: dto.limitations || onboarding.limitations,
        preferredDays: selectedDays,
        startDate: dto.start_date || onboarding.start_date,
      });
      this.logger.log(
        `[RC] Plan generated for ${userId} after upgrade — plan_id=${result.plan_id}`,
      );
    } catch (err) {
      this.logger.error(
        `[RC] Plan generation failed for ${userId} after upgrade`,
        err,
      );
    }
  }
}
