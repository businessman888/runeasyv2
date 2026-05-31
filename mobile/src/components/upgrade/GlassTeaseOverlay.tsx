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
import { colors, spacing, shadows } from '../../theme';
import { useProFeature } from '../../hooks/useProFeature';
import { AnimatedBorder } from './AnimatedBorder';

const TEASE_RADIUS = 20;
// expo-blur barely blurs on Android (we drop experimentalBlurMethod because its
// SurfaceView eats touches), so a high intensity there just costs GPU for
// nothing — the dark veil + sheen carry the glass. Keep iOS rich.
const ANDROID_MAX_BLUR = 12;

// Subtle top-light → bottom-shade sheen that sells "frosted glass" depth,
// especially on Android where the real blur is weak.
const SHEEN_COLORS = [
  'rgba(255, 255, 255, 0.05)',
  'rgba(255, 255, 255, 0)',
  'rgba(0, 0, 0, 0.10)',
] as const;
const SHEEN_LOCATIONS = [0, 0.5, 1] as const;

export interface GlassTeaseOverlayProps {
  /** The locked content shown (non-interactively) behind the glass — a skeleton
   *  mockup that teases what Pro unlocks. */
  children: ReactNode;
  /** Content rendered on top of the glass (title + CTA, or a full UpgradeProCard). */
  overlay: ReactNode;
  /**
   * When true, the whole surface is a Pressable that fires `openUpgrade`.
   * Leave false when `overlay` is itself interactive (e.g. an UpgradeProCard),
   * to avoid nested pressables swallowing the tap.
   */
  pressable?: boolean;
  radius?: number;
  blurIntensity?: number;
  /** Dark veil over the mock. Bump opacity for stronger "liquid glass". */
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
 * Stacks a blurred "liquid glass" veil + glass sheen over a mockup, frames it
 * with a clean static cyan edge (or an animated beam), then floats CTA content
 * on top with a gentle fade-in. Shared by the Home workout teaser and the
 * Calendar teasers. On Android the BlurView barely blurs, so the veil + sheen
 * carry the glass effect there.
 */
function GlassTeaseOverlayImpl({
  children,
  overlay,
  pressable = false,
  radius = TEASE_RADIUS,
  blurIntensity = 25,
  veilColor = colors.proGlassOverlay,
  premiumBorder = true,
  showAnimatedBorder = false,
  borderColor,
  style,
  overlayStyle,
}: GlassTeaseOverlayProps) {
  const { openUpgrade } = useProFeature();

  const resolvedBlur =
    Platform.OS === 'android' ? Math.min(blurIntensity, ANDROID_MAX_BLUR) : blurIntensity;

  const inner = (
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
      {/* Locked mockup — never interactive. */}
      <View pointerEvents="none">{children}</View>

      {/* Liquid glass: blur (iOS) + dark veil (carries Android) + sheen. */}
      <BlurView
        intensity={resolvedBlur}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: veilColor }]}
      />
      <LinearGradient
        colors={SHEEN_COLORS}
        locations={SHEEN_LOCATIONS}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {/* Optional animated brand-colored border beam (non-interactive). */}
      {showAnimatedBorder && <AnimatedBorder radius={radius} borderWidth={1.5} />}

      {/* CTA content — box-none lets taps reach an interactive overlay (or the
          outer Pressable) without the wrapper capturing them itself. Fades up
          on mount for a premium entrance (UI thread). */}
      <Animated.View
        entering={FadeInDown.duration(300)}
        pointerEvents="box-none"
        style={[styles.overlayContent, overlayStyle]}
      >
        {overlay}
      </Animated.View>
    </View>
  );

  if (pressable) {
    return (
      <Pressable
        onPress={() => void openUpgrade()}
        accessibilityRole="button"
        accessibilityLabel="Desbloquear com o RunEasy Pro"
        accessibilityHint="Abre a tela de assinatura para desbloquear as features Pro"
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

export const GlassTeaseOverlay = memo(GlassTeaseOverlayImpl);

const styles = StyleSheet.create({
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
});

export default GlassTeaseOverlay;
