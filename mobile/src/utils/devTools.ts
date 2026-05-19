/**
 * Dev-only utilities for testing Free vs Pro flows in development and EAS
 * preview builds. Everything here is no-op in production via __DEV__ gates.
 *
 * The Superwall paywall runs in sandbox mode during dev/preview and passes
 * users through as Pro, which makes it impossible to exercise the Free
 * experience without an override. This module is the only escape hatch.
 */

import Constants from 'expo-constants';

export type DevPlanOverride = 'free' | 'pro' | 'trial' | null;

/**
 * True when running under Metro (`__DEV__`) OR an EAS preview build.
 * Preview detection relies on the `buildProfile` value set in app.config.
 */
export const IS_DEV: boolean =
  __DEV__ ||
  (Constants.expoConfig?.extra as { buildProfile?: string } | undefined)?.buildProfile === 'preview';

/**
 * Hardcoded fallback. Set to 'free' / 'pro' / 'trial' temporarily to test
 * without opening the DevMenu. MUST be left as null when committing.
 */
export const DEV_PLAN_OVERRIDE: DevPlanOverride = null;
