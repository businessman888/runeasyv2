import { useCallback } from 'react';
import { usePlacement } from 'expo-superwall';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { PAYWALL_PLACEMENTS } from '../services/paywall';

/**
 * Single entrypoint for Pro gating. Components call `isProUser` to decide
 * whether to render real content or UpgradeProCard, and `openUpgrade` to
 * trigger the Superwall paywall with the `upgrade_tapped` placement.
 *
 * Configure the `upgrade_tapped` placement in the Superwall dashboard. If
 * the placement isn't configured, the call resolves silently — fine for dev
 * but visible as a warning in console.
 */
export function useProFeature() {
  const isProUser = useSubscriptionStore((s) => s.isProUser);
  const plan = useSubscriptionStore((s) => s.plan);
  const status = useSubscriptionStore((s) => s.status);
  const daysRemainingInTrial = useSubscriptionStore((s) => s.daysRemainingInTrial);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const { registerPlacement } = usePlacement();

  const openUpgrade = useCallback(async () => {
    try {
      await registerPlacement({ placement: PAYWALL_PLACEMENTS.UPGRADE_TAPPED });
      // Reconcile after paywall closes (purchase may have completed)
      await fetchSubscription();
    } catch (err) {
      console.warn('[useProFeature] openUpgrade failed:', err);
    }
  }, [registerPlacement, fetchSubscription]);

  return {
    isProUser,
    isFree: !isProUser,
    plan,
    status,
    daysRemainingInTrial,
    openUpgrade,
  };
}
