import React, { memo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, fonts, shadows } from '../../theme';

const CYAN = colors.primary;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ProCtaButtonProps {
  label: string;
  /** Leading icon. Defaults to the upward arrow used across upgrade cards. */
  icon?: IoniconName;
  /** Slightly shorter pill for compact placements. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The cyan, neon-glowing CTA pill shared by every upgrade surface
 * (UpgradeProCard, the Home/Calendar glass teasers). Presentational only —
 * the surrounding card/overlay owns the Pressable, so this stays a View.
 */
function ProCtaButtonImpl({ label, icon = 'arrow-up', compact, style }: ProCtaButtonProps) {
  return (
    <View style={[styles.cta, compact && styles.ctaCompact, style]}>
      <Ionicons name={icon} size={18} color={CYAN} style={styles.ctaIcon} />
      <Text style={styles.ctaText}>{label}</Text>
    </View>
  );
}

export const ProCtaButton = memo(ProCtaButtonImpl);

const styles = StyleSheet.create({
  cta: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.proCtaFill,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: CYAN,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    ...shadows.neon,
  },
  ctaCompact: {
    minHeight: 44,
  },
  ctaIcon: {
    marginRight: 2,
  },
  ctaText: {
    color: CYAN,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
});

export default ProCtaButton;
