import React, { memo, useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { borderRadius, colors, fonts, spacing, createThemeStyles, useThemeSubscription } from '../../theme';
import { GlassSurface } from '../ui/GlassSurface';
import { semanticColors } from '../../theme/semanticColors';

const ICON_STAGE_SIZE = 72;
const ICON_ORB_SIZE = 56;
const PULSE_DURATION_MS = 1900;

interface HomeRetrospectiveCardProps {
    onPress: () => void;
}

/**
 * High-priority Home entry point for a completed cycle retrospective.
 *
 * The loop is deliberately confined to the trophy halo: it signals that a new
 * artifact is waiting without making the whole Home compete for attention.
 * Blur comes from GlassSurface, preserving the app's Android glass strategy.
 */
export const HomeRetrospectiveCard = memo(function HomeRetrospectiveCard({
    onPress,
}: HomeRetrospectiveCardProps) {
    useThemeSubscription();
    const reduceMotion = useReducedMotion();
    const pulse = useSharedValue(0);
    const pressedScale = useSharedValue(1);

    useEffect(() => {
        cancelAnimation(pulse);
        pulse.value = 0;

        if (reduceMotion) return;

        pulse.value = withRepeat(
            withTiming(1, {
                duration: PULSE_DURATION_MS,
                easing: Easing.out(Easing.cubic),
            }),
            -1,
            false,
        );

        return () => cancelAnimation(pulse);
    }, [pulse, reduceMotion]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: reduceMotion ? 0.22 : 0.38 * (1 - pulse.value),
        transform: [{ scale: reduceMotion ? 1.12 : 0.94 + pulse.value * 0.62 }],
    }));

    const pressedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressedScale.value }],
    }));

    const handlePressIn = useCallback(() => {
        pressedScale.value = withSpring(0.985, { damping: 20, stiffness: 260 });
    }, [pressedScale]);

    const handlePressOut = useCallback(() => {
        pressedScale.value = withSpring(1, { damping: 20, stiffness: 220 });
    }, [pressedScale]);

    return (
        <Animated.View style={[styles.outer, styles.shadow, pressedStyle]}>
            <GlassSurface
                radius={borderRadius['2xl']}
                intensity={30}
                veilColor={semanticColors.surface1}
                style={styles.surface}
            >
                <LinearGradient
                    colors={[semanticColors.glass, semanticColors.transparent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />

                <Pressable
                    onPress={onPress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    accessibilityRole="button"
                    accessibilityLabel="Sua retrospectiva do ciclo está pronta"
                    accessibilityHint="Abre os destaques, recordes e a sugestão do coach"
                    style={styles.pressable}
                >
                    <View
                        style={styles.iconStage}
                        pointerEvents="none"
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                    >
                        <Animated.View style={[styles.pulseHalo, pulseStyle]} />
                        <View style={styles.iconOrb}>
                            <LinearGradient
                                colors={[semanticColors.accentSubtle, semanticColors.transparent]}
                                style={StyleSheet.absoluteFill}
                                pointerEvents="none"
                            />
                            <MaterialCommunityIcons name="trophy-outline" size={26} color={colors.primary} />
                        </View>
                    </View>

                    <View style={styles.copy}>
                        <View style={styles.eyebrowRow}>
                            <View style={styles.liveDot} />
                            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
                                SEU CICLO EM DESTAQUE
                            </Text>
                        </View>

                        <Text style={styles.title} maxFontSizeMultiplier={1.35}>
                            Sua retrospectiva está pronta
                        </Text>
                        <Text style={styles.subtitle} maxFontSizeMultiplier={1.35}>
                            Reviva seus marcos e descubra o próximo passo do coach.
                        </Text>

                        <View style={styles.ctaRow}>
                            <Text style={styles.ctaLabel} maxFontSizeMultiplier={1.3}>
                                Ver retrospectiva
                            </Text>
                            <View style={styles.ctaIcon}>
                                <Ionicons name="arrow-forward" size={15} color={colors.background} />
                            </View>
                        </View>
                    </View>
                </Pressable>
            </GlassSurface>
        </Animated.View>
    );
});

const styles = createThemeStyles(() => ({
    outer: {
        width: '100%',
    },
    shadow: Platform.select({
        ios: {
            shadowColor: semanticColors.canvas,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.14,
            shadowRadius: 22,
        },
        android: {
            elevation: 3,
        },
        default: {},
    }) as ViewStyle,
    surface: {
        minHeight: 160,
        borderColor: semanticColors.borderSubtle,
    },
    pressable: {
        minHeight: 160,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.base,
        gap: spacing.base,
    },
    iconStage: {
        width: ICON_STAGE_SIZE,
        height: ICON_STAGE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    pulseHalo: {
        position: 'absolute',
        width: ICON_ORB_SIZE,
        height: ICON_ORB_SIZE,
        borderRadius: ICON_ORB_SIZE / 2,
        borderWidth: 1.5,
        borderColor: semanticColors.borderStrong,
        backgroundColor: semanticColors.glass,
    },
    iconOrb: {
        width: ICON_ORB_SIZE,
        height: ICON_ORB_SIZE,
        borderRadius: ICON_ORB_SIZE / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        backgroundColor: semanticColors.accentSubtle,
    },
    copy: {
        flex: 1,
        minWidth: 0,
        alignItems: 'flex-start',
    },
    eyebrowRow: {
        minHeight: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.primary,
        shadowColor: semanticColors.transparent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
    },
    eyebrow: {
        color: semanticColors.textSecondary,
        fontFamily: fonts.semibold,
        fontSize: 10,
        lineHeight: 14,
        letterSpacing: 1.05,
    },
    title: {
        color: semanticColors.textPrimary,
        fontFamily: fonts.bold,
        fontSize: 18,
        lineHeight: 24,
        letterSpacing: -0.3,
    },
    subtitle: {
        color: semanticColors.textSecondary,
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 18,
        marginTop: spacing.xs,
    },
    ctaRow: {
        minHeight: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    ctaLabel: {
        color: colors.primary,
        fontFamily: fonts.semibold,
        fontSize: 12,
        lineHeight: 16,
    },
    ctaIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
    },
}));

export default HomeRetrospectiveCard;
