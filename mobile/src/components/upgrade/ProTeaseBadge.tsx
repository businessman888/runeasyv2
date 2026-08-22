import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const SHIELD_ICON = require('../../assets/images/shieldPro.png');

export type ProTeaseBadgeVariant = 'shield' | 'lock';

export interface ProTeaseBadgeProps {
  /** `shield` = crown shield image (Home teaser); `lock` = glowing padlock (Calendar). */
  variant: ProTeaseBadgeVariant;
  /** Icon box size. Defaults: shield 56, lock 56 (lock glyph sits at ~50%). */
  size?: number;
}

/**
 * Premium icon for the Free→Pro glass teasers. The crown shield is already a
 * finished cyan→violet glyph (rendered as-is); the lock is a thin Feather glyph
 * inside a soft cyan-tinted circular badge (cyan hairline + tint, no shadow) —
 * same language as the "Análise do Treinador" cyan badges. Springs in on mount
 * (UI thread) so the
 * teaser feels alive without costing JS frames. Decorative — the surrounding
 * card already announces the action, so it stays out of the a11y tree.
 */
function ProTeaseBadgeImpl({ variant, size = 56 }: ProTeaseBadgeProps) {
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(12)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {variant === 'shield' ? (
        <Image
          source={SHIELD_ICON}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      ) : (
        <View style={[styles.lockBadge, { width: size, height: size, borderRadius: size / 2 }]}>
          <Feather name="lock" size={Math.round(size * 0.46)} color={colors.primary} />
        </View>
      )}
    </Animated.View>
  );
}

export const ProTeaseBadge = memo(ProTeaseBadgeImpl);

const styles = StyleSheet.create({
  lockBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.accentSubtle,
    borderWidth: 1,
    borderColor: semanticColors.borderSubtle,
    // No elevation/shadow on purpose: Android renders elevation as a dark blob
    // behind the circle. The cyan border + tint carry the premium look.
  },
});

export default ProTeaseBadge;
