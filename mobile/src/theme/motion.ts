import { Easing, ReduceMotion } from 'react-native-reanimated';

export const motionDuration = {
  instant: 100,
  fast: 160,
  standard: 220,
  deliberate: 320,
  modal: 420,
} as const;

export const motionSpring = {
  press: {
    damping: 20,
    stiffness: 260,
    mass: 0.7,
    overshootClamping: true,
    reduceMotion: ReduceMotion.System,
  },
  layout: {
    damping: 20,
    stiffness: 180,
    mass: 0.9,
    reduceMotion: ReduceMotion.System,
  },
  celebrate: {
    damping: 14,
    stiffness: 210,
    mass: 0.8,
    reduceMotion: ReduceMotion.System,
  },
} as const;

export const motionScale = {
  button: 0.98,
  card: 0.985,
  icon: 0.94,
} as const;

export const motionOpacity = {
  pressed: 0.86,
  disabled: 0.48,
} as const;

export const navigationMotion = {
  card: motionDuration.standard,
  modal: motionDuration.deliberate,
} as const;

export const motionEasing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.bezier(0, 0, 0, 1),
  exit: Easing.bezier(0.3, 0, 1, 1),
} as const;

export type MotionDuration = keyof typeof motionDuration;
export type MotionScale = keyof typeof motionScale;

export function createTimingConfig(duration: number = motionDuration.standard) {
  return {
    duration,
    easing: motionEasing.standard,
    reduceMotion: ReduceMotion.System,
  };
}
