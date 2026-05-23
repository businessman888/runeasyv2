import React, { memo, type ReactNode } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing } from '../../theme';
import { useProFeature } from '../../hooks/useProFeature';
import { AnimatedBorder } from './AnimatedBorder';

const TEASE_RADIUS = 20;

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
  /** Traveling brand-color beam. Disable to keep the surface clean/static. */
  showAnimatedBorder?: boolean;
  /** Optional static hairline border (e.g. a light glass gray). */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
}

/**
 * Stacks a blurred "liquid glass" veil + animated brand border over a mockup,
 * then floats CTA content on top. Shared by the Home workout teaser and the
 * Calendar teasers. On Android the BlurView barely blurs (we deliberately drop
 * `experimentalBlurMethod` because its SurfaceView eats touches), so the dark
 * veil carries the glass effect there.
 */
function GlassTeaseOverlayImpl({
  children,
  overlay,
  pressable = false,
  radius = TEASE_RADIUS,
  blurIntensity = 25,
  veilColor = colors.proGlassOverlay,
  showAnimatedBorder = true,
  borderColor,
  style,
  overlayStyle,
}: GlassTeaseOverlayProps) {
  const { openUpgrade } = useProFeature();

  const inner = (
    <View
      style={[
        styles.container,
        { borderRadius: radius },
        borderColor ? { borderWidth: 1, borderColor } : null,
        style,
      ]}
    >
      {/* Locked mockup — never interactive. */}
      <View pointerEvents="none">{children}</View>

      {/* Liquid glass: blur (iOS) + dark veil (carries Android). */}
      <BlurView
        intensity={blurIntensity}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: veilColor }]}
      />

      {/* Animated brand-colored border beam (non-interactive). */}
      {showAnimatedBorder && <AnimatedBorder radius={radius} borderWidth={1.5} />}

      {/* CTA content — box-none lets taps reach an interactive overlay (or the
          outer Pressable) without the wrapper capturing them itself. */}
      <View pointerEvents="box-none" style={[styles.overlayContent, overlayStyle]}>
        {overlay}
      </View>
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
