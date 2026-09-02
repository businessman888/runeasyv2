import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import * as Storage from '../utils/storage';
import type { ThemePreference } from '../theme/contracts';

const themePersistStorage = {
  getItem: (name: string) => Storage.getItemAsync(name),
  setItem: (name: string, value: string) => Storage.setItemAsync(name, value),
  removeItem: (name: string) => Storage.deleteItemAsync(name),
};

const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'dark', 'light', 'nebula'];

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

interface ThemeState {
  preference: ThemePreference;
  hasHydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'dark',
      hasHydrated: false,
      setPreference: (preference) => set({ preference }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'theme-preference',
      storage: createJSONStorage(() => themePersistStorage),
      partialize: ({ preference }) => ({ preference }),
      /**
       * Zustand's default merge trusts whatever is on disk. A preference written
       * by a newer build (or a corrupted value) would then flow into the theme
       * registry and the appearance UI as a name neither understands, leaving
       * the picker showing one thing and the app rendering another. Anything
       * unrecognized falls back to the app's default instead.
       */
      merge: (persisted, current) => {
        const stored = (persisted as { preference?: unknown } | undefined)?.preference;

        return {
          ...current,
          preference: isThemePreference(stored) ? stored : current.preference,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
