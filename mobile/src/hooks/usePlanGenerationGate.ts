/**
 * usePlanGenerationGate — single source of truth for the "plan is generating"
 * lock overlay, shared by Home and Calendar.
 *
 * Derives state from `trainingStore.generationStatus` (NOT from the client's
 * Pro flag) so the overlay shows whenever the backend has a plan generating —
 * even if the client's subscription hasn't refreshed to Pro yet (the webhook
 * path). Polls the plan status while the screen is focused and generating, then
 * refreshes the screen's data on completion via the `onComplete` callback.
 *
 * Polling is gated by `useIsFocused` so the two always-mounted tabs don't poll
 * at the same time.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useTrainingStore } from '../stores/trainingStore';
import { useOnboardingStore } from '../stores/onboardingStore';

const POLL_MS = 3000;

interface PlanGenerationGateOptions {
  /** Called once when generation finishes, so the screen can refetch its data. */
  onComplete?: () => void;
}

export function usePlanGenerationGate(options?: PlanGenerationGateOptions) {
  const isFocused = useIsFocused();
  const generationStatus = useTrainingStore((s) => s.generationStatus);
  const planId = useTrainingStore((s) => s.plan?.id);
  const fetchPlan = useTrainingStore((s) => s.fetchPlan);
  const checkPlanStatus = useTrainingStore((s) => s.checkPlanStatus);
  const triggerPlanGeneration = useOnboardingStore((s) => s.triggerPlanGeneration);

  const isGenerating = generationStatus === 'generating';
  const isFailed = generationStatus === 'failed';

  const onCompleteRef = useRef(options?.onComplete);
  onCompleteRef.current = options?.onComplete;

  // Refresh status whenever the screen gains focus.
  useEffect(() => {
    if (isFocused) void fetchPlan();
  }, [isFocused, fetchPlan]);

  // Poll while focused + generating. Effect cleanup stops the interval when
  // generation ends (isGenerating flips) or the screen blurs.
  useEffect(() => {
    if (!isFocused || !isGenerating || !planId) return;

    const id = setInterval(() => {
      void (async () => {
        const complete = await checkPlanStatus(planId);
        if (complete) onCompleteRef.current?.();
      })();
    }, POLL_MS);

    return () => clearInterval(id);
  }, [isFocused, isGenerating, planId, checkPlanStatus]);

  // Re-trigger generation after a failure, then refresh status so the overlay
  // returns to the generating state.
  const retry = useCallback(async () => {
    await triggerPlanGeneration();
    await fetchPlan();
  }, [triggerPlanGeneration, fetchPlan]);

  return { isGenerating, isFailed, retry };
}
