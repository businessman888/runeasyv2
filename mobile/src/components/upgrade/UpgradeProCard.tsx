import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ImageBackground,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, fonts, shadows } from '../../theme';
import { useProFeature } from '../../hooks/useProFeature';
import { AnimatedBorder } from './AnimatedBorder';
import { ProCtaButton } from './ProCtaButton';

const BG_IMAGE = require('../../assets/images/bgCardUpToPlan.png');
const CARD_RADIUS = 20;
const CYAN = colors.primary;

export type UpgradeProCardVariant = 'compact' | 'medium' | 'fullscreen';

export interface UpgradeProCardProps {
  variant: UpgradeProCardVariant;
  /** Hero line. Defaults to the trial CTA copy. */
  priceLabel?: string;
  /**
   * How the hero line reads: `'price'` (default) is the big centered trial
   * hook; `'headline'` is a sentence-style title (smaller, looser leading,
   * wraps freely) used by the contextual placements.
   */
  heroVariant?: 'price' | 'headline';
  /** Context-specific value line under the price (per placement). */
  tagline?: string;
  /** Value-prop bullets — rendered on medium/fullscreen only. */
  bullets?: string[];
  ctaLabel?: string;
  recommendedLabel?: string;
  /** Show the "Pro" label + "Recomendado" badge row. Hide for headline cards. */
  showHeader?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function UpgradeProCardImpl({
  variant,
  priceLabel = 'Inicie seu teste grátis',
  heroVariant = 'price',
  tagline,
  bullets,
  ctaLabel = 'Upgrade to Pro',
  recommendedLabel = 'Recomendado',
  showHeader = true,
  onPress,
  style,
}: UpgradeProCardProps) {
  const { openUpgrade } = useProFeature();

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    void openUpgrade();
  }, [onPress, openUpgrade]);

  const isCompact = variant === 'compact';
  const isHeadline = heroVariant === 'headline';
  const showBullets = variant !== 'compact' && !!bullets && bullets.length > 0;
  const accessibilityLabel = `${ctaLabel}. Pro, ${priceLabel}${tagline ? '. ' + tagline : ''}`;

  const inner = (
    <ImageBackground
      source={BG_IMAGE}
      resizeMode="cover"
      style={[
        styles.cardBase,
        isCompact && styles.cardCompact,
        // Headline cards fit their content (no fixed minHeight) so they don't
        // float with disproportionate empty space.
        variant === 'medium' && !isHeadline && styles.cardMedium,
        variant === 'fullscreen' && styles.cardFullscreen,
      ]}
      imageStyle={styles.bgImage}
    >
      {/* Liquid glass: blur (iOS) + dark veil. NOTE: Android's
          experimentalBlurMethod="dimezisBlurView" was REMOVED — its native
          SurfaceView intercepts touches regardless of z-order/pointerEvents,
          which killed taps on the whole card. iOS keeps real blur; Android
          relies on the tint + veil below. */}
      <BlurView
        intensity={25}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassVeil]} />

      {/* Animated brand-colored border beam — rendered BEFORE content so the
          transparent content layer stays on top for touch (the SVG overlay
          would otherwise swallow taps on Android). Non-interactive. */}
      <AnimatedBorder radius={CARD_RADIUS} borderWidth={1.5} />

      <View style={styles.content}>
        {/* Header: Pro + Recomendado pill */}
        {showHeader && (
          <View style={styles.headerRow}>
            <Text style={[styles.proLabel, isCompact && styles.proLabelCompact]}>Pro</Text>
            <View style={styles.recommendedPill}>
              <MaterialCommunityIcons name="fire" size={14} color={colors.backgroundLight} />
              <Text style={styles.recommendedText}>{recommendedLabel}</Text>
            </View>
          </View>
        )}

        {/* Hero price / headline */}
        <Text
          style={[
            styles.price,
            isCompact && styles.priceCompact,
            isHeadline && styles.priceHeadline,
          ]}
        >
          {priceLabel}
        </Text>

        {/* Context tagline */}
        {tagline && (
          <Text
            style={[styles.tagline, isCompact && styles.taglineCompact]}
            numberOfLines={isCompact ? 2 : 3}
          >
            {tagline}
          </Text>
        )}

        {/* Divider + bullets (medium / fullscreen) */}
        {showBullets && (
          <>
            <View style={styles.divider} />
            <View style={styles.bulletList}>
              {bullets!.slice(0, 4).map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Ionicons name="checkmark" size={20} color={CYAN} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* CTA */}
        <ProCtaButton label={ctaLabel} compact={isCompact} />
      </View>
    </ImageBackground>
  );

  if (variant === 'fullscreen') {
    return (
      <View style={[styles.fullscreenOverlay, style]}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Abre a tela de assinatura para desbloquear as features Pro"
          style={styles.fullscreenPressable}
        >
          {inner}
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Abre a tela de assinatura para desbloquear as features Pro"
      style={style}
    >
      {inner}
    </Pressable>
  );
}

export const UpgradeProCard = memo(UpgradeProCardImpl);

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 212, 255, 0.35)',
    ...shadows.neon,
  },
  bgImage: {
    borderRadius: CARD_RADIUS,
  },
  cardCompact: {
    minHeight: 160,
  },
  cardMedium: {
    minHeight: 360,
  },
  cardFullscreen: {
    width: '100%',
    maxWidth: 400,
    minHeight: 420,
  },
  glassVeil: {
    backgroundColor: colors.proGlassOverlay,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proLabel: {
    color: CYAN,
    fontFamily: fonts.bold,
    fontSize: 24,
  },
  proLabelCompact: {
    fontSize: 20,
  },
  recommendedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CYAN,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  recommendedText: {
    color: colors.backgroundLight,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },

  // Hero price
  price: {
    color: colors.textLight,
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  priceCompact: {
    fontSize: 22,
    marginTop: 0,
  },
  priceHeadline: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
  },

  // Tagline
  tagline: {
    color: colors.proMutedText,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  taglineCompact: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Divider + bullets
  divider: {
    height: 1,
    backgroundColor: colors.proDivider,
    marginVertical: spacing.xs,
  },
  bulletList: {
    gap: spacing.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bulletText: {
    flexShrink: 1,
    color: colors.proMutedText,
    fontFamily: fonts.regular,
    fontSize: 15,
  },

  // Fullscreen overlay
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 24, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  fullscreenPressable: {
    width: '100%',
    maxWidth: 400,
  },
});

export default UpgradeProCard;
