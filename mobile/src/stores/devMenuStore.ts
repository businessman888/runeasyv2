/**
 * Runtime override for plan/subscription state, persisted via SecureStore
 * so it survives reloads but never ships to production (the store is only
 * consulted inside __DEV__ gates).
 *
 * Toggled from DevMenuScreen and read by subscriptionStore.
 */

import { create } from 'zustand';
import * as Storage from '../utils/storage';
import type { DevPlanOverride } from '../utils/devTools';

const STORAGE_KEY = 'dev_plan_override';

interface DevMenuState {
  planOverride: DevPlanOverride;
  hydrated: boolean;

  setPlanOverride: (value: DevPlanOverride) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useDevMenuStore = create<DevMenuState>((set) => ({
  planOverride: null,
  hydrated: false,

  setPlanOverride: async (value) => {
    set({ planOverride: value });
    if (value === null) {
      await Storage.deleteItemAsync(STORAGE_KEY);
    } else {
      await Storage.setItemAsync(STORAGE_KEY, value);
    }
  },

  hydrate: async () => {
    const raw = await Storage.getItemAsync(STORAGE_KEY);
    const value = raw === 'free' || raw === 'pro' || raw === 'trial' ? raw : null;
    set({ planOverride: value, hydrated: true });
  },
}));
