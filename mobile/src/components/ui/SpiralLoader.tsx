import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
    cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../../theme';

/**
 * Premium post-workout loader — a ring of dots that pulse in a staggered
 * spiral (scale 0→1→0 + opacity), the React Native / Reanimated equivalent of
 * the web SpiralLoader. Purely presentational; drives no navigation.
 */

interface SpiralLoaderProps {
    /** Diameter of the loader box in px. Default 72. */
    size?: number;
    /** Number of dots around the ring. Default 8. */
    dots?: number;
    /** Dot color. Default brand cyan. */
    color?: string;
    /** Full pulse cycle duration in ms. Default 1500. */
    duration?: number;
}

const DOT_RATIO = 0.16; // dot diameter relative to size

function Dot({
    delay,
    duration,
    size,
    color,
    x,
    y,
}: {
    delay: number;
    duration: number;
    size: number;
    color: string;
    x: number;
    y: number;
}) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            delay,
            withRepeat(
                withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
                -1,
                false,
            ),
        );
        return () => cancelAnimation(progress);
    }, [delay, duration, progress]);

    const animatedStyle = useAnimatedStyle(() => {
        // scale/opacity follow 0 → 1 → 0 across the cycle (triangular)
        const t = progress.value;
        const pulse = t < 0.5 ? t * 2 : (1 - t) * 2;
        return {
            opacity: pulse,
            transform: [{ scale: pulse }],
        };
    });

    const dotSize = size * DOT_RATIO;

    return (
        <Animated.View
            style={[
                styles.dot,
                {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: color,
                    left: size / 2 + x - dotSize / 2,
                    top: size / 2 + y - dotSize / 2,
                },
                animatedStyle,
            ]}
        />
    );
}

export function SpiralLoader({
    size = 72,
    dots = 8,
    color = colors.primary,
    duration = 1500,
}: SpiralLoaderProps) {
    const radius = size / 2 - size * DOT_RATIO;

    return (
        <View
            style={[styles.container, { width: size, height: size }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Processando treino"
        >
            {Array.from({ length: dots }).map((_, index) => {
                const angle = (index / dots) * (2 * Math.PI);
                const x = radius * Math.cos(angle);
                const y = radius * Math.sin(angle);
                return (
                    <Dot
                        key={index}
                        delay={(index / dots) * duration}
                        duration={duration}
                        size={size}
                        color={color}
                        x={x}
                        y={y}
                    />
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        position: 'absolute',
    },
});

export default SpiralLoader;
