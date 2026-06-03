import { SubscriptionService } from './subscription.service';
import { SupabaseService } from '../../database';

/**
 * isPro derivation matrix. Covers the plan/status combinations that decide
 * Free vs Pro access, including the billing_issue grace window (regression
 * guard) and the free+trial default-column shape seen in the audit.
 */
describe('SubscriptionService — isPro derivation', () => {
  const build = (row: Record<string, unknown>) => {
    const mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: row, error: null }),
      }),
    };
    return new SubscriptionService(mockSupabase as unknown as SupabaseService);
  };

  const base = {
    subscription_plan: 'free',
    subscription_status: 'active',
    trial_started_at: null,
    trial_expires_at: null,
    subscription_started_at: null,
    subscription_expires_at: null,
    grace_period_expires_at: null,
    onboarding_completed: true,
  };
  const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
  const past = () => new Date(Date.now() - 86400000).toISOString();

  const isPro = async (row: Record<string, unknown>) =>
    (await build(row).getState('u')).isPro;

  it('free → not pro', async () => {
    expect(await isPro({ ...base })).toBe(false);
  });

  it('free + trial (default columns, the audited user) → not pro', async () => {
    expect(
      await isPro({ ...base, subscription_status: 'trial' }),
    ).toBe(false);
  });

  it('pro + active → pro', async () => {
    expect(
      await isPro({ ...base, subscription_plan: 'pro', subscription_status: 'active' }),
    ).toBe(true);
  });

  it('pro + trial → pro', async () => {
    expect(
      await isPro({ ...base, subscription_plan: 'pro', subscription_status: 'trial' }),
    ).toBe(true);
  });

  it('pro + cancelled with future expiry → pro', async () => {
    expect(
      await isPro({
        ...base,
        subscription_plan: 'pro',
        subscription_status: 'cancelled',
        subscription_expires_at: future(),
      }),
    ).toBe(true);
  });

  it('pro + cancelled with past expiry → not pro', async () => {
    expect(
      await isPro({
        ...base,
        subscription_plan: 'pro',
        subscription_status: 'cancelled',
        subscription_expires_at: past(),
      }),
    ).toBe(false);
  });

  it('pro + expired → not pro', async () => {
    expect(
      await isPro({ ...base, subscription_plan: 'pro', subscription_status: 'expired' }),
    ).toBe(false);
  });

  it('pro + billing_issue within grace → pro (regression guard)', async () => {
    expect(
      await isPro({
        ...base,
        subscription_plan: 'pro',
        subscription_status: 'billing_issue',
        grace_period_expires_at: future(),
      }),
    ).toBe(true);
  });

  it('pro + billing_issue with expired grace → not pro', async () => {
    expect(
      await isPro({
        ...base,
        subscription_plan: 'pro',
        subscription_status: 'billing_issue',
        grace_period_expires_at: past(),
      }),
    ).toBe(false);
  });

  it('pro + billing_issue with no grace set → not pro', async () => {
    expect(
      await isPro({
        ...base,
        subscription_plan: 'pro',
        subscription_status: 'billing_issue',
        grace_period_expires_at: null,
      }),
    ).toBe(false);
  });
});
