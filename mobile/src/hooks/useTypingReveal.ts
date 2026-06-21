/**
 * Client-side "typing" reveal. The backend returns the full briefing text in a
 * single response; this hook reveals it character-by-character for a chat-like
 * effect — no real streaming involved.
 *
 * Respects the platform "Reduce Motion" setting: when enabled, the full text is
 * shown immediately (no per-character animation).
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

interface Options {
    /** Start revealing only when true (e.g. once the response has arrived). */
    enabled: boolean;
    /** Delay between characters in ms (default ~28ms per the visual spec). */
    speedMs?: number;
    /** Called once the full text has been revealed. */
    onDone?: () => void;
}

export function useTypingReveal(
    fullText: string,
    { enabled, speedMs = 28, onDone }: Options,
) {
    const [displayed, setDisplayed] = useState('');
    const [isRevealing, setIsRevealing] = useState(false);
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    useEffect(() => {
        if (!enabled || !fullText) {
            setDisplayed('');
            setIsRevealing(false);
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const run = async () => {
            const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(
                () => false,
            );

            if (reduceMotion) {
                setDisplayed(fullText);
                setIsRevealing(false);
                onDoneRef.current?.();
                return;
            }

            setIsRevealing(true);
            let i = 0;
            const tick = () => {
                if (cancelled) return;
                i += 1;
                setDisplayed(fullText.slice(0, i));
                if (i >= fullText.length) {
                    setIsRevealing(false);
                    onDoneRef.current?.();
                    return;
                }
                timer = setTimeout(tick, speedMs);
            };
            tick();
        };

        void run();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [fullText, enabled, speedMs]);

    return { displayed, isRevealing };
}
