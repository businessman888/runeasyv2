/**
 * Drives the "Aprofundar com o coach" section state machine (the 4 visual states
 * in spec-visual-briefing-estados.md):
 *
 *   loading   → checking the backend for a saved briefing
 *   empty     → Estado 1: no briefing yet, show the "+" prompt
 *   generating→ Estado 2: POST in flight (honeycomb loader)
 *   revealing → Estado 3: response arrived, typing it out
 *   done      → Estado 4 (after a fresh generation)
 *   persisted → Estado 4 (loaded directly — never re-calls the AI)
 *
 * The backend GET is idempotent and never generates; POST is Pro-gated. The
 * component decides whether to call `generate()` (Pro) or open the paywall (Free).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getWorkoutBriefing,
    generateWorkoutBriefing,
    type WorkoutBriefing,
} from '../services/briefingApi';

export type BriefingPhase =
    | 'loading'
    | 'empty'
    | 'generating'
    | 'revealing'
    | 'done'
    | 'persisted';

export function useWorkoutBriefing(workoutId: string | undefined) {
    const [phase, setPhase] = useState<BriefingPhase>('loading');
    const [briefing, setBriefing] = useState<WorkoutBriefing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // On load: check for a saved briefing without triggering generation.
    useEffect(() => {
        if (!workoutId) {
            setPhase('empty');
            return;
        }
        let cancelled = false;
        setPhase('loading');
        getWorkoutBriefing(workoutId)
            .then((existing) => {
                if (cancelled) return;
                if (existing) {
                    setBriefing(existing);
                    setPhase('persisted');
                } else {
                    setPhase('empty');
                }
            })
            .catch(() => {
                // Graceful: treat a failed check as "no briefing" so the user can
                // still try to generate one.
                if (!cancelled) setPhase('empty');
            });
        return () => {
            cancelled = true;
        };
    }, [workoutId]);

    const generate = useCallback(async () => {
        if (!workoutId) return;
        setError(null);
        setPhase('generating');
        try {
            const result = await generateWorkoutBriefing(workoutId);
            if (!mounted.current) return;
            setBriefing(result);
            setPhase('revealing');
        } catch (e: any) {
            if (!mounted.current) return;
            setError(e?.message ?? 'Erro ao gerar briefing');
            setPhase('empty');
            throw e;
        }
    }, [workoutId]);

    // Called by the component when the typing reveal finishes.
    const onRevealComplete = useCallback(() => {
        setPhase('done');
    }, []);

    return { phase, briefing, error, generate, onRevealComplete };
}
