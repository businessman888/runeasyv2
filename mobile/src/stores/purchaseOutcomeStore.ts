/**
 * Last purchase/restore outcome reported by the Superwall custom purchase
 * controller (App.tsx). In-memory only (no persistence) — mirrors the
 * trialModalStore pattern. Lets call sites distinguish "user closed the paywall
 * to stay Free" from "the purchase actually failed", instead of silently
 * dumping everyone into Free.
 */

import { create } from 'zustand';

export type PurchaseOutcome =
  | 'purchased'
  | 'cancelled'
  | 'failed'
  | 'restored'
  | 'pending'
  | null;

interface PurchaseOutcomeState {
  lastOutcome: PurchaseOutcome;
  setOutcome: (outcome: PurchaseOutcome) => void;
  reset: () => void;
}

export const usePurchaseOutcomeStore = create<PurchaseOutcomeState>((set) => ({
  lastOutcome: null,
  setOutcome: (outcome) => set({ lastOutcome: outcome }),
  reset: () => set({ lastOutcome: null }),
}));
