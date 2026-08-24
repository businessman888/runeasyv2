/**
 * HoneycombLoader — a 7-hexagon "favo de mel" that pulses in a staggered wave.
 *
 * React Native / Reanimated recreation of the CSS honeycomb keyframe
 * (opacity+scale 0 → 1 → 0). Each hexagon runs the same loop offset by a delay
 * so the pulse travels around the ring. Honors "Reduce Motion": when enabled the
 * hexagons hold at a steady mid opacity instead of animating.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withDelay,
    cancelAnimation,
    Easing,
} from 'react-native-reanimated';
import { colors, useThemeSubscription, createThemeStyles } from '../../theme';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

const HEX = 16;          // hexagon icon size
const CONTAINER = 72;    // square container
const RADIUS = 18;       // ring radius from center
const CENTER = CONTAINER / 2;
const CYCLE = 1260;      // full pulse duration per hexagon (ms)

// Center + 6 hexagons around it (60° apart), positions precomputed.
const ANGLES = [0, 60, 120, 180, 240, 300];
const POSITIONS: Array<{ x: number; y: number }> = [
    { x: CENTER, y: CENTER }, // center
    ...ANGLES.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return {
            x: CENTER + RADIUS * Math.cos(rad),
            y: CENTER + RADIUS * Math.sin(rad),
        };
    }),
];

function Hexagon({ x, y, delay }: { x: number; y: number; delay: number }) {
    useThemeSubscription();
    const [reduceMotion, setReduceMotion] = useState(false);
    const progress = useSharedValue(0);

    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            if (mounted) setReduceMotion(enabled);
        });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (reduceMotion) {
            cancelAnimation(progress);
            progress.value = 0.6;
            return;
        }
        progress.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: CYCLE * 0.4, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: CYCLE * 0.4, easing: Easing.inOut(Easing.ease) }),
                ),
                -1,
                false,
            ),
        );
        return () => cancelAnimation(progress);
    }, [reduceMotion, delay, progress]);

    const animStyle = useAnimatedStyle(() => ({
        opacity: 0.15 + progress.value * 0.85,
        transform: [{ scale: 0.4 + progress.value * 0.6 }],
    }));

    return (
        <AnimatedIcon
            name="hexagon"
            size={HEX}
            color={colors.primary}
            style={[
                styles.hex,
                { left: x - HEX / 2, top: y - HEX / 2 },
                animStyle,
            ]}
        />
    );
}

export function HoneycombLoader({ size = CONTAINER }: { size?: number }) {
    useThemeSubscription();
    // Inner hexagon positions are computed in the fixed CONTAINER (72) space;
    // scale the whole cluster to honor a custom `size` without recomputing them.
    const scale = size / CONTAINER;
    return (
        <View
            style={[styles.container, { width: CONTAINER, height: CONTAINER, transform: [{ scale }] }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Carregando"
        >
            {POSITIONS.map((p, i) => (
                <Hexagon key={i} x={p.x} y={p.y} delay={i * 140} />
            ))}
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        position: 'relative',
    },
    hex: {
        position: 'absolute',
    },
}));
