import React, { memo, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { StoryGradient } from './storyTheme';
import { semanticColors } from '../../theme/semanticColors';

interface AnimatedStoryBackgroundProps {
  gradient: StoryGradient;
  active: boolean;
}

/**
 * Fundo fullscreen nativo inspirado em shaders/mesh gradients.
 *
 * As referências do 21st.dev usam Three.js/GLSL ou Framer Motion, tecnologias
 * web que aumentariam muito o custo desta tela no mobile. Aqui a mesma leitura
 * visual nasce de gradientes e transforms na UI thread. O resultado continua
 * parametrizável por story, funciona offline e respeita Reduce Motion.
 */
export const AnimatedStoryBackground = memo(function AnimatedStoryBackground({
  gradient,
  active,
}: AnimatedStoryBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0.32);

  useEffect(() => {
    cancelAnimation(phase);

    if (!active || reduceMotion) {
      phase.value = 0.32;
      return;
    }

    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, {
        duration: gradient.motion === 'calm' ? 14000 : 9000,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );

    return () => cancelAnimation(phase);
  }, [active, gradient.motion, phase, reduceMotion]);

  const driftPrimary = useAnimatedStyle<ViewStyle>(() => ({
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.42, 0.68, 0.46]),
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [-width * 0.18, width * 0.12]) },
      { translateY: interpolate(phase.value, [0, 1], [-height * 0.04, height * 0.12]) },
      { scale: interpolate(phase.value, [0, 0.5, 1], [0.92, 1.12, 0.98]) },
      { rotate: `${interpolate(phase.value, [0, 1], [-8, 10])}deg` as `${number}deg` },
    ] as ViewStyle['transform'],
  }));

  const driftSecondary = useAnimatedStyle<ViewStyle>(() => ({
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.34, 0.18, 0.4]),
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [width * 0.18, -width * 0.16]) },
      { translateY: interpolate(phase.value, [0, 1], [height * 0.08, -height * 0.03]) },
      { scale: interpolate(phase.value, [0, 1], [1.1, 0.9]) },
      { rotate: `${interpolate(phase.value, [0, 1], [12, -12])}deg` as `${number}deg` },
    ] as ViewStyle['transform'],
  }));

  const groupMotion = useAnimatedStyle<ViewStyle>(() => ({
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.34, 0.56, 0.38]),
    transform: [
      { translateX: interpolate(phase.value, [0, 1], [-width * 0.08, width * 0.08]) },
      { translateY: interpolate(phase.value, [0, 1], [height * 0.03, -height * 0.04]) },
      { rotate: `${interpolate(phase.value, [0, 1], [-18, -8])}deg` as `${number}deg` },
      { scale: interpolate(phase.value, [0, 0.5, 1], [0.98, 1.06, 1]) },
    ] as ViewStyle['transform'],
  }));

  const ringMotion = useAnimatedStyle<ViewStyle>(() => ({
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.16, 0.38, 0.18]),
    transform: [
      { rotate: `${interpolate(phase.value, [0, 1], [-10, 16])}deg` as `${number}deg` },
      { scale: interpolate(phase.value, [0, 0.5, 1], [0.86, 1.08, 0.94]) },
    ] as ViewStyle['transform'],
  }));

  const accentSoft = alpha(gradient.accent, gradient.motion === 'calm' ? 0.22 : 0.34);
  const accentBright = alpha(gradient.accent, gradient.motion === 'calm' ? 0.32 : 0.52);
  const orbSize = Math.max(width, height * 0.58);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={gradient.colors}
        locations={[0, 0.52, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {(gradient.motion === 'aurora' || gradient.motion === 'calm') && (
        <>
          <Animated.View
            style={[
              styles.orb,
              {
                width: orbSize,
                height: orbSize * 0.72,
                left: -orbSize * 0.28,
                top: height * 0.04,
              },
              driftPrimary,
            ]}
          >
            <LinearGradient
              colors={['transparent', accentBright, 'transparent']}
              start={{ x: 0, y: 0.3 }}
              end={{ x: 1, y: 0.7 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.orb,
              {
                width: orbSize * 0.82,
                height: orbSize * 0.64,
                right: -orbSize * 0.3,
                bottom: height * 0.06,
              },
              driftSecondary,
            ]}
          >
            <LinearGradient
              colors={['transparent', accentSoft, 'transparent']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </>
      )}

      {gradient.motion === 'bars' && (
        <Animated.View style={[styles.bars, groupMotion]}>
          {BAR_WIDTHS.map((barWidth, index) => (
            <LinearGradient
              key={barWidth}
              colors={['transparent', alpha(gradient.accent, 0.5 - index * 0.045), 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[
                styles.bar,
                {
                  width: `${barWidth}%`,
                  marginLeft: index % 2 === 0 ? '-12%' : '8%',
                },
              ]}
            />
          ))}
        </Animated.View>
      )}

      {gradient.motion === 'orbit' && (
        <Animated.View
          style={[
            styles.ringGroup,
            { width: orbSize * 0.92, height: orbSize * 0.92 },
            ringMotion,
          ]}
        >
          <View style={[styles.ring, styles.ringOuter, { borderColor: accentSoft }]} />
          <View style={[styles.ring, styles.ringMiddle, { borderColor: accentBright }]} />
          <View style={[styles.ring, styles.ringInner, { backgroundColor: accentSoft }]} />
        </Animated.View>
      )}

      <LinearGradient
        colors={[semanticColors.overlayFaint, semanticColors.transparent, semanticColors.overlayMedium]}
        locations={[0, 0.46, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

const BAR_WIDTHS = [112, 88, 104, 74, 96, 82, 108] as const;

function alpha(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${opacity})`;
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 9999,
  },
  bars: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    gap: 22,
    transform: [{ rotate: '-14deg' }],
  },
  bar: {
    height: 34,
    borderRadius: 9999,
  },
  ringGroup: {
    position: 'absolute',
    alignSelf: 'center',
    top: '12%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
  },
  ringOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 42,
  },
  ringMiddle: {
    width: '64%',
    height: '64%',
    borderWidth: 18,
  },
  ringInner: {
    width: '26%',
    height: '26%',
  },
});
