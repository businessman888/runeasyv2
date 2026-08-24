import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    SharedValue,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { borderRadius, colors, createThemeStyles, useThemeSubscription } from '../../theme';

type StoryProgressBarsProps = {
    count: number;
    activeIndex: number;
    /** 0→1 fill of the currently active segment, driven on the UI thread. */
    progress: SharedValue<number>;
};

type BarProps = {
    index: number;
    activeIndex: number;
    progress: SharedValue<number>;
};

/**
 * A single track. Only the active bar reads `progress` every frame; bars before
 * the active index are full, bars after are empty. Memoized so a frame update of
 * the active bar never re-renders its siblings.
 */
const Bar = memo(({ index, activeIndex, progress }: BarProps) => {
    useThemeSubscription();
    const fillStyle = useAnimatedStyle(() => {
        let ratio: number;
        if (index < activeIndex) ratio = 1;
        else if (index > activeIndex) ratio = 0;
        else ratio = progress.value;
        return { width: `${Math.max(0, Math.min(1, ratio)) * 100}%` };
    }, [index, activeIndex]);

    return (
        <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
        </View>
    );
});
Bar.displayName = 'StoryProgressBar';

export const StoryProgressBars = memo(
    ({ count, activeIndex, progress }: StoryProgressBarsProps) => (
        <View style={styles.row}>
            {Array.from({ length: count }).map((_, i) => (
                <Bar key={i} index={i} activeIndex={activeIndex} progress={progress} />
            ))}
        </View>
    ),
);
StoryProgressBars.displayName = 'StoryProgressBars';

const styles = createThemeStyles(() => ({
    row: {
        flexDirection: 'row',
        gap: 6,
        width: '100%',
    },
    track: {
        flex: 1,
        height: 3,
        borderRadius: borderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: borderRadius.full,
        backgroundColor: colors.white,
    },
}));
