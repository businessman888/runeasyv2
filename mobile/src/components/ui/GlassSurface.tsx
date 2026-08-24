import React, { memo, type ReactNode } from 'react';
import {
    View,
    StyleSheet,
    Platform,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, createThemeStyles, useThemeSubscription, getThemeBlurTint, getThemeGlassSheenColors } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

/**
 * Reusable frosted-glass surface — the exact material identity used by the
 * floating tab bar ([CustomTabBar]) and the Pro teasers ([GlassTeaseOverlay]),
 * extracted here so the Calendar card reads as the same glass instead of a
 * third hand-rolled copy.
 *
 * Layer stack (all `pointerEvents="none"`, under the children):
 *   BlurView (real frosted blur) → navy veil (`tabBarGlassFill`) → sheen
 *   gradient → optional cyan hairline border.
 *
 * `disableBlur` skips the live blur + veil so it can sit INSIDE an outer glass
 * layer (e.g. the Free `GlassTeaseOverlay`) without stacking glass-over-glass.
 */

// Real frosted blur on Android needs expo-blur's experimental RenderEffect
// method (API 31+); the default Android path barely blurs. Safe here because
// the blur layer is `pointerEvents="none"` and sits UNDER the content.
const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
    Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

const SHEEN_LOCATIONS = [0, 0.5, 1] as const;

export interface GlassSurfaceProps {
    children: ReactNode;
    radius?: number;
    /** Blur strength (30–50 is the sweet spot). Real frosted blur on iOS/Android. */
    intensity?: number;
    /**
     * Skip the live BlurView + veil. Use when an outer glass layer already
     * provides the blur (avoids the HIG "glass over glass" anti-pattern and the
     * cost of a second real-time blur on the same view).
     */
    disableBlur?: boolean;
    /** Premium cyan hairline edge (matches the tab bar). Default on. */
    bordered?: boolean;
    /**
     * Optional translucent veil over the blur. Defaults to the denser tab-bar
     * material; content cards can lower it to let more backdrop show through.
     */
    veilColor?: string;
    style?: StyleProp<ViewStyle>;
}

export const GlassSurface = memo(function GlassSurface({
    children,
    radius = 24,
    intensity = 40,
    disableBlur = false,
    bordered = true,
    veilColor = colors.tabBarGlassFill,
    style,
}: GlassSurfaceProps) {
    useThemeSubscription();
    return (
        <View
            style={[
                styles.container,
                { borderRadius: radius },
                bordered && styles.bordered,
                style,
            ]}
        >
            {!disableBlur && (
                <>
                    <BlurView
                        intensity={intensity}
                        tint={getThemeBlurTint()}
                        experimentalBlurMethod={ANDROID_BLUR_METHOD}
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                    />
                    <View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, { backgroundColor: veilColor }]}
                    />
                    <LinearGradient
                        colors={getThemeGlassSheenColors()}
                        locations={SHEEN_LOCATIONS}
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                    />
                </>
            )}
            {children}
        </View>
    );
});

const styles = createThemeStyles(() => ({
    container: {
        overflow: 'hidden',
        position: 'relative',
    },
    bordered: {
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
}));

export default GlassSurface;
