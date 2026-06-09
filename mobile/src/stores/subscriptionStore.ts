/**
 * Subscription state — single source of truth for Free vs Pro gating.
 *
 * Hydrated from three places, in priority order:
 *   1. DevMenu override (__DEV__ only)
 *   2. GET /users/me/subscription (backend, populated by RevenueCat webhook)
 *   3. RevenueCat SDK customerInfo (push from SuperwallBridge)
 *
 * Components consume `isProUser` to decide whether to render real content or
 * UpgradeProCard.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { DEV_PLAN_OVERRIDE, type DevPlanOverride } from '../utils/devTools';
import { useDevMenuStore } from './devMenuStore';

/**
 * Persist adapter backed by SecureStore (native) / localStorage (web) via the
 * shared Storage util — same backing store as devMenuStore. Keeps the
 * last-known subscription tier across cold starts so the app renders Pro/Free
 * instantly instead of defaulting to Free until the backend fetch resolves.
 */
const subscriptionPersistStorage = {
  getItem: (name: string) => Storage.getItemAsync(name),
  setItem: (name: string, value: string) => Storage.setItemAsync(name, value),
  removeItem: (name: string) => Storage.deleteItemAsync(name),
};

export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'expired'
  | 'cancelled'
  | 'billing_issue';

interface BackendSubscriptionResponse {
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

interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isProUser: boolean;
  trialExpiresAt: string | null;
  subscriptionExpiresAt: string | null;
  daysRemainingInTrial: number;
  isLoading: boolean;
  lastFetchedAt: number | null;

  fetchSubscription: () => Promise<void>;
  setFromRevenueCat: (isPro: boolean) => void;
  reset: () => void;
}

function getDevOverride(): DevPlanOverride {
  if (!__DEV__) return null;
  return useDevMenuStore.getState().planOverride ?? DEV_PLAN_OVERRIDE;
}

function applyOverride(override: NonNullable<DevPlanOverride>): Partial<SubscriptionState> {
  if (override === 'pro') {
    return {
      plan: 'pro',
      status: 'active',
      isProUser: true,
      trialExpiresAt: null,
      subscriptionExpiresAt: null,
      daysRemainingInTrial: 0,
    };
  }
  if (override === 'trial') {
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return {
      plan: 'pro',
      status: 'trial',
      isProUser: true,
      trialExpiresAt: sevenDays,
      subscriptionExpiresAt: null,
      daysRemainingInTrial: 7,
    };
  }
  return {
    plan: 'free',
    status: 'active',
    isProUser: false,
    trialExpiresAt: null,
    subscriptionExpiresAt: null,
    daysRemainingInTrial: 0,
  };
}

const INITIAL_STATE: Pick<
  SubscriptionState,
  | 'plan'
  | 'status'
  | 'isProUser'
  | 'trialExpiresAt'
  | 'subscriptionExpiresAt'
  | 'daysRemainingInTrial'
  | 'isLoading'
  | 'lastFetchedAt'
> = {
  plan: 'free',
  status: 'active',
  isProUser: false,
  trialExpiresAt: null,
  subscriptionExpiresAt: null,
  daysRemainingInTrial: 0,
  isLoading: false,
  lastFetchedAt: null,
};

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
  ...INITIAL_STATE,

  fetchSubscription: async () => {
    // Dev override wins so the toggle works even when backend is online.
    const override = getDevOverride();
    if (override) {
      set({ ...applyOverride(override), lastFetchedAt: Date.now() });
      return;
    }

    const userId = await Storage.getItemAsync('user_id');
    if (!userId) {
      set({ ...INITIAL_STATE });
      return;
    }

    try {
      set({ isLoading: true });
      const response = await fetch(`${BASE_API_URL}/users/me/subscription`, {
        headers: { 'x-user-id': userId },
      });

      if (!response.ok) {
        // Backend missing the endpoint (e.g. local dev before migration) —
        // fall back to the SDK-derived isProUser already in state instead of
        // wiping it. Logged at warn so it's noticeable but non-fatal.
        console.warn(`[SubscriptionStore] GET /users/me/subscription failed: ${response.status}`);
        return;
      }

      const data = (await response.json()) as BackendSubscriptionResponse;
      set({
        plan: data.plan,
        status: data.status,
        isProUser: data.isPro,
        trialExpiresAt: data.trialExpiresAt,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
        daysRemainingInTrial: data.daysRemainingInTrial,
        lastFetchedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[SubscriptionStore] fetchSubscription error:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  setFromRevenueCat: (isPro: boolean) => {
    const override = getDevOverride();
    if (override) {
      set({ ...applyOverride(override) });
      return;
    }

    // Honor the SDK push: if it disagrees with the backend, the SDK has the
    // freshest signal. The next fetchSubscription will reconcile.
    set((prev) => ({
      ...prev,
      plan: isPro ? 'pro' : 'free',
      status: isPro ? (prev.status === 'trial' ? 'trial' : 'active') : 'expired',
      isProUser: isPro,
    }));
  },

  reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'subscription-storage',
      storage: createJSONStorage(() => subscriptionPersistStorage),
      // Persist only the resolved subscription data — never `isLoading`, which
      // is transient. On rehydrate the last-known `isProUser` becomes the
      // starting value (instead of `false`), so cold start shows the correct
      // tier immediately while `fetchSubscription` reconciles in the background.
      partialize: (state) => ({
        plan: state.plan,
        status: state.status,
        isProUser: state.isProUser,
        trialExpiresAt: state.trialExpiresAt,
        subscriptionExpiresAt: state.subscriptionExpiresAt,
        daysRemainingInTrial: state.daysRemainingInTrial,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
