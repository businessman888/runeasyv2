/**
 * Centralized "start a run" entry point.
 *
 * Every CTA in the app that previously navigated directly to the `Running`
 * screen (HomeScreen, CalendarScreen, ManualWorkoutConfig, WeekDetail) now
 * funnels through this hook so we can show the environment picker bottom
 * sheet (outdoor vs treadmill) before deciding which screen to open.
 *
 * The actual modal is rendered once at the root (AppNavigator). It reads
 * the pending params from `useRunEnvironmentStore` and triggers the
 * appropriate navigation when the user picks an environment.
 */

import { useCallback } from 'react';
import {
  useRunEnvironmentStore,
  PendingRunParams,
} from '../stores/runEnvironmentStore';

export function useStartWorkoutFlow() {
  const openEnvironmentPicker = useRunEnvironmentStore((s) => s.open);

  const startRun = useCallback(
    (params: PendingRunParams) => {
      openEnvironmentPicker(params);
    },
    [openEnvironmentPicker],
  );

  return { startRun };
}
