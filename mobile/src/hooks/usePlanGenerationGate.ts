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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTrainingStore } from '../stores/trainingStore';

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
  const retryPlanGeneration = useTrainingStore((s) => s.retryPlanGeneration);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInFlight = useRef(false);

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

  // Retry only the failed plan and the goal already authorized for it.
  const retry = useCallback(async () => {
    if (!planId || !isFailed || retryInFlight.current) return;
    retryInFlight.current = true;
    setIsRetrying(true);
    try {
      await retryPlanGeneration(planId);
    } catch (error) {
      Alert.alert('Não foi possível retomar o plano', error instanceof Error
        ? error.message : 'Tente novamente em instantes.');
    } finally {
      retryInFlight.current = false;
      setIsRetrying(false);
    }
  }, [planId, isFailed, retryPlanGeneration]);

  return { isGenerating, isFailed, isRetrying, retry };
}
