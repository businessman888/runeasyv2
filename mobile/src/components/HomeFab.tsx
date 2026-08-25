import React, { useCallback, useEffect, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    type SharedValue,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createThemeStyles, fonts, spacing, useThemeSubscription } from '../theme';
import { motionScale, motionSpring } from '../theme/motion';
import { semanticColors } from '../theme/semanticColors';
import { triggerHaptic } from '../utils/haptics';
import { AppIcon } from './ui/AppIcon';

interface HomeFabProps {
    onPressFreeRun: () => void;
    onPressManual: () => void;
    scrollY: SharedValue<number>;
}

interface FabOptionProps {
    index: number;
    label: string;
    menuProgress: SharedValue<number>;
    onPress: () => void;
    icon: React.ReactNode;
}

const FAB_SIZE = 60;
const OPTION_SIZE = 52;
const OPTION_GAP = spacing.md;
const ACTIONS_WIDTH = 190;
const FAB_RIGHT_OFFSET = spacing.lg;
const HIDE_SCROLL_THRESHOLD = 18;
const SHOW_SCROLL_THRESHOLD = 12;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function HomeFab({ onPressFreeRun, onPressManual, scrollY }: HomeFabProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const [open, setOpen] = useState(false);
    const [acceptsTouches, setAcceptsTouches] = useState(true);
    const menuProgress = useSharedValue(0);
    const visibilityProgress = useSharedValue(1);
    const visibilityTarget = useSharedValue(1);
    const scrollAnchor = useSharedValue(0);
    const pressScale = useSharedValue(1);

    useEffect(() => {
        menuProgress.value = withSpring(open ? 1 : 0, motionSpring.layout);
    }, [menuProgress, open]);

    const updateTouchAvailability = useCallback((visible: boolean) => {
        setAcceptsTouches(visible);
        if (!visible) setOpen(false);
    }, []);

    useAnimatedReaction(
        () => scrollY.value,
        (currentY) => {
            if (currentY <= SHOW_SCROLL_THRESHOLD) {
                scrollAnchor.value = currentY;
                if (visibilityTarget.value !== 1) {
                    visibilityTarget.value = 1;
                    visibilityProgress.value = withSpring(1, motionSpring.layout);
                    runOnJS(updateTouchAvailability)(true);
                }
                return;
            }

            if (currentY > scrollAnchor.value) {
                if (
                    visibilityTarget.value === 1
                    && currentY > scrollAnchor.value + HIDE_SCROLL_THRESHOLD
                ) {
                    scrollAnchor.value = currentY;
                    visibilityTarget.value = 0;
                    visibilityProgress.value = withSpring(0, motionSpring.layout);
                    runOnJS(updateTouchAvailability)(false);
                } else if (visibilityTarget.value === 0) {
                    scrollAnchor.value = currentY;
                }
                return;
            }

            if (currentY < scrollAnchor.value) {
                if (
                    visibilityTarget.value === 0
                    && currentY < scrollAnchor.value - SHOW_SCROLL_THRESHOLD
                ) {
                    scrollAnchor.value = currentY;
                    visibilityTarget.value = 1;
                    visibilityProgress.value = withSpring(1, motionSpring.layout);
                    runOnJS(updateTouchAvailability)(true);
                } else if (visibilityTarget.value === 1) {
                    scrollAnchor.value = currentY;
                }
            }
        },
        [updateTouchAvailability],
    );

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            menuProgress.value,
            [0, 1],
            [0, 0.46],
            Extrapolation.CLAMP,
        ),
    }));

    const rootAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            visibilityProgress.value,
            [0, 1],
            [0, 1],
            Extrapolation.CLAMP,
        ),
        transform: [
            {
                translateY: interpolate(
                    visibilityProgress.value,
                    [0, 1],
                    [28, 0],
                    Extrapolation.CLAMP,
                ),
            },
            {
                scale: interpolate(
                    visibilityProgress.value,
                    [0, 1],
                    [0.92, 1],
                    Extrapolation.CLAMP,
                ),
            },
        ] as const,
    }));

    const triggerIconAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                rotate: `${interpolate(
                    menuProgress.value,
                    [0, 1],
                    [0, 45],
                    Extrapolation.CLAMP,
                )}deg`,
            },
        ] as const,
    }));

    const triggerPressAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressScale.value }],
    }));

    const toggleMenu = useCallback(() => {
        void triggerHaptic('selection');
        setOpen((current) => !current);
    }, []);

    const closeMenu = useCallback(() => setOpen(false), []);

    const handleOption = useCallback((callback: () => void) => () => {
        void triggerHaptic('impactLight');
        setOpen(false);
        setTimeout(callback, 90);
    }, []);

    // Floating tab bar height (~74) + safe-area clearance + visual breathing room.
    const tabBarBottom = Math.max(insets.bottom + 10, 25);
    const fabBottom = tabBarBottom + 74 + spacing.md;

    return (
        <>
            <View
                accessibilityElementsHidden={!open}
                importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
                pointerEvents={open ? 'auto' : 'none'}
                style={StyleSheet.absoluteFill}
            >
                <Pressable
                    accessibilityLabel="Fechar opções de treino"
                    accessibilityRole="button"
                    onPress={closeMenu}
                    style={StyleSheet.absoluteFill}
                >
                    <Animated.View
                        pointerEvents="none"
                        style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnimatedStyle]}
                    />
                </Pressable>
            </View>

            <Animated.View
                accessibilityElementsHidden={!acceptsTouches}
                importantForAccessibility={acceptsTouches ? 'yes' : 'no-hide-descendants'}
                pointerEvents={acceptsTouches ? 'box-none' : 'none'}
                style={[
                    styles.root,
                    { bottom: fabBottom, right: FAB_RIGHT_OFFSET },
                    rootAnimatedStyle,
                ]}
            >
                <View
                    accessibilityElementsHidden={!open}
                    importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
                    pointerEvents={open ? 'auto' : 'none'}
                    style={styles.actions}
                >
                    <FabOption
                        index={0}
                        label="Treino livre"
                        menuProgress={menuProgress}
                        onPress={handleOption(onPressFreeRun)}
                        icon={<AppIcon name="running" size={24} tone="accent" variant="filled" />}
                    />
                    <FabOption
                        index={1}
                        label="Treino manual"
                        menuProgress={menuProgress}
                        onPress={handleOption(onPressManual)}
                        icon={<AppIcon name="edit" size={24} tone="accent" variant="outline" />}
                    />
                </View>

                <AnimatedPressable
                    accessibilityHint="Exibe atalhos para iniciar um treino"
                    accessibilityLabel={open ? 'Fechar opções de treino' : 'Abrir opções de treino'}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    onPress={toggleMenu}
                    onPressIn={() => {
                        pressScale.value = withSpring(motionScale.icon, motionSpring.press);
                    }}
                    onPressOut={() => {
                        pressScale.value = withSpring(1, motionSpring.press);
                    }}
                    style={[styles.fab, triggerPressAnimatedStyle]}
                >
                    <Animated.View style={triggerIconAnimatedStyle}>
                        <AppIcon name="add" size={32} tone="onAccent" variant="outline" />
                    </Animated.View>
                </AnimatedPressable>
            </Animated.View>
        </>
    );
}

