import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import { colors, borderRadius, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from "../../theme/semanticColors";

interface LevelProgressBarProps {
    /** 0-100 */
    percentage: number;
    height?: number;
}

export function LevelProgressBar({ percentage, height = 8 }: LevelProgressBarProps) {
    useThemeSubscription();
    const widthAnim = useSharedValue(0);
    const shimmerX = useSharedValue(-1);

    useEffect(() => {
        widthAnim.value = withTiming(Math.max(0, Math.min(100, percentage)), {
            duration: 700,
            easing: Easing.out(Easing.cubic),
        });
    }, [percentage, widthAnim]);

    useEffect(() => {
        shimmerX.value = withRepeat(
            withSequence(
                withTiming(2, { duration: 1800, easing: Easing.inOut(Easing.cubic) }),
                withTiming(-1, { duration: 0 }),
            ),
            -1,
            false,
        );
    }, [shimmerX]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${widthAnim.value}%` as any,
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: `${shimmerX.value * 100}%` as any }],
    }));

    return (
        <View style={[styles.track, { height, borderRadius: height / 2 }]}>
            <Animated.View style={[styles.fillContainer, fillStyle, { borderRadius: height / 2 }]}>
                <LinearGradient
                    colors={[colors.primary, '#3B82F6', '#9747FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
                />
                <Animated.View style={[styles.shimmer, shimmerStyle]}>
                    <LinearGradient
                        colors={['transparent', semanticColors.textOnMediaMuted, 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            </Animated.View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    track: {
        width: '100%',
        backgroundColor: semanticColors.fillSubtle,
        overflow: 'hidden',
    },
    fillContainer: {
        height: '100%',
        overflow: 'hidden',
    },
    shimmer: {
        ...StyleSheet.absoluteFillObject,
        width: '50%',
    },
}));
