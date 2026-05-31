import React, { memo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing, fonts, shadows } from '../../theme';

const CYAN = colors.primary;
// Dark ink that reads on the solid-cyan pill (same color as the "Recomendado"
// badge text over cyan).
const CTA_INK = colors.backgroundLight;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ProCtaButtonProps {
  label: string;
  /**
   * Optional leading icon. Omitted by default for the clean, label-only pill
   * shown in the Figma. When provided, it's tinted to match the dark ink.
   */
  icon?: IoniconName;
  /** Slightly shorter pill for compact placements. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The solid-cyan, neon-glowing CTA pill shared by every upgrade surface
 * (UpgradeProCard, the Home/Calendar glass teasers). Solid fill + dark ink for
 * maximum contrast/premium feel (matches the Figma). Presentational only — the
 * surrounding card/overlay owns the Pressable, so this stays a View.
 */
function ProCtaButtonImpl({ label, icon, compact, style }: ProCtaButtonProps) {
  return (
    <View style={[styles.cta, compact && styles.ctaCompact, style]}>
      {icon && <Ionicons name={icon} size={18} color={CTA_INK} style={styles.ctaIcon} />}
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
    backgroundColor: CYAN,
    borderRadius: borderRadius.full,
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
    color: CTA_INK,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
});

export default ProCtaButton;
