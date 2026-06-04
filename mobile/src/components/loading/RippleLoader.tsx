/**
 * RippleLoader — concentric "ripple" rings that pulse outward-in, on-brand cyan.
 *
 * Faithful RN port of the reference web component: 8 nested rings (inset 5% each),
 * border opacity fading toward the center, gentle staggered pulse. Runs entirely
 * on the UI thread (reanimated worklets) like AnimatedBorder, so it costs no JS
 * frames. Purely decorative — hidden from accessibility (the overlay owns the
 * label). Respects the OS "reduce motion" setting (static rings, no pulse).
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const RING_COUNT = 8;
const STAGGER_MS = 150; // matches the reference's i*0.15s
const HALF_DURATION_MS = 1000; // 2s full pulse (up + down)

interface RingProps {
  index: number;
  size: number;
  reducedMotion: boolean;
}

const Ring = memo(({ index, size, reducedMotion }: RingProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withDelay(
      index * STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: HALF_DURATION_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, {
            duration: HALF_DURATION_MS,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reducedMotion, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + progress.value * 0.08 }], // 0.92 → 1.0
    opacity: 0.45 + progress.value * 0.55, // 0.45 → 1.0
  }));

  const inset = index * size * 0.05;
  // Outer rings brighter, inner fainter — mirrors the reference's fading border.
  const ringStyle: ViewStyle = {
    position: 'absolute',
    top: inset,
    left: inset,
    right: inset,
    bottom: inset,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: `rgba(0, 212, 255, ${(0.7 - index * 0.075).toFixed(3)})`,
    backgroundColor: 'rgba(0, 212, 255, 0.04)',
  };

  if (reducedMotion) {
    return <View pointerEvents="none" style={[ringStyle, { opacity: 0.6 }]} />;
  }
  return <Animated.View pointerEvents="none" style={[ringStyle, animatedStyle]} />;
});
Ring.displayName = 'RippleLoaderRing';

export interface RippleLoaderProps {
  /** Width/height of the square loader. Default 220. */
  size?: number;
}

function RippleLoaderImpl({ size = 220 }: RippleLoaderProps) {
  const reducedMotion = useReducedMotion();
  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <Ring key={i} index={i} size={size} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

export const RippleLoader = memo(RippleLoaderImpl);

export default RippleLoader;
