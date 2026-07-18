/**
 * Preferência do coach de áudio — SÓ a vontade do usuário ("quero usar o coach").
 * NÃO concede direito a nada: o entitlement (Pro) é verificado no ponto de disparo
 * pelo orquestrador. Ver docs/design-coach-audio.md §Preferência vs. Direito.
 *
 * Persiste via SecureStore (espelhando subscriptionStore) e ESPELHA em MMKV
 * (`coach_enabled`) para o orquestrador ler síncrono no background/headless.
 *
 * Default: OFF (opt-in) — voz surpresa é pior que o usuário habilitar.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import * as Storage from '../utils/storage';
import { COACH_MMKV } from '../services/coach/coachConfig';

// Mesma storage da locationTask (mesmo id) — espelho síncrono para o background.
const mmkv = createMMKV({ id: 'running-tracking-storage' });

const coachPersistStorage = {
  getItem: (name: string) => Storage.getItemAsync(name),
  setItem: (name: string, value: string) => Storage.setItemAsync(name, value),
  removeItem: (name: string) => Storage.deleteItemAsync(name),
};

interface CoachState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggle: () => void;
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set, get) => ({
      enabled: false, // default OFF (opt-in)
      setEnabled: (v: boolean) => {
        mmkv.set(COACH_MMKV.enabled, v); // espelho p/ o orquestrador (background)
        set({ enabled: v });
      },
      toggle: () => get().setEnabled(!get().enabled),
    }),
    {
      name: 'coach-preference',
      storage: createJSONStorage(() => coachPersistStorage),
      partialize: (s) => ({ enabled: s.enabled }),
      onRehydrateStorage: () => (state) => {
        // Cold start: reflete a preferência persistida no MMKV antes de qualquer corrida.
        mmkv.set(COACH_MMKV.enabled, state?.enabled ?? false);
      },
    },
  ),
);
