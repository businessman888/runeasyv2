import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const FORCED_CYAN = '#00D4FF';

const FlashIcon = () => (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        <Path d="M13 2L4 14H11V22L20 10H13V2Z" fill={FORCED_CYAN} />
    </Svg>
);

interface AnimatedXPProps {
    value: number;
}

export function AnimatedXP({ value }: AnimatedXPProps) {
    const [displayedValue, setDisplayedValue] = useState(value);
    const [popDelta, setPopDelta] = useState<number | null>(null);
    const prevValue = useRef(value);

    const popOpacity = useSharedValue(0);
    const popTranslate = useSharedValue(0);
    const badgeScale = useSharedValue(1);

    useEffect(() => {
        const delta = value - prevValue.current;
        if (delta > 0) {
            // Show "+delta" floating
            setPopDelta(delta);
            popOpacity.value = 0;
            popTranslate.value = 0;
            popOpacity.value = withSequence(
                withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) }),
                withDelay(380, withTiming(0, { duration: 280 })),
            );
            popTranslate.value = withTiming(-22, {
                duration: 800,
                easing: Easing.out(Easing.cubic),
            });

            // Bounce the badge
            badgeScale.value = withSequence(
                withTiming(1.12, { duration: 120, easing: Easing.out(Easing.cubic) }),
                withTiming(1, { duration: 180, easing: Easing.inOut(Easing.cubic) }),
            );

            // Animate the displayed number from old → new (~600ms)
            const start = prevValue.current;
            const end = value;
            const duration = 500;
            const startTime = Date.now();
            const tick = () => {
                const elapsed = Date.now() - startTime;
                const t = Math.min(1, elapsed / duration);
                const eased = 1 - Math.pow(1 - t, 3);
                const current = Math.round(start + (end - start) * eased);
                setDisplayedValue(current);
                if (t < 1) requestAnimationFrame(tick);
                else setDisplayedValue(end);
            };
            requestAnimationFrame(tick);
        } else if (delta !== 0) {
            // Reset (delta < 0) — no animation, just snap
            setDisplayedValue(value);
        }
        prevValue.current = value;
    }, [value, popOpacity, popTranslate, badgeScale]);

    const popStyle = useAnimatedStyle(() => ({
        opacity: popOpacity.value,
        transform: [{ translateY: popTranslate.value }],
    }));

    const badgeStyle = useAnimatedStyle(() => ({
        transform: [{ scale: badgeScale.value }],
    }));

    return (
        <View style={styles.wrap} pointerEvents="none">
            <Animated.View style={[styles.badge, badgeStyle]}>
                <FlashIcon />
                <Text style={styles.text}>{displayedValue}XP</Text>
            </Animated.View>

            {popDelta !== null && (
                <Animated.View style={[styles.pop, popStyle]} pointerEvents="none">
                    <Text style={styles.popText}>+{popDelta}</Text>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'relative',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0A0A14',
        borderWidth: 2,
        borderColor: FORCED_CYAN,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 6,
        shadowColor: FORCED_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    text: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 14,
        fontWeight: '600',
        color: FORCED_CYAN,
    },
    pop: {
        position: 'absolute',
        top: -4,
        right: 0,
        alignItems: 'center',
    },
    popText: {
        fontFamily: 'Inter-Bold',
        fontSize: 13,
        fontWeight: '700',
        color: FORCED_CYAN,
        textShadowColor: FORCED_CYAN,
        textShadowRadius: 6,
    },
});

export default AnimatedXP;
