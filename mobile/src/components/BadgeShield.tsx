import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Mask, Rect, G, Text as SvgText } from 'react-native-svg';
import { getBadgeShieldColor } from '../constants/badgeColors';
import { BADGE_SHIELD_LABELS } from '../constants/badgeLabels';

interface BadgeShieldProps {
  type: string;
  tier: number;
  slug: string;
  size?: number;
  earned?: boolean;
}

// Shield path from badgeSymbol.svg — viewBox 0 0 100 100
const SHIELD_PATH =
  'M12.5 17.2L50.0188 6.25L87.5 17.2V39.6542C87.4985 51.1616 83.8768 62.3769 ' +
  '77.1476 71.7117C70.4185 81.0465 60.9231 88.0278 50.0062 91.6667C39.0853 88.0293 ' +
  '29.586 81.0475 22.8544 71.7103C16.1227 62.3732 12.5002 51.1545 12.5 39.6438V17.2Z';

export const BadgeShield = memo(({ type, tier, slug, size = 64, earned = false }: BadgeShieldProps) => {
  const fillColor = getBadgeShieldColor(type, tier);
  const label = BADGE_SHIELD_LABELS[slug] ?? '?';
  const labelFontSize = label.length > 4 ? 14 : label.length > 3 ? 16 : 18;

  return (
    <View style={{ width: size, height: size, opacity: earned ? 1 : 0.35 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`textGrad_${slug}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#EBEBF5" stopOpacity="1" />
            <Stop offset="100%" stopColor="#89898F" stopOpacity="1" />
          </LinearGradient>
          <Mask id={`shield_${slug}`}>
            <Path d={SHIELD_PATH} fill="white" />
          </Mask>
        </Defs>

        {/* Shield fill */}
        <G mask={`url(#shield_${slug})`}>
          <Rect width="100" height="100" fill={fillColor} />
          {/* Subtle inner glow overlay */}
          <Rect width="100" height="50" fill="rgba(255,255,255,0.08)" />
        </G>

        {/* Shield border */}
        <Path
          d={SHIELD_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.20)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Label */}
        <SvgText
          x="50"
          y="57"
          textAnchor="middle"
          fill={`url(#textGrad_${slug})`}
          fontSize={labelFontSize}
          fontWeight="700"
          fontFamily="System"
        >
          {label}
        </SvgText>
      </Svg>
    </View>
  );
});

BadgeShield.displayName = 'BadgeShield';
