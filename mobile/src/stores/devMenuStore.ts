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
const MOCK_TREADMILL_KEY = 'dev_mock_treadmill';

interface DevMenuState {
  planOverride: DevPlanOverride;
  mockTreadmillEnabled: boolean;
  hydrated: boolean;

  setPlanOverride: (value: DevPlanOverride) => Promise<void>;
  setMockTreadmillEnabled: (enabled: boolean) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useDevMenuStore = create<DevMenuState>((set) => ({
  planOverride: null,
  mockTreadmillEnabled: false,
  hydrated: false,

  setPlanOverride: async (value) => {
    set({ planOverride: value });
    if (value === null) {
      await Storage.deleteItemAsync(STORAGE_KEY);
    } else {
      await Storage.setItemAsync(STORAGE_KEY, value);
    }
  },

  setMockTreadmillEnabled: async (enabled) => {
    set({ mockTreadmillEnabled: enabled });
    if (enabled) {
      await Storage.setItemAsync(MOCK_TREADMILL_KEY, '1');
    } else {
      await Storage.deleteItemAsync(MOCK_TREADMILL_KEY);
    }
  },

  hydrate: async () => {
    const raw = await Storage.getItemAsync(STORAGE_KEY);
    const value = raw === 'free' || raw === 'pro' || raw === 'trial' ? raw : null;
    const mock = await Storage.getItemAsync(MOCK_TREADMILL_KEY);
    set({
      planOverride: value,
      mockTreadmillEnabled: mock === '1',
      hydrated: true,
    });
  },
}));
