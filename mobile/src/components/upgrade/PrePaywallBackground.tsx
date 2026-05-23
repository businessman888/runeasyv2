import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../theme';

/**
 * Premium radial glow for the PrePaywall screen — the React Native equivalent of
 * the shadcn `gradient-background-4` (a soft radial that blooms from the top-center
 * and fades into the dark navy base). Brand-tinted cyan→violet to echo the Pro
 * shield's own gradient (#00D4FF → #5B2B99), so the hero feels lit from above.
 *
 * Non-interactive; drop it as the first (back-most) absolute layer of the screen.
 */
function PrePaywallBackgroundImpl() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.base]}
    >
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="prePaywallGlow" cx="50%" cy="-8%" rx="95%" ry="70%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.22" />
            <Stop offset="42%" stopColor={colors.recovery} stopOpacity="0.12" />
            <Stop offset="100%" stopColor={colors.backgroundLight} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#prePaywallGlow)" />
      </Svg>
    </View>
  );
}

export const PrePaywallBackground = memo(PrePaywallBackgroundImpl);

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.backgroundLight,
  },
});

export default PrePaywallBackground;
