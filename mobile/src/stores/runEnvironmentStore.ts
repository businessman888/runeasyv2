/**
 * Controls the "Where are you running?" bottom-sheet that appears between
 * every "Iniciar treino" CTA and the actual Running/TreadmillSetup screens.
 *
 * The modal is mounted once at the root (AppNavigator) and any screen can
 * trigger it via {@link useStartWorkoutFlow}. The pending navigation params
 * are stored here so the modal can route the user to the right next screen
 * after they pick outdoor vs treadmill.
 */

import { create } from 'zustand';

/**
 * Mirrors the params currently accepted by the `Running` route, plus the
 * extras needed to forward through `TreadmillSetup` → `Running` for the
 * treadmill flow. Anything we add here must also be passed through both
 * sides of the fork.
 */
export interface PendingRunParams {
  workoutId?: string;
  dayLabel?: string;
  title?: string;
  workoutBlocks?: any[];
  mode: 'planned' | 'manual' | 'free';
  targetPaceSeconds?: number;
  targetDistanceKm?: number;
}

interface RunEnvironmentState {
  visible: boolean;
  pendingParams: PendingRunParams | null;
  open: (params: PendingRunParams) => void;
  close: () => void;
}

export const useRunEnvironmentStore = create<RunEnvironmentState>((set) => ({
  visible: false,
  pendingParams: null,
  open: (params) => set({ visible: true, pendingParams: params }),
  close: () => set({ visible: false }),
}));
