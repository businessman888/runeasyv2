import React, { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    AURORA_GLOW_END,
    AURORA_GLOW_START,
    borderRadius as radiusScale,
    createAuroraCardGradient,
    useAppTheme,
    type AuroraTone,
} from '../../theme';

/**
 * Aurora — the app's tinted card material.
 *
 * A solid surface with the state hue entering as a glow from the top-right
 * corner and fading out before the middle. The solid color is the card; the
 * glow only says which state it is.
 *
 * Deliberately gradient-only, no `BlurView`: the floating tab bar already
 * spends the screen's blur budget, and stacking glass on glass is the
 * anti-pattern this component exists to avoid. Every card that needs to carry a
 * state color uses this instead of hand-rolling its own gradient.
 *
 * `tone` is the semantic state, not a color: `accent` for the default brand
 * surface, `recovery` for rest-day surfaces.
 */
export interface AuroraCardProps {
    children: ReactNode;
    tone?: AuroraTone;
    radius?: number;
    style?: StyleProp<ViewStyle>;
}

export const AuroraCard = memo(function AuroraCard({
    children,
    tone = 'accent',
    radius = radiusScale['2xl'],
    style,
}: AuroraCardProps) {
    const { theme } = useAppTheme();
    const gradient = useMemo(
        () => createAuroraCardGradient(theme.colors, tone, theme.isDark),
        [theme.colors, theme.isDark, tone],
    );

    return (
        <View
            style={[
                styles.container,
                {
                    borderRadius: radius,
                    borderColor: gradient.border,
                    backgroundColor: gradient.surface,
                },
                theme.elevation.md,
                style,
            ]}
        >
            {/* The glow is clipped by this inner layer, not by the card itself:
                `overflow: 'hidden'` on a view also clips its own shadow on iOS.
                Its radius is one point tighter to sit inside the border. */}
            <View
                style={[StyleSheet.absoluteFill, { borderRadius: radius - 1, overflow: 'hidden' }]}
                pointerEvents="none"
            >
                <LinearGradient
                    colors={gradient.glow}
                    locations={gradient.glowLocations}
                    start={AURORA_GLOW_START}
                    end={AURORA_GLOW_END}
                    style={StyleSheet.absoluteFill}
                />
            </View>
            {children}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
    },
});

export default AuroraCard;
