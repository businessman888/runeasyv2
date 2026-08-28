import React, { memo, type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    cancelAnimation,
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import {
    borderRadius,
    fonts,
    spacing,
    typography,
    useAppTheme,
    useThemedStyles,
    type ThemeColors,
} from '../../theme';
import { useMotionPreferences } from '../../hooks/useMotionPreferences';
import { motionDuration, motionEasing } from '../../theme/motion';

const TYPING_PREVIEW_MS = motionDuration.standard + motionDuration.deliberate;
const BOT_SEQUENCE_STEP_MS = TYPING_PREVIEW_MS + motionDuration.fast;
const DOT_STAGGER_MS = motionDuration.instant;

type PresentationPhase = 'waiting' | 'typing' | 'message';

interface ChatBubbleProps {
    from: 'bot' | 'user';
    text: string;
    /** Mostra primeiro o indicador e então revela a mensagem inteira. */
    animate?: boolean;
    /** Ordem da mensagem quando o bot envia duas respostas no mesmo lote. */
    presentationOrder?: number;
    /** Mantém o indicador visível enquanto uma operação assíncrona está ativa. */
    pending?: boolean;
    /** O painel de escolha aparece abaixo da bolha, só após a mensagem. */
    children?: ReactNode;
}

function ChatBubbleInner({
    from,
    text,
    animate = false,
    presentationOrder = 0,
    pending = false,
    children,
}: ChatBubbleProps) {
    const styles = useThemedStyles(createStyles);
    const { theme } = useAppTheme();
    const { reduceMotion } = useMotionPreferences();
    const isBot = from === 'bot';
    const shouldAnimate = isBot && animate && !reduceMotion;
    const delayMs = presentationOrder * BOT_SEQUENCE_STEP_MS;
    const [phase, setPhase] = useState<PresentationPhase>(() => {
        if (pending) return 'typing';
        if (!shouldAnimate) return 'message';
        return delayMs > 0 ? 'waiting' : 'typing';
    });

    useEffect(() => {
        if (pending) {
            setPhase('typing');
            return;
        }

        if (!shouldAnimate) {
            setPhase('message');
            return;
        }

        let revealTimer: ReturnType<typeof setTimeout> | undefined;
        const reveal = () => {
            setPhase('typing');
            revealTimer = setTimeout(() => setPhase('message'), TYPING_PREVIEW_MS);
        };

        const waitTimer =
            delayMs > 0 ? setTimeout(reveal, delayMs) : undefined;
        if (!waitTimer) reveal();

        return () => {
            if (waitTimer) clearTimeout(waitTimer);
            if (revealTimer) clearTimeout(revealTimer);
        };
    }, [delayMs, pending, shouldAnimate, text]);

    if (phase === 'waiting') return null;

    const showingIndicator = phase === 'typing';
    const hasWidget = isBot && !!children;

    return (
        <Animated.View
            entering={
                reduceMotion
                    ? undefined
                    : FadeIn.duration(motionDuration.fast).easing(motionEasing.enter)
            }
            style={[styles.row, isBot ? styles.rowBot : styles.rowUser]}
        >
            <View style={[styles.messageGroup, !isBot && styles.messageGroupUser]}>
                <View
                    style={[
                        styles.bubble,
                        isBot ? styles.bubbleBot : styles.bubbleUser,
                        showingIndicator && styles.typingBubble,
                    ]}
                    accessible={showingIndicator}
                    accessibilityLabel={
                        showingIndicator
                            ? pending
                                ? text
                                : 'RunEasy está respondendo'
                            : undefined
                    }
                    accessibilityRole={showingIndicator ? 'progressbar' : undefined}
                    accessibilityState={showingIndicator ? { busy: true } : undefined}
                    accessibilityLiveRegion={showingIndicator ? 'polite' : 'none'}
                >
                    {showingIndicator ? (
                        <TypingDots color={theme.colors.textSecondary} />
                    ) : (
                        <Animated.View
                            entering={
                                reduceMotion
                                    ? undefined
                                    : FadeIn.duration(motionDuration.fast).easing(
                                          motionEasing.enter,
                                      )
                            }
                        >
                            <Text
                                style={[styles.text, !isBot && styles.textUser]}
                                accessibilityLabel={text}
                                accessibilityLiveRegion={isBot ? 'polite' : 'none'}
                                maxFontSizeMultiplier={1.4}
                            >
                                {text}
                            </Text>
                        </Animated.View>
                    )}
                </View>

                {!showingIndicator && hasWidget && (
                    <Animated.View
                        entering={
                            reduceMotion
                                ? undefined
                                : FadeIn.duration(motionDuration.fast).easing(
                                      motionEasing.enter,
                                  )
                        }
                        style={styles.widget}
                    >
                        {children}
                    </Animated.View>
                )}
            </View>
        </Animated.View>
    );
}

function TypingDots({ color }: { color: string }) {
    const { reduceMotion } = useMotionPreferences();

    return (
        <View
            style={stylesStatic.typingDots}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {[0, 1, 2].map((index) => (
                <TypingDot
                    key={index}
                    index={index}
                    color={color}
                    reduceMotion={reduceMotion}
                />
            ))}
        </View>
    );
}

const TypingDot = memo(function TypingDot({
    index,
    color,
    reduceMotion,
}: {
    index: number;
    color: string;
    reduceMotion: boolean;
}) {
    const progress = useSharedValue(0);

    useEffect(() => {
        if (reduceMotion) {
            progress.value = 0;
            return;
        }

        progress.value = withDelay(
            index * DOT_STAGGER_MS,
            withRepeat(
                withSequence(
                    withTiming(1, {
                        duration: motionDuration.standard,
                        easing: motionEasing.enter,
                    }),
                    withTiming(0, {
                        duration: motionDuration.standard,
                        easing: motionEasing.exit,
                    }),
                ),
                -1,
                false,
            ),
        );

        return () => cancelAnimation(progress);
    }, [index, progress, reduceMotion]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: reduceMotion ? 0.7 : 0.35 + progress.value * 0.65,
        transform: [{ translateY: reduceMotion ? 0 : -2 * progress.value }],
    }));

    return (
        <Animated.View
            style={[stylesStatic.typingDot, { backgroundColor: color }, animatedStyle]}
        />
    );
});

