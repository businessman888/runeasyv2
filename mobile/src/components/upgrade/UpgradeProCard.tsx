import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, typography, shadows } from '../../theme';
import { useProFeature } from '../../hooks/useProFeature';

export type UpgradeProCardVariant = 'compact' | 'medium' | 'fullscreen';

export interface UpgradeProCardProps {
  variant: UpgradeProCardVariant;
  title: string;
  subtitle?: string;
  bullets?: string[];
  ctaLabel?: string;
  icon?: 'crown' | 'lock' | 'star';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const GOLD = '#D4A844';
const CYAN = colors.primary;
const NAVY_TOP = '#1A1A38';
const NAVY_BOTTOM = '#15152A';

const ICON_BY_NAME: Record<NonNullable<UpgradeProCardProps['icon']>, keyof typeof Ionicons.glyphMap> = {
  crown: 'star',
  lock: 'lock-closed',
  star: 'star-outline',
};

const DEFAULT_ICON_BY_VARIANT: Record<UpgradeProCardVariant, NonNullable<UpgradeProCardProps['icon']>> = {
  compact: 'crown',
  medium: 'crown',
  fullscreen: 'lock',
};

function UpgradeProCardImpl({
  variant,
  title,
  subtitle,
  bullets,
  ctaLabel = 'Upgrade to Pro',
  icon,
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

  const iconName = ICON_BY_NAME[icon ?? DEFAULT_ICON_BY_VARIANT[variant]];

  const accessibilityLabel = `${ctaLabel}. ${title}${subtitle ? '. ' + subtitle : ''}`;

  if (variant === 'fullscreen') {
    return (
      <View style={[styles.fullscreenOverlay, style]}>
        <LinearGradient
          colors={[NAVY_TOP, NAVY_BOTTOM]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.fullscreenCard}
        >
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>Pro</Text>
          </View>

          <View style={styles.iconCircle}>
            <Ionicons name={iconName} size={56} color={GOLD} />
          </View>

          <Text style={styles.fullscreenTitle}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          {bullets && bullets.length > 0 && (
            <View style={styles.bulletList}>
              {bullets.map((bullet) => (
                <View key={bullet} style={styles.bulletRow}>
                  <Ionicons name="checkmark" size={20} color={CYAN} />
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={handlePress}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Abre tela de assinatura para desbloquear features Pro"
            hitSlop={8}
          >
            <Ionicons name="arrow-up" size={18} color={CYAN} style={{ marginRight: 6 }} />
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </LinearGradient>
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Abre tela de assinatura para desbloquear features Pro"
      style={style}
    >
      <LinearGradient
        colors={[NAVY_TOP, NAVY_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          styles.cardBase,
          variant === 'compact' ? styles.cardCompact : styles.cardMedium,
        ]}
      >
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>Pro</Text>
        </View>

        <View style={variant === 'medium' ? styles.iconCircleMedium : styles.iconRowCompact}>
          <Ionicons name={iconName} size={variant === 'medium' ? 40 : 22} color={GOLD} />
        </View>

        <Text style={variant === 'medium' ? styles.mediumTitle : styles.compactTitle}>{title}</Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={variant === 'compact' ? 2 : 3}>
            {subtitle}
          </Text>
        )}

        {variant === 'medium' && bullets && bullets.length > 0 && (
          <View style={styles.bulletList}>
            {bullets.slice(0, 4).map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Ionicons name="checkmark" size={18} color={CYAN} />
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.ctaButton, variant === 'compact' && styles.ctaButtonCompact]}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={CYAN} style={{ marginLeft: 6 }} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export const UpgradeProCard = memo(UpgradeProCardImpl);

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: GOLD,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.neon,
  },
  cardCompact: {
    minHeight: 120,
    justifyContent: 'space-between',
  },
  cardMedium: {
    minHeight: 200,
  },
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 24, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  fullscreenCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: GOLD,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.neonStrong,
  },
  proBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(212, 168, 68, 0.18)',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  proBadgeText: {
    color: GOLD,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(212, 168, 68, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  iconCircleMedium: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(212, 168, 68, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  iconRowCompact: {
    marginBottom: spacing.sm,
  },
  fullscreenTitle: {
    color: colors.white,
    fontSize: typography.fontSizes['2xl'],
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  mediumTitle: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  compactTitle: {
    color: colors.white,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  bulletList: {
    width: '100%',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bulletText: {
    color: colors.textLight,
    fontSize: typography.fontSizes.md,
    flexShrink: 1,
  },
  ctaButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: CYAN,
  },
  ctaButtonCompact: {
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    color: CYAN,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
});

export default UpgradeProCard;
