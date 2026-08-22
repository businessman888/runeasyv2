import { useCallback, useMemo } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

export interface MotionPreferences {
  reduceMotion: boolean;
  animationsEnabled: boolean;
  resolveDuration: (duration: number, reducedDuration?: number) => number;
}

export function useMotionPreferences(): MotionPreferences {
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = systemReduceMotion === true;

  const resolveDuration = useCallback(
    (duration: number, reducedDuration = 0) =>
      reduceMotion ? reducedDuration : duration,
    [reduceMotion],
  );

  return useMemo(
    () => ({
      reduceMotion,
      animationsEnabled: !reduceMotion,
      resolveDuration,
    }),
    [reduceMotion, resolveDuration],
  );
}