function FabOption({ index, label, menuProgress, onPress, icon }: FabOptionProps) {
    useThemeSubscription();
    const pressScale = useSharedValue(1);
    const isFartherFromTrigger = index === 0;

    const revealAnimatedStyle = useAnimatedStyle(() => {
        const start = isFartherFromTrigger ? 0.2 : 0.06;
        const travel = isFartherFromTrigger ? 32 : 18;

        return {
            opacity: interpolate(
                menuProgress.value,
                [start, 1],
                [0, 1],
                Extrapolation.CLAMP,
            ),
            transform: [
                {
                    translateY: interpolate(
                        menuProgress.value,
                        [start, 1],
                        [travel, 0],
                        Extrapolation.CLAMP,
                    ),
                },
                {
                    scale: interpolate(
                        menuProgress.value,
                        [start, 1],
                        [0.88, 1],
                        Extrapolation.CLAMP,
                    ),
                },
                { scale: pressScale.value },
            ] as const,
        };
    }, [isFartherFromTrigger]);

    return (
        <AnimatedPressable
            accessibilityLabel={label}
            accessibilityRole="button"
            hitSlop={4}
            onPress={onPress}
            onPressIn={() => {
                pressScale.value = withSpring(motionScale.button, motionSpring.press);
            }}
            onPressOut={() => {
                pressScale.value = withSpring(1, motionSpring.press);
            }}
            style={[styles.optionHitArea, revealAnimatedStyle]}
        >
            <View style={styles.labelPill}>
                <Text
                    maxFontSizeMultiplier={1.3}
                    numberOfLines={1}
                    style={styles.labelText}
                >
                    {label}
                </Text>
            </View>
            <View style={styles.optionButton}>{icon}</View>
        </AnimatedPressable>
    );
}

const styles = createThemeStyles(() => ({
    backdrop: {
        backgroundColor: semanticColors.canvas,
    },
    root: {
        position: 'absolute',
        width: ACTIONS_WIDTH,
        height: FAB_SIZE,
        alignItems: 'flex-end',
        zIndex: 20,
    },
    actions: {
        position: 'absolute',
        right: 0,
        bottom: FAB_SIZE + spacing.md,
        width: ACTIONS_WIDTH,
        gap: OPTION_GAP,
        alignItems: 'flex-end',
    },
    optionHitArea: {
        minHeight: OPTION_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: spacing.sm,
    },
    labelPill: {
        minHeight: 40,
        paddingHorizontal: spacing.md,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: semanticColors.borderStrong,
        backgroundColor: semanticColors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.24,
        shadowRadius: 10,
        elevation: 5,
    },
    labelText: {
        fontFamily: fonts.semibold,
        fontSize: 13,
        lineHeight: 18,
        color: semanticColors.textPrimary,
    },
    optionButton: {
        width: OPTION_SIZE,
        height: OPTION_SIZE,
        borderRadius: OPTION_SIZE / 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: semanticColors.borderStrong,
        backgroundColor: semanticColors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.shadow,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 7,
    },
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: semanticColors.borderStrong,
        backgroundColor: semanticColors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.26,
        shadowRadius: 14,
        elevation: 9,
    },
}));
