import React, { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';

const FORCED_CYAN = '#00D4FF';

interface OptionCardProps {
    selected?: boolean;
    onPress?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    selectedStyle?: StyleProp<ViewStyle>;
    children: React.ReactNode;
    accessibilityLabel?: string;
    /** When true (default), the card pulses subtly when freshly selected. */
    pulseOnSelect?: boolean;
}

export function OptionCard({
    selected = false,
    onPress,
    disabled = false,
    style,
    selectedStyle,
    children,
    accessibilityLabel,
    pulseOnSelect = true,
}: OptionCardProps) {
    const scale = useSharedValue(1);
    const selectedT = useSharedValue(selected ? 1 : 0);

    useEffect(() => {
        selectedT.value = withTiming(selected ? 1 : 0, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
        });
        if (selected && pulseOnSelect) {
            scale.value = withSequence(
                withTiming(1.03, { duration: 120, easing: Easing.out(Easing.cubic) }),
                withSpring(1, { damping: 16, stiffness: 220 }),
            );
        }
    }, [selected, pulseOnSelect, scale, selectedT]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const onPressIn = () => {
        scale.value = withSpring(0.97, { damping: 16, stiffness: 280 });
    };
    const onPressOut = () => {
        scale.value = withSpring(1, { damping: 16, stiffness: 220 });
    };

    return (
        <Animated.View style={animatedStyle}>
            <Pressable
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ selected, disabled }}
                style={({ pressed }) => [
                    style,
                    selected && selectedStyle,
                    selected && styles.selectedShadow,
                    pressed && styles.pressed,
                ]}
            >
                {children}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    selectedShadow: {
        shadowColor: FORCED_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
        elevation: 8,
    },
    pressed: {
        opacity: 0.95,
    },
});

export default OptionCard;
