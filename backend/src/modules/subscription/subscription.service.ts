import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database';
import {
  SubscriptionStateDto,
  SubscriptionPlan,
  SubscriptionStatus,
} from './dto/subscription-state.dto';

interface UserSubscriptionRow {
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  grace_period_expires_at: string | null;
  onboarding_completed: boolean | null;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getState(userId: string): Promise<SubscriptionStateDto> {
    const { data, error } = await this.supabase
      .from('users')
      .select(
        'subscription_plan, subscription_status, trial_started_at, trial_expires_at, ' +
          'subscription_started_at, subscription_expires_at, grace_period_expires_at, onboarding_completed',
      )
      .eq('id', userId)
      .single<UserSubscriptionRow>();

    if (error || !data) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.toDto(data);
  }

  async updateSubscription(
    userId: string,
    patch: Partial<{
      subscription_plan: SubscriptionPlan;
      subscription_status: SubscriptionStatus;
      trial_started_at: string | null;
      trial_expires_at: string | null;
      subscription_started_at: string | null;
      subscription_expires_at: string | null;
      grace_period_expires_at: string | null;
      revenuecat_user_id: string | null;
    }>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('users')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      this.logger.error(`Failed to update subscription for ${userId}`, error);
      throw error;
    }
  }

  async isProUser(userId: string): Promise<boolean> {
    const state = await this.getState(userId);
    return state.isPro;
  }

  private toDto(row: UserSubscriptionRow): SubscriptionStateDto {
    const plan = row.subscription_plan ?? 'free';
    const status = row.subscription_status ?? 'active';
    const trialExpires = row.trial_expires_at
      ? new Date(row.trial_expires_at).getTime()
      : null;
    const now = Date.now();

    // A billing issue keeps Pro alive during the grace window the webhook sets
    // (handleBillingIssue → grace_period_expires_at = now + 7d). Without this,
    // the 7-day grace granted no access at all.
    const graceActive =
      row.grace_period_expires_at !== null &&
      new Date(row.grace_period_expires_at).getTime() > now;

    // Pro access if plan='pro' AND status grants active access. 'cancelled' keeps
    // Pro until subscription_expires_at; 'billing_issue' keeps it during grace;
    // 'expired' drops access.
    const isPro =
      plan === 'pro' &&
      (status === 'active' ||
        status === 'trial' ||
        (status === 'cancelled' &&
          row.subscription_expires_at !== null &&
          new Date(row.subscription_expires_at).getTime() > now) ||
        (status === 'billing_issue' && graceActive));

    const daysRemainingInTrial =
      trialExpires && status === 'trial'
        ? Math.max(0, Math.ceil((trialExpires - now) / 86400000))
        : 0;

    return {
      plan,
      status,
      isPro,
      trialStartedAt: row.trial_started_at,
      trialExpiresAt: row.trial_expires_at,
      subscriptionStartedAt: row.subscription_started_at,
      subscriptionExpiresAt: row.subscription_expires_at,
      gracePeriodExpiresAt: row.grace_period_expires_at,
      daysRemainingInTrial,
    };
  }
}
