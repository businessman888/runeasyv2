/**
 * PremiumBackground — subtle premium screen backdrop.
 *
 * Dark-theme adaptation of the radial-glow reference: a soft brand-cyan glow
 * anchored to the top-right corner (circle ~800px @ 100% 200px in the
 * inspiration) over the design-system base color. Clean, no grid texture.
 * Drawn with react-native-svg (already a dependency). Purely decorative —
 * `pointerEvents="none"` so it never intercepts touches.
 */
import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors } from '../../theme';

interface PremiumBackgroundProps {
    /** Glow color — defaults to the design-system brand cyan. */
    glow?: string;
}

export function PremiumBackground({ glow = colors.primary }: PremiumBackgroundProps) {
    const [size, setSize] = useState({ w: 0, h: 0 });

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
    };

    const { w, h } = size;

    return (
        <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
            {w > 0 && h > 0 && (
                <Svg width={w} height={h}>
                    <Defs>
                        <RadialGradient
                            id="premiumGlow"
                            cx={w}
                            cy={150}
                            r={Math.max(w, 380) * 1.2}
                            gradientUnits="userSpaceOnUse"
                        >
                            <Stop offset="0" stopColor={glow} stopOpacity={0.22} />
                            <Stop offset="0.55" stopColor={glow} stopOpacity={0.06} />
                            <Stop offset="1" stopColor={glow} stopOpacity={0} />
                        </RadialGradient>
                    </Defs>

                    {/* Base */}
                    <Rect x={0} y={0} width={w} height={h} fill={colors.background} />

                    {/* Radial glow (top-right) */}
                    <Rect x={0} y={0} width={w} height={h} fill="url(#premiumGlow)" />
                </Svg>
            )}
        </View>
    );
}
