/**
 * AnimatedBorder — a "border beam": a short, bright gradient segment that
 * travels continuously around the perimeter of its parent, on top of a faint
 * static cyan outline. Brand-colored (cyan → blue → violet). Inspired by the
 * 21st.dev Border Beam effect.
 *
 * Drop it as the last child of a rounded container with `overflow: 'hidden'`.
 * It fills the parent (absolute), is non-interactive, and measures itself via
 * onLayout so callers don't need to pass dimensions. Animation runs entirely
 * on the UI thread (reanimated), so it costs no JS frames.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { semanticColors } from '../../theme/semanticColors';
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface AnimatedBorderProps {
  /** Corner radius of the parent container. */
  radius?: number;
  /** Stroke width of the border. */
  borderWidth?: number;
  /** Full loop duration (ms). Lower = faster beam. */
  durationMs?: number;
  /** Beam length as a fraction of the perimeter (0–1). */
  beamFraction?: number;
}

function AnimatedBorderImpl({
  radius = 20,
  borderWidth = 1.5,
  durationMs = 3200,
  beamFraction = 0.18,
}: AnimatedBorderProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);

  // Inset the rect by half the stroke so the border sits fully inside the card.
  const inset = borderWidth / 2;
  const w = Math.max(0, size.width - borderWidth);
  const h = Math.max(0, size.height - borderWidth);
  const rx = Math.max(0, radius - inset);

  // Perimeter of a rounded rectangle: straight edges + 4 quarter-circle corners.
  const perimeter =
    w > 0 && h > 0 ? 2 * (w - 2 * rx) + 2 * (h - 2 * rx) + 2 * Math.PI * rx : 0;
  const beam = perimeter * beamFraction;

  useEffect(() => {
    if (perimeter <= 0) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [perimeter, durationMs, progress]);

  // Travel the dash around the path by shifting the offset across one perimeter.
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * perimeter,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {perimeter > 0 && (
        <Svg width={size.width} height={size.height} pointerEvents="none">
          <Defs>
            <LinearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={semanticColors.textSecondary} stopOpacity="0" />
              <Stop offset="0.5" stopColor={semanticColors.textPrimary} stopOpacity="1" />
              <Stop offset="0.8" stopColor={semanticColors.textSecondary} stopOpacity="1" />
              <Stop offset="1" stopColor={semanticColors.recovery} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>

          {/* Static faint outline — always visible. */}
          <Rect
            x={inset}
            y={inset}
            width={w}
            height={h}
            rx={rx}
            ry={rx}
            fill="none"
            stroke={semanticColors.borderSubtle}
            strokeWidth={borderWidth}
          />

          {/* Traveling beam. */}
          <AnimatedRect
            x={inset}
            y={inset}
            width={w}
            height={h}
            rx={rx}
            ry={rx}
            fill="none"
            stroke="url(#beamGrad)"
            strokeWidth={borderWidth}
            strokeLinecap="round"
            strokeDasharray={[beam, perimeter]}
            animatedProps={animatedProps}
          />
        </Svg>
      )}
    </View>
  );
}

export const AnimatedBorder = memo(AnimatedBorderImpl);

export default AnimatedBorder;
