import { useCallback } from 'react';
import { usePlacement, useUser } from 'expo-superwall';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { PAYWALL_PLACEMENTS } from '../services/paywall';
import { navigate } from '../navigation/navigationRef';

/**
 * Single entrypoint for Pro gating. Components read `isProUser` to decide whether
 * to render real content or UpgradeProCard, and call `openUpgrade` to trigger the
 * Free→Pro flow.
 *
 * Flow: the upgrade cards/teasers call `openUpgrade`, which routes to the
 * **PrePaywall** awareness screen first (to raise intent before the price).
 * The PrePaywall's CTA then calls `presentPaywall`, which opens the actual
 * Superwall paywall. Surfaces that are already a teaser (e.g. the one-time
 * TrialModal) skip the interstitial and call `presentPaywall` directly.
 *
 * The app runs Superwall in MANUAL purchase management mode (via
 * `CustomPurchaseControllerProvider` in App.tsx). In that mode Superwall holds
 * every paywall until we tell it the subscription status — so `presentPaywall`
 * sets it (mirroring the app's truth) right before registering the placement.
 */
export function useProFeature() {
  const isProUser = useSubscriptionStore((s) => s.isProUser);
  const plan = useSubscriptionStore((s) => s.plan);
  const status = useSubscriptionStore((s) => s.status);
  const daysRemainingInTrial = useSubscriptionStore((s) => s.daysRemainingInTrial);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);

  const { setSubscriptionStatus } = useUser();
  const { registerPlacement } = usePlacement();

  const presentPaywall = useCallback(async () => {
    try {
      const subStatus = isProUser
        ? { status: 'ACTIVE' as const, entitlements: [{ id: 'pro', type: 'SERVICE_LEVEL' as const }] }
        : { status: 'INACTIVE' as const };
      await setSubscriptionStatus(subStatus);

      await registerPlacement({ placement: PAYWALL_PLACEMENTS.UPGRADE_TAPPED });

      // Reconcile after the paywall closes (a purchase may have completed).
      await fetchSubscription();
    } catch (err) {
      console.warn('[useProFeature] presentPaywall failed:', err);
    }
  }, [isProUser, setSubscriptionStatus, registerPlacement, fetchSubscription]);

  // Cards/teasers → awareness interstitial first. The PrePaywall CTA opens the
  // real paywall via `presentPaywall`.
  const openUpgrade = useCallback(() => {
    navigate('PrePaywall');
  }, []);

  return {
    isProUser,
    isFree: !isProUser,
    plan,
    status,
    daysRemainingInTrial,
    openUpgrade,
    presentPaywall,
  };
}
