import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import * as Storage from '../utils/storage';
import type { ThemePreference } from '../theme/contracts';

const themePersistStorage = {
  getItem: (name: string) => Storage.getItemAsync(name),
  setItem: (name: string, value: string) => Storage.setItemAsync(name, value),
  removeItem: (name: string) => Storage.deleteItemAsync(name),
};

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
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
