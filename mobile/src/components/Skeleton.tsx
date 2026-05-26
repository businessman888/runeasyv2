import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform, ViewStyle, DimensionValue } from 'react-native';
import { colors } from '../theme';

interface SkeletonProps {
    width: DimensionValue;
    height: number;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Skeleton loading component with shimmer animation
 */
export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const shimmer = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: Platform.OS !== 'web',
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: Platform.OS !== 'web',
                }),
            ])
        );
        shimmer.start();
        return () => shimmer.stop();
    }, [shimmerAnim]);

    const opacity = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
    });

    return (
        <Animated.View
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    borderRadius,
                    opacity,
                },
                style,
            ]}
        />
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
        backgroundColor: colors.border || '#2A2A3C',
    },
    cardContainer: {
        width: '100%',
        overflow: 'hidden',
    },
});
