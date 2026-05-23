export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'expired'
  | 'cancelled'
  | 'billing_issue';

export interface SubscriptionStateDto {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isPro: boolean;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  gracePeriodExpiresAt: string | null;
  daysRemainingInTrial: number;
}
