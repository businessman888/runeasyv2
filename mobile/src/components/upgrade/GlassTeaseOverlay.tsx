import React, { memo, type ReactNode } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, shadows, useThemeSubscription, createThemeStyles, getThemeBlurTint, getThemeGlassSheenColors } from '../../theme';
import { useProFeature } from '../../hooks/useProFeature';
import { AnimatedBorder } from './AnimatedBorder';

const TEASE_RADIUS = 20;

// Real frosted blur on Android needs expo-blur's experimental method
// (RenderEffect on API 31+); the default Android path barely blurs. We can use
// it safely now because the interactive layer sits ON TOP of the BlurView —
// taps never pass *through* the blur (the old touch regression came from taps
// falling through the blur to an outer Pressable). iOS ignores this prop and
// uses its native blur.
const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
  Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

const SHEEN_LOCATIONS = [0, 0.5, 1] as const;

export interface GlassTeaseOverlayProps {
  /** The locked content shown (non-interactively) behind the glass — a skeleton
   *  mockup that teases what Pro unlocks. */
  children: ReactNode;
  /** Content rendered on top of the glass (title + CTA, or a full UpgradeProCard). */
  overlay: ReactNode;
  /**
   * When true, the whole surface is a Pressable (on top of the blur) that fires
   * `openUpgrade`. Leave false when `overlay` is itself interactive (e.g. an
   * UpgradeProCard), to avoid nested pressables swallowing the tap.
   */
  pressable?: boolean;
  radius?: number;
  /** Blur strength. With the Android experimental method this is real frosted blur. */
  blurIntensity?: number;
  /** Dark veil over the mock. Keep it moderate so the blur stays visible. */
  veilColor?: string;
  /**
   * Static premium edge: a clean cyan hairline + soft neon glow. The default
   * "clean" look (replaces the traveling beam). Disable when a card floats on
   * top with its own border (e.g. the Calendar grid tease).
   */
  premiumBorder?: boolean;
  /** Traveling brand-color beam. Off by default; opt-in for a livelier surface. */
  showAnimatedBorder?: boolean;
  /** Override the static hairline color (defaults to the cyan glass hairline). */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
}

/**
 * Stacks a real frosted-glass blur + dark veil + sheen over a mockup, frames it
 * with a clean static cyan edge (or an animated beam), then floats CTA content
 * on top with a gentle fade-in. Shared by the Home workout teaser and the
 * Calendar teasers.
 *
 * Layer order is deliberate: the mockup + blur + veil + sheen are all
 * non-interactive and sit UNDER the overlay; the interactive layer (the
 * Pressable, or the caller's interactive overlay) is the topmost child, so taps
 * land on it directly instead of having to pass through the (touch-stealing)
 * Android blur surface.
 */
function GlassTeaseOverlayImpl({
  children,
  overlay,
  pressable = false,
  radius = TEASE_RADIUS,
  blurIntensity = 50,
  veilColor = colors.proGlassOverlay,
  premiumBorder = true,
  showAnimatedBorder = false,
  borderColor,
  style,
  overlayStyle,
}: GlassTeaseOverlayProps) {
  useThemeSubscription();
  const { openUpgrade } = useProFeature();

  // Non-interactive glass stack, under the overlay.
  const glassLayers = (
    <>
      {/* Locked mockup — never interactive. Gives the container its height. */}
      <View pointerEvents="none">{children}</View>

      {/* Real frosted blur (iOS native / Android RenderEffect). */}
      <BlurView
        intensity={blurIntensity}
        tint={getThemeBlurTint()}
        experimentalBlurMethod={ANDROID_BLUR_METHOD}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {/* Dark veil keeps overlay text readable; sheen adds glass depth. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: veilColor }]}
      />
      <LinearGradient
        colors={getThemeGlassSheenColors()}
        locations={SHEEN_LOCATIONS}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {/* Optional animated brand-colored border beam (non-interactive). */}
      {showAnimatedBorder && <AnimatedBorder radius={radius} borderWidth={1.5} />}
    </>
  );

  // CTA content — fades up on mount (UI thread). box-none lets taps reach the
  // Pressable (or the interactive overlay) instead of the wrapper.
  const fadedOverlay = (
    <Animated.View
      entering={FadeInDown.duration(300)}
      pointerEvents="box-none"
      style={[styles.overlayContent, overlayStyle]}
    >
      {overlay}
    </Animated.View>
  );

  return (
    <View
      style={[
        styles.container,
        { borderRadius: radius },
        premiumBorder && {
          borderWidth: 1,
          borderColor: borderColor ?? colors.proGlassBorderCyan,
          ...shadows.neon,
        },
        style,
      ]}
    >
      {glassLayers}

      {pressable ? (
        // Topmost layer: catches taps above the blur, so touch always works.
        <Pressable
          onPress={() => void openUpgrade()}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Desbloquear com o RunEasy Pro"
          accessibilityHint="Abre a tela de assinatura para desbloquear as features Pro"
        >
          {fadedOverlay}
        </Pressable>
      ) : (
        fadedOverlay
      )}
    </View>
  );
}

export const GlassTeaseOverlay = memo(GlassTeaseOverlayImpl);

const styles = createThemeStyles(() => ({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
}));

export default GlassTeaseOverlay;
