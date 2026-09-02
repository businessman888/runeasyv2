import React, { memo, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '../../theme';
import { tintLottieColors } from '../../utils/tintLottie';

const MOON_ANIMATION = require('../../assets/animate/moon.json');

/**
 * Looping moon used by the rest-day cards, replacing the static `sleep` icon.
 *
 * Same loop contract as the streak flame in `CalendarFixedHeader`: it runs
 * continuously, and under Reduce Motion it holds a representative frame instead
 * of animating.
 *
 * The color follows `textSecondary`, matching the icon it replaces — the rest
 * day's purple lives in the card surface and the progress bar, so the moon does
 * not compete with it.
 */
export interface MoonAnimationProps {
    size?: number;
    style?: StyleProp<ViewStyle>;
    /** Overrides the default label; pass null on cards that already announce the state. */
    accessibilityLabel?: string | null;
}

export const MoonAnimation = memo(function MoonAnimation({
    size = 32,
    style,
    accessibilityLabel = 'Dia de descanso',
}: MoonAnimationProps) {
    const { theme } = useAppTheme();
    const reduceMotion = useReducedMotion();

    const source = useMemo(
        () => tintLottieColors(MOON_ANIMATION, theme.colors.textSecondary),
        [theme.colors.textSecondary],
    );

    return (
        <View
            style={[{ width: size, height: size }, style]}
            accessible={accessibilityLabel != null}
            accessibilityRole="image"
            accessibilityLabel={accessibilityLabel ?? undefined}
        >
            <LottieView
                source={source}
                autoPlay={!reduceMotion}
                loop={!reduceMotion}
                progress={reduceMotion ? 0.5 : undefined}
                resizeMode="contain"
                style={{ width: size, height: size }}
            />
        </View>
    );
});

export default MoonAnimation;
