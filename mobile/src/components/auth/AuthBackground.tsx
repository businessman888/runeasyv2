import React, { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, {
    Defs,
    Path,
    Pattern,
    RadialGradient,
    Rect,
    Stop,
} from 'react-native-svg';
import { colors, createThemeStyles, useThemeSubscription } from '../../theme';

/**
 * AuthBackground — the generated backdrop behind the login/signup glass card.
 *
 * Re-implements the web reference (a `radial-gradient` cyan glow + a repeating
 * line grid) in React Native, which has neither `radial-gradient` nor
 * `background-size` pattern repetition. Both are drawn in a single
 * `react-native-svg` pass (cheaper than stacking Views for the grid):
 *   - RadialGradient glow: brand cyan (`colors.primary`) → transparent, centred
 *     near the top where the card header sits.
 *   - Grid: an SVG <Pattern> of hairlines at very low cyan opacity — pure
 *     texture, kept faint so it never competes with the card (HIG: avoid
 *     stacking loud visual layers; card legibility wins).
 *
 * Sits under the card as `pointerEvents="none"` so it never intercepts touches.
 */

const GRID_SIZE = 18; // px cell — matches the 18px reference grid.
const GRID_STROKE = 'rgba(0, 212, 255, 0.06)'; // faint cyan texture.

export const AuthBackground = memo(function AuthBackground() {
    useThemeSubscription();
    const { width, height } = useWindowDimensions();

    // Glow centred horizontally, a little below the top edge (≈ where the
    // wordmark/title live), sized relative to the viewport like the reference.
    const glowCx = width / 2;
    const glowCy = height * 0.2;
    const glowR = Math.max(width, height * 0.6) * 1.05;

    return (
        <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
            <Svg width={width} height={height}>
                <Defs>
                    <RadialGradient
                        id="authGlow"
                        cx={glowCx}
                        cy={glowCy}
                        r={glowR}
                        gradientUnits="userSpaceOnUse"
                    >
                        <Stop offset="0" stopColor={colors.primary} stopOpacity={0.42} />
                        <Stop offset="0.55" stopColor={colors.primary} stopOpacity={0.08} />
                        <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
                    </RadialGradient>

                    <Pattern
                        id="authGrid"
                        width={GRID_SIZE}
                        height={GRID_SIZE}
                        patternUnits="userSpaceOnUse"
                    >
                        {/* right + bottom hairline of each cell → a full grid when tiled */}
                        <Path
                            d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                            fill="none"
                            stroke={GRID_STROKE}
                            strokeWidth={1}
                        />
                    </Pattern>
                </Defs>

                {/* Faint grid texture across the whole viewport … */}
                <Rect x={0} y={0} width={width} height={height} fill="url(#authGrid)" />
                {/* … with the cyan glow on top, concentrated near the header. */}
                <Rect x={0} y={0} width={width} height={height} fill="url(#authGlow)" />
            </Svg>
        </View>
    );
});

const styles = createThemeStyles(() => ({
    base: {
        backgroundColor: colors.background,
    },
}));

export default AuthBackground;
