/**
 * Shared "Treinos × Atividades" tab selection.
 *
 * A single global scope drives BOTH the Home and Calendar screens so the user
 * sees a consistent view: switching to "Atividades" on Home opens the Calendar
 * on "Atividades" too. Persisted via the cross-platform Storage util so the
 * choice survives reloads. Default is 'plan' (matches the Figma "Default"
 * variant where "Treinos" is active).
 */

import { create } from 'zustand';
import * as Storage from '../utils/storage';

export type WorkoutScope = 'plan' | 'activity';

const STORAGE_KEY = 'workout_scope_tab';

interface WorkoutScopeState {
    scope: WorkoutScope;
    hydrated: boolean;

    setScope: (scope: WorkoutScope) => Promise<void>;
    hydrate: () => Promise<void>;
}

export const useWorkoutScopeStore = create<WorkoutScopeState>((set) => ({
    scope: 'plan',
    hydrated: false,

    setScope: async (scope) => {
        set({ scope });
        await Storage.setItemAsync(STORAGE_KEY, scope);
    },

    hydrate: async () => {
        const raw = await Storage.getItemAsync(STORAGE_KEY);
        const scope: WorkoutScope = raw === 'activity' ? 'activity' : 'plan';
        set({ scope, hydrated: true });
    },
}));