export const ChatBubble = memo(ChatBubbleInner);

const stylesStatic = StyleSheet.create({
    typingDots: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
    },
    typingDot: {
        width: 7,
        height: 7,
        borderRadius: borderRadius.full,
    },
});

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
        row: {
            width: '100%',
            flexDirection: 'row',
            marginBottom: spacing.sm,
        },
        rowBot: {
            justifyContent: 'flex-start',
        },
        rowUser: {
            justifyContent: 'flex-end',
        },
        messageGroup: {
            width: '100%',
            alignItems: 'flex-start',
        },
        messageGroupUser: {
            alignItems: 'flex-end',
        },
        bubble: {
            maxWidth: '88%',
            flexShrink: 1,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm + 2,
            borderRadius: borderRadius.lg,
        },
        bubbleBot: {
            backgroundColor: colors.surface2,
            borderTopLeftRadius: borderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        bubbleUser: {
            maxWidth: '82%',
            backgroundColor: colors.accentSubtle,
            borderTopRightRadius: borderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderSubtle,
        },
        typingBubble: {
            width: 58,
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
        },
        text: {
            fontSize: typography.fontSizes.lg,
            fontFamily: fonts.regular,
            color: colors.textPrimary,
            lineHeight: 24,
        },
        textUser: {
            fontFamily: fonts.medium,
        },
        widget: {
            width: '100%',
            marginTop: spacing.sm,
        },
    });
}

export default ChatBubble;
