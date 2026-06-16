import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo, ViewStyle, DimensionValue, LayoutChangeEvent } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing,
    cancelAnimation,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface SkeletonProps {
    width: DimensionValue;
    height: number;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Premium skeleton loading component.
 *
 * Renders a sliding shimmer band (LinearGradient) across the base surface using
 * react-native-reanimated. Honors the OS "Reduce Motion" setting: when enabled it
 * falls back to a static opacity pulse instead of the sweeping highlight.
 *
 * API kept identical to the previous version so existing consumers keep working.
 */
export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
    const [reduceMotion, setReduceMotion] = useState(false);
    const [boxWidth, setBoxWidth] = useState(0);
    const progress = useSharedValue(0);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            if (mounted) setReduceMotion(enabled);
        });
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
            if (mounted) setReduceMotion(enabled);
        });
        return () => {
            mounted = false;
            sub?.remove?.();
        };
    }, []);

    useEffect(() => {
        if (reduceMotion) {
            cancelAnimation(progress);
            // Gentle static pulse for reduced-motion users.
            progress.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
                ),
                -1,
                false,
            );
        } else {
            progress.value = 0;
            progress.value = withRepeat(
                withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
                -1,
                false,
            );
        }
        return () => cancelAnimation(progress);
    }, [reduceMotion, progress]);

    const onLayout = (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w && w !== boxWidth) setBoxWidth(w);
    };

    // Reduced motion: animate the base opacity (no sweeping band).
    const pulseStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 1], [0.35, 0.7]),
    }));

    // Sliding shimmer band: translate a highlight gradient across the surface.
    const shimmerStyle = useAnimatedStyle(() => {
        const travel = boxWidth > 0 ? boxWidth : 200;
        return {
            transform: [
                { translateX: interpolate(progress.value, [0, 1], [-travel, travel]) },
            ],
        };
    });

    return (
        <View
            onLayout={onLayout}
            style={[
                styles.skeleton,
                { width, height, borderRadius, overflow: 'hidden' },
                style,
            ]}
        >
            {reduceMotion ? (
                <Animated.View style={[StyleSheet.absoluteFill, styles.base, pulseStyle]} />
            ) : (
                <>
                    <View style={[StyleSheet.absoluteFill, styles.base]} />
                    <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
                        <AnimatedLinearGradient
                            colors={['transparent', colors.glassWhite, 'transparent']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>
                </>
            )}
        </View>
    );
}

/**
 * Text skeleton - single line
 */
export function SkeletonText({
    width = '100%',
    height = 16,
    style
}: {
    width?: DimensionValue;
    height?: number;
    style?: ViewStyle;
}) {
    return <Skeleton width={width} height={height} borderRadius={4} style={style} />;
}

/**
 * Circle skeleton - for avatars
 */
export function SkeletonCircle({
    size = 48,
    style
}: {
    size?: number;
    style?: ViewStyle;
}) {
    return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

/**
 * Card skeleton - for content cards
 */
export function SkeletonCard({
    height = 120,
    style
}: {
    height?: number;
    style?: ViewStyle;
}) {
    return (
        <View style={[styles.cardContainer, { height }, style]}>
            <Skeleton width="100%" height={height} borderRadius={16} />
        </View>
    );
}

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: colors.border || '#2A2A3E',
    },
    base: {
        backgroundColor: colors.border || '#2A2A3E',
    },
    cardContainer: {
        width: '100%',
        overflow: 'hidden',
    },
});
