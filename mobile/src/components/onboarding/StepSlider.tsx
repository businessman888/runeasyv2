/**
 * Discrete-step slider for the onboarding quiz (e.g. days-per-week).
 *
 * Replaces the old hand-rolled Pressable + onTouchMove + measure() slider in
 * FrequencyScreen, which ran on the JS thread and snapped back to index 0 on
 * release (the trailing onPress read a child-relative locationX). This one runs
 * the thumb on the UI thread via Reanimated, snaps to the nearest value with a
 * spring, and never relies on a release-time onPress.
 *
 * Visual language follows the base-ui reference adapted to our dark theme:
 * thin track + cyan indicator + white circular thumb that scales up while
 * dragging. Tokens come from the shared QUIZ system.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityActionEvent, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { QUIZ } from '../../screens/quiz/_tokens';
import { createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from "../../theme/semanticColors";

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 6;
const TOUCH_HEIGHT = 44; // accessible touch target around the thin track
const SPRING = { damping: 18, stiffness: 200, mass: 0.6 };

interface StepSliderProps {
    values: number[];
    value: number;
    onChange: (value: number) => void;
    onLockScroll?: () => void;
    onUnlockScroll?: () => void;
}

export function StepSlider({
    values,
    value,
    onChange,
    onLockScroll,
    onUnlockScroll,
}: StepSliderProps) {
    useThemeSubscription();
    const [trackWidth, setTrackWidth] = useState(0);
    const n = values.length;
    const step = n > 1 && trackWidth > 0 ? trackWidth / (n - 1) : 0;

    const pos = useSharedValue(0);        // thumb center x (0..trackWidth)
    const dragging = useSharedValue(0);   // 0..1 → scale 1.0..1.2
    const lastIdx = useSharedValue(0);    // last committed index (UI-thread mirror)

    // Keep latest value in a ref so the JS-side commit can dedupe without
    // re-creating the gesture on every change.
    const valueRef = useRef(value);
    valueRef.current = value;

    const indexOfValue = useCallback(
        (v: number) => Math.max(0, values.indexOf(v)),
        [values],
    );

    // Commit an index → haptic tick + notify parent (only when it really changed).
    const handleIndexChange = useCallback(
        (idx: number) => {
            const v = values[idx];
            if (v === undefined) return;
            Haptics.selectionAsync();
            if (v !== valueRef.current) onChange(v);
        },
        [values, onChange],
    );

    // Sync thumb to the external value (restore, clamp, day-marker tap, a11y).
    useEffect(() => {
        if (step <= 0) return;
        const idx = indexOfValue(value);
        lastIdx.value = idx;
        pos.value = withSpring(idx * step, SPRING);
    }, [value, step, indexOfValue, pos, lastIdx]);

    const panGesture = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetX([-10, 10])   // claim only on horizontal intent…
                .failOffsetY([-12, 12])     // …let vertical pans go to the ScrollView
                .onBegin(() => {
                    'worklet';
                    dragging.value = 1;
                    if (onLockScroll) runOnJS(onLockScroll)();
                })
                .onUpdate((e) => {
                    'worklet';
                    if (step <= 0) return;
                    const x = Math.max(0, Math.min(e.x, trackWidth));
                    pos.value = x; // follow finger 1:1, no spring while dragging
                    const idx = Math.max(0, Math.min(Math.round(x / step), n - 1));
                    if (idx !== lastIdx.value) {
                        lastIdx.value = idx;
                        runOnJS(handleIndexChange)(idx);
                    }
                })
                .onEnd(() => {
                    'worklet';
                    if (step <= 0) return;
                    pos.value = withSpring(lastIdx.value * step, SPRING); // snap
                })
                .onFinalize(() => {
                    'worklet';
                    dragging.value = 0;
                    if (onUnlockScroll) runOnJS(onUnlockScroll)();
                }),
        [step, trackWidth, n, dragging, pos, lastIdx, handleIndexChange, onLockScroll, onUnlockScroll],
    );

    const tapGesture = useMemo(
        () =>
            Gesture.Tap().onEnd((e) => {
                'worklet';
                if (step <= 0) return;
                const x = Math.max(0, Math.min(e.x, trackWidth));
                const idx = Math.max(0, Math.min(Math.round(x / step), n - 1));
                pos.value = withSpring(idx * step, SPRING);
                if (idx !== lastIdx.value) {
                    lastIdx.value = idx;
                    runOnJS(handleIndexChange)(idx);
                }
            }),
        [step, trackWidth, n, pos, lastIdx, handleIndexChange],
    );

    const composed = useMemo(
        () => Gesture.Race(panGesture, tapGesture),
        [panGesture, tapGesture],
    );

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: pos.value },
            { scale: withSpring(1 + dragging.value * 0.2, SPRING) },
        ] as ViewStyle['transform'],
    }));

    const fillStyle = useAnimatedStyle(() => ({
        width: pos.value,
    }));

    const handleAccessibilityAction = useCallback(
        (e: AccessibilityActionEvent) => {
            const idx = indexOfValue(valueRef.current);
            if (e.nativeEvent.actionName === 'increment' && idx < n - 1) {
                onChange(values[idx + 1]);
            } else if (e.nativeEvent.actionName === 'decrement' && idx > 0) {
                onChange(values[idx - 1]);
            }
        },
        [indexOfValue, n, onChange, values],
    );

    return (
        <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Dias de treino por semana"
            accessibilityValue={{ min: values[0], max: values[n - 1], now: value }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={handleAccessibilityAction}
        >
            <View style={styles.padded}>
                <GestureDetector gesture={composed}>
                    <View
                        style={styles.touchArea}
                        onLayout={(ev) => setTrackWidth(ev.nativeEvent.layout.width)}
                    >
                        <View style={styles.track}>
                            <Animated.View style={[styles.fill, fillStyle]} />
                        </View>
                        <Animated.View style={[styles.thumb, thumbStyle]} />
                    </View>
                </GestureDetector>

                <View style={styles.markersRow}>
                    {values.map((v) => (
                        <Pressable
                            key={v}
                            onPress={() => onChange(v)}
                            hitSlop={8}
                            style={styles.marker}
                            accessibilityRole="button"
                            accessibilityLabel={`${v} dias`}
                        >
                            <Text style={[styles.markerText, v === value && styles.markerTextActive]}>
                                {v}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    // Horizontal padding equal to half the thumb so the thumb center can reach
    // both edges of the track without being clipped; markers align to the same.
    padded: {
        paddingHorizontal: THUMB_SIZE / 2,
    },
    touchArea: {
        height: TOUCH_HEIGHT,
        justifyContent: 'center',
    },
    track: {
        height: TRACK_HEIGHT,
        width: '100%',
        backgroundColor: QUIZ.color.stroke,
        borderRadius: 999,
        overflow: 'hidden',
    },
    fill: {
        height: TRACK_HEIGHT,
        backgroundColor: QUIZ.color.cyan,
        borderRadius: 999,
    },
    thumb: {
        position: 'absolute',
        top: (TOUCH_HEIGHT - THUMB_SIZE) / 2,
        left: -THUMB_SIZE / 2, // center the thumb on translateX = pos
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        backgroundColor: QUIZ.color.text,
        borderWidth: 1,
        borderColor: QUIZ.color.border,
        // Soft, premium shadow — not the old neon glow.
        shadowColor: semanticColors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    markersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
    },
    marker: {
        minWidth: 24,
        alignItems: 'center',
    },
    markerText: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 15,
        color: QUIZ.color.textDim,
    },
    markerTextActive: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        color: QUIZ.color.cyan,
    },
}));

export default StepSlider;
