import React, { useEffect } from 'react';
import { Pressable, Platform, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { semanticColors } from '../../theme/semanticColors';
import { useThemeSubscription, createThemeStyles } from '../../theme';



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
    useThemeSubscription();
    const scale = useSharedValue(1);

    useEffect(() => {
        if (selected && pulseOnSelect) {
            scale.value = withSequence(
                withTiming(1.03, { duration: 120, easing: Easing.out(Easing.cubic) }),
                withSpring(1, { damping: 16, stiffness: 220 }),
            );
        }
    }, [selected, pulseOnSelect, scale]);

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

// iOS-only soft glow. On Android, `elevation` produces a rectangular halo that
// doesn't respect borderRadius on many devices (Samsung One UI in particular),
// so we rely on the existing border + cyan-tinted background for the selected
// signal there.
const styles = createThemeStyles(() => ({
    selectedShadow: Platform.select({
        ios: {
            shadowColor: semanticColors.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
        },
        default: {},
    }) as ViewStyle,
    pressed: {
        opacity: 0.95,
    },
}));

export default OptionCard;
