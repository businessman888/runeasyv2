import React, { memo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Animated,
    Easing,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, borderRadius, shadows, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import type { ReadinessBlock } from '../../types/wellness.types';
import { semanticColors } from '../../theme/semanticColors';
import type { AppIconName } from '../../theme/iconography';
import { AppIcon } from '../ui/AppIcon';
import { ReadinessSignal, readinessSignalColors } from '../readiness/ReadinessSignal';
import {
    describeFloorProgress,
    FLOOR_EXPLANATION,
    signalLabel,
    type ReadinessLock,
} from '../../utils/readinessPresentation';

interface ReadinessCardProps {
    readiness: ReadinessBlock;
    /**
     * Por que o check-in está (ou não) liberado — de `deriveReadinessLock`.
     *
     * Era um booleano `isUnlocked`, e o card bloqueado tinha uma copy só:
     * "Complete seu primeiro treino". Desde a R.1 o bloqueio é o PISO de
     * histórico (2 semanas e 6 corridas), e essa frase ficou falsa para quem já
     * correu — e para quem só perdeu a conexão.
     */
    lock: ReadinessLock;
    onPressQuiz: () => void;
    /** Reabre a análise de hoje. A análise da IA era escrita uma vez e nunca mais lida. */
    onPressDone: () => void;
}

const DIMENSION_LABELS = {
    sleep: 'Sono',
    legs: 'Pernas',
    mood: 'Humor',
    stress: 'Estresse',
    motivation: 'Motivação',
} as const;

const DIMENSION_ICONS: Record<keyof typeof DIMENSION_LABELS, AppIconName> = {
    sleep: 'sleep',
    legs: 'running',
    mood: 'mood',
    stress: 'stress',
    motivation: 'energy',
};

function ReadinessCardComponent({
    readiness,
    lock,
    onPressQuiz,
    onPressDone,
}: ReadinessCardProps) {
    useThemeSubscription();
    if (readiness.hasCompletedToday) {
        return <ReadinessCardDone readiness={readiness} onPress={onPressDone} />;
    }
    if (lock.kind !== 'open') {
        return <ReadinessCardLocked lock={lock} />;
    }
    return <ReadinessCardPending onPress={onPressQuiz} />;
}

export const ReadinessCard = memo(ReadinessCardComponent);

// =============================================================================
// PENDING VARIANT — premium animated invite
// =============================================================================

function ReadinessCardPending({ onPress }: { onPress: () => void }) {
    useThemeSubscription();
    const rotate = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    const iconPulse = useRef(new Animated.Value(0.7)).current;
    const press = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Rotating outer gradient (subtle premium feel)
        const rotation = Animated.loop(
            Animated.timing(rotate, {
                toValue: 1,
                duration: 6000,
                easing: Easing.linear,
                useNativeDriver: Platform.OS !== 'web',
            }),
        );

        const cta = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1.04,
                    duration: 1200,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: Platform.OS !== 'web',
                }),
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: Platform.OS !== 'web',
                }),
            ]),
        );

        const iconLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(iconPulse, {
                    toValue: 1,
                    duration: 900,
                    useNativeDriver: Platform.OS !== 'web',
                }),
                Animated.timing(iconPulse, {
                    toValue: 0.7,
                    duration: 900,
                    useNativeDriver: Platform.OS !== 'web',
                }),
            ]),
        );

        rotation.start();
        cta.start();
        iconLoop.start();
        return () => {
            rotation.stop();
            cta.stop();
            iconLoop.stop();
        };
    }, [rotate, pulse, iconPulse]);

    const rotateInterpolate = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() =>
                Animated.spring(press, {
                    toValue: 0.97,
                    useNativeDriver: Platform.OS !== 'web',
                }).start()
            }
            onPressOut={() =>
                Animated.spring(press, {
                    toValue: 1,
                    friction: 4,
                    useNativeDriver: Platform.OS !== 'web',
                }).start()
            }
            accessibilityRole="button"
            accessibilityLabel="Fazer check-in de prontidão"
            accessibilityHint="Abre o quiz para avaliar como você está hoje"
        >
            <Animated.View style={{ transform: [{ scale: press }] }}>
                <View style={styles.pendingShell}>
                    {/* Rotating gradient halo */}
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.rotatingHalo,
                            { transform: [{ rotate: rotateInterpolate }] },
                        ]}
                    >
                        <LinearGradient
                            colors={[
                                semanticColors.borderStrong,
                                semanticColors.accentSubtle,
                                semanticColors.transparent,
                                semanticColors.borderStrong,
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>

                    {/* Inner card */}
                    <LinearGradient
                        colors={[semanticColors.surface1, semanticColors.surface2, semanticColors.surface1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.pendingInner}
                    >
                        <LinearGradient
                            colors={[semanticColors.accentSubtle, semanticColors.transparent]}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0.2, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        />

                        <View style={styles.pendingHeader}>
                            <View style={styles.pendingChip}>
                                <AppIcon name="sparkles" size={16} tone="accent" />
                                <Text style={styles.pendingChipText}>Check-in diário</Text>
                            </View>
                            <Animated.View style={{ opacity: iconPulse }}>
                                <View style={styles.pendingIconBubble}>
                                    <AppIcon name="heartRate" size={20} tone="accent" variant="filled" />
                                </View>
                            </Animated.View>
                        </View>

                        <Text style={styles.pendingTitle}>
                            Como você está se sentindo hoje?
                        </Text>
                        {/* Dizia "…e ajustar o treino de hoje" — nada ajusta o
                            plano por aqui, e a Fase 6 nem aceita mexer em hoje. */}
                        <Text style={styles.pendingSubtitle}>
                            Responda em 30 segundos e veja como seu corpo está
                            para o treino de hoje.
                        </Text>

                        <Animated.View
                            style={{
                                transform: [{ scale: pulse }],
                                marginTop: spacing.lg,
                            }}
                        >
                            <LinearGradient
                                colors={[semanticColors.accent, semanticColors.accent]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.pendingCta}
                            >
                                <Text style={styles.pendingCtaText}>Responder agora</Text>
                                <AppIcon name="chevronForward" size={20} tone="onAccent" />
                            </LinearGradient>
                        </Animated.View>
                    </LinearGradient>
                </View>
            </Animated.View>
        </Pressable>
    );
}

// =============================================================================
// LOCKED VARIANT — o piso de histórico, ou o status que não carregou
// =============================================================================

type LockedLock = Exclude<ReadinessLock, { kind: 'open' }>;

const LOCKED_COPY: Record<LockedLock['kind'], { chip: string; icon: AppIconName; title: string }> = {
    aprendendo: {
        chip: 'Aprendendo seu normal',
        icon: 'running',
        title: 'Calibrando sua prontidão',
    },
    indisponivel: {
        chip: 'Indisponível agora',
        icon: 'warning',
        title: 'Não consegui verificar seu histórico',
    },
};

function ReadinessCardLocked({ lock }: { lock: LockedLock }) {
    useThemeSubscription();
    const copy = LOCKED_COPY[lock.kind];
    const body =
        lock.kind === 'aprendendo'
            ? describeFloorProgress(lock.learning)
            : 'Pode ser a conexão. Puxe a tela para baixo para tentar de novo.';
    const footnote = lock.kind === 'aprendendo' ? FLOOR_EXPLANATION : null;

    return (
        <LinearGradient
            colors={[semanticColors.surface1, semanticColors.surface2, semanticColors.surface1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lockedCard}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${copy.title}. ${body}${footnote ? ` ${footnote}` : ''}`}
        >
            <View style={styles.lockedHeader}>
                <View style={styles.lockedChip}>
                    <AppIcon name="lock" size={16} tone="secondary" variant="filled" />
                    <Text style={styles.lockedChipText}>{copy.chip}</Text>
                </View>
                <View style={styles.lockedIconBubble}>
                    <AppIcon name={copy.icon} size={20} tone="secondary" />
                </View>
            </View>

            <Text style={styles.lockedTitle}>{copy.title}</Text>
            <Text style={styles.lockedSubtitle}>{body}</Text>

            {footnote ? (
                <View style={styles.lockedFootnote}>
                    <AppIcon name="info" size={16} tone="tertiary" />
                    <Text style={styles.lockedFootnoteText}>{footnote}</Text>
                </View>
            ) : null}
        </LinearGradient>
    );
}

// =============================================================================
// COMPLETED VARIANT — calm summary, tocável
// =============================================================================

function ReadinessCardDone({
    readiness,
    onPress,
}: {
    readiness: ReadinessBlock;
    onPress: () => void;
}) {
    useThemeSubscription();
    const color = readiness.statusColor ?? 'green';
    const { accent, subtle } = readinessSignalColors(color);
    const gradient: [string, string, string] = [
        semanticColors.surface1,
        semanticColors.surface2,
        subtle,
    ];
    const score = readiness.score ?? 0;
    const dims = readiness.dimensions;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => (pressed ? styles.donePressed : undefined)}
            accessibilityRole="button"
            accessibilityLabel={`Prontidão de hoje: ${score}, ${signalLabel(color, readiness.statusLabel)}`}
            accessibilityHint="Abre a análise completa de hoje"
        >
            <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.doneCard}
            >
                <LinearGradient
                    colors={[`${accent}33`, semanticColors.transparent]}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0.1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />

                <View style={styles.doneHeader}>
                    <View style={[styles.doneChip, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
                        <AppIcon name="check" size={16} tone="secondary" variant="filled" />
                        <Text style={styles.doneChipText}>Respondido hoje</Text>
                    </View>
                    {/* A affordance de que o card abre alguma coisa. */}
                    <AppIcon name="chevronForward" size={20} tone="tertiary" />
                </View>

                <View style={styles.doneBody}>
                    <View style={styles.doneScoreSide}>
                        <Text style={[styles.doneScore, { color: accent }]}>{score}</Text>
                        <View style={styles.doneSignal}>
                            <ReadinessSignal color={color} label={readiness.statusLabel} size="sm" />
                        </View>
                    </View>

                    {dims && (
                        <View style={styles.dimensionsRow}>
                            {(Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>).map(
                                (key) => {
                                    const value = (dims[key] ?? 0) as number;
                                    const heightPct = Math.max(0.15, value / 5);
                                    return (
                                        <View key={key} style={styles.dimensionCol}>
                                            <View style={styles.dimensionBarTrack}>
                                                <View
                                                    style={[
                                                        styles.dimensionBarFill,
                                                        {
                                                            height: `${heightPct * 100}%`,
                                                            backgroundColor: accent,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <AppIcon
                                                name={DIMENSION_ICONS[key]}
                                                size={16}
                                                tone="secondary"
                                                style={{ marginTop: 4 }}
                                            />
                                        </View>
                                    );
                                },
                            )}
                        </View>
                    )}
                </View>
            </LinearGradient>
        </Pressable>
    );
}

const styles = createThemeStyles(() => ({
    // ============ PENDING ============
    pendingShell: {
        borderRadius: borderRadius['2xl'],
        overflow: 'hidden',
        padding: 2, // thickness of the rotating halo border
        ...shadows.neonStrong,
    },
    rotatingHalo: {
        position: 'absolute',
        top: -120,
        left: -120,
        right: -120,
        bottom: -120,
    },
    pendingInner: {
        borderRadius: borderRadius['2xl'] - 2,
        padding: spacing.lg,
        overflow: 'hidden',
    },
    pendingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    pendingChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: semanticColors.accentSubtle,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    pendingChipText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        letterSpacing: 0.4,
    },
    pendingIconBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.accentSubtle,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    pendingTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes['2xl'],
        color: colors.text,
        marginBottom: spacing.xs,
    },
    pendingSubtitle: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: typography.fontSizes.sm * typography.lineHeights.relaxed,
    },
    pendingCta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
    },
    pendingCtaText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.base,
        color: semanticColors.textOnAccent,
        letterSpacing: 0.3,
    },

    // ============ LOCKED ============
    lockedCard: {
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
        gap: spacing.sm,
        ...shadows.md,
    },
    lockedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    lockedChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: semanticColors.glass,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    lockedChipText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        letterSpacing: 0.4,
    },
    lockedIconBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    lockedTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
        marginBottom: 2,
    },
    lockedSubtitle: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: typography.fontSizes.sm * typography.lineHeights.relaxed,
    },
    lockedFootnote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: semanticColors.borderSubtle,
    },
    lockedFootnoteText: {
        flex: 1,
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },

    // ============ DONE ============
    donePressed: {
        opacity: 0.85,
    },
    doneCard: {
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
        ...shadows.md,
    },
    doneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    doneChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    doneChipText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        letterSpacing: 0.4,
    },
    doneBody: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
    },
    doneScoreSide: {
        flex: 1,
    },
    doneScore: {
        fontFamily: fonts.bold,
        fontSize: 56,
        lineHeight: 60,
    },
    doneSignal: {
        marginTop: spacing.xs,
    },
    dimensionsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.xs,
        height: 76,
    },
    dimensionCol: {
        width: 18,
        alignItems: 'center',
    },
    dimensionBarTrack: {
        width: 8,
        height: 56,
        backgroundColor: semanticColors.borderSubtle,
        borderRadius: borderRadius.full,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    dimensionBarFill: {
        width: '100%',
        borderRadius: borderRadius.full,
    },
}));
