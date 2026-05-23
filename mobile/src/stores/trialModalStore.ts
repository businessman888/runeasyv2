/**
 * One-time "Iniciar Teste Grátis" promo modal — session scope.
 *
 * In-memory only (no persistence): the flag resets on every cold start, so the
 * modal shows once per app open. The Calendar and Profile (Settings) screens
 * both call `show()` on focus for Free users; `shownThisSession` makes it
 * idempotent so only the first eligible focus this session opens it.
 */

import { create } from 'zustand';

interface TrialModalState {
    visible: boolean;
    shownThisSession: boolean;

    /** Open the modal once per session (no-op if already shown). */
    show: () => void;
    hide: () => void;
}

export const useTrialModalStore = create<TrialModalState>((set, get) => ({
    visible: false,
    shownThisSession: false,

    show: () => {
        if (get().shownThisSession) return;
        set({ visible: true, shownThisSession: true });
    },
    hide: () => set({ visible: false }),
}));
