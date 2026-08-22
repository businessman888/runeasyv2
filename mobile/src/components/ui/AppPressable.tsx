import React, { forwardRef, useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useMotionPreferences } from '../../hooks/useMotionPreferences';
import {
  motionScale,
  motionSpring,
  type MotionScale,
} from '../../theme/motion';
import { triggerHaptic, type HapticFeedback } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AppPressableStyle =
  | StyleProp<ViewStyle>
  | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);

export interface AppPressableProps
  extends Omit<PressableProps, 'style' | 'onPress' | 'onPressIn' | 'onPressOut'> {
  style?: AppPressableStyle;
  interactionScale?: MotionScale;
  hapticFeedback?: HapticFeedback;
  onPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
}

export const AppPressable = forwardRef<View, AppPressableProps>(
  function AppPressable(
    {
      accessibilityRole = 'button',
      accessibilityState,
      disabled = false,
      hapticFeedback = 'none',
      interactionScale = 'button',
      onPress,
      onPressIn,
      onPressOut,
      style,
      ...props
    },
    ref,
  ) {
    const scale = useSharedValue(1);
    const { reduceMotion } = useMotionPreferences();
    const isDisabled = disabled === true;

    useEffect(() => {
      if (!isDisabled) {
        return;
      }

      cancelAnimation(scale);
      scale.value = 1;
    }, [isDisabled, scale]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = useCallback(
      (event: GestureResponderEvent) => {
        if (isDisabled) {
          return;
        }

        scale.value = reduceMotion
          ? 1
          : withSpring(motionScale[interactionScale], motionSpring.press);
        onPressIn?.(event);
      },
      [interactionScale, isDisabled, onPressIn, reduceMotion, scale],
    );

    const handlePressOut = useCallback(
      (event: GestureResponderEvent) => {
        if (isDisabled) {
          return;
        }

        scale.value = reduceMotion ? 1 : withSpring(1, motionSpring.press);
        onPressOut?.(event);
      },
      [isDisabled, onPressOut, reduceMotion, scale],
    );

    const handlePress = useCallback(
      (event: GestureResponderEvent) => {
        if (isDisabled) {
          return;
        }

        void triggerHaptic(hapticFeedback);
        onPress?.(event);
      },
      [hapticFeedback, isDisabled, onPress],
    );

    const resolveStyle = useCallback(
      (state: PressableStateCallbackType) => [
        styles.minimumTouchTarget,
        typeof style === 'function' ? style(state) : style,
        animatedStyle,
      ],
      [animatedStyle, style],
    );

    return (
      <AnimatedPressable
        {...props}
        ref={ref}
        accessibilityRole={accessibilityRole}
        accessibilityState={{
          ...accessibilityState,
          disabled: isDisabled || accessibilityState?.disabled === true,
        }}
        disabled={isDisabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={resolveStyle}
      />
    );
  },
);

const styles = StyleSheet.create({
  minimumTouchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
});
