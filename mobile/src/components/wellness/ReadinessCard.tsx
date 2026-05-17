import React, { useEffect, useRef } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import type { ReadinessBlock } from '../../types/wellness.types';

interface ReadinessCardProps {
    readiness: ReadinessBlock;
    /**
     * True when the user has completed at least one workout. The check-in
     * remains gated behind a first run to avoid noisy data and reinforce
     * the connection between training and recovery readings.
     */
    isUnlocked: boolean;
    onPressQuiz: () => void;
}

const DIMENSION_LABELS = {
    sleep: 'Sono',
    legs: 'Pernas',
    mood: 'Humor',
    stress: 'Estresse',
    motivation: 'Motivação',
} as const;

const DIMENSION_ICONS: Record<keyof typeof DIMENSION_LABELS, string> = {
    sleep: 'moon-outline',
    legs: 'walk-outline',
    mood: 'happy-outline',
    stress: 'cloud-outline',
    motivation: 'flash-outline',
};

const STATUS_GRADIENT: Record<'red' | 'yellow' | 'green', [string, string, string]> = {
    green: ['#1A2E1F', '#1E4035', '#0F1A35'],
    yellow: ['#2E2A1A', '#403A1E', '#1A1A2E'],
    red: ['#2E1A1A', '#401E1E', '#1A1A2E'],
};

const STATUS_COLOR: Record<'red' | 'yellow' | 'green', string> = {
    green: colors.success,
    yellow: colors.warning,
    red: colors.error,
};

export function ReadinessCard({
    readiness,
    isUnlocked,
    onPressQuiz,
}: ReadinessCardProps) {
    if (readiness.hasCompletedToday) {
        return <ReadinessCardDone readiness={readiness} />;
    }
    if (!isUnlocked) {
        return <ReadinessCardLocked />;
    }
    return <ReadinessCardPending onPress={onPressQuiz} />;
}

// =============================================================================
// PENDING VARIANT — premium animated invite
// =============================================================================

function ReadinessCardPending({ onPress }: { onPress: () => void }) {
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
                                'rgba(0,212,255,0.55)',
                                'rgba(151,71,255,0.35)',
                                'rgba(0,212,255,0)',
                                'rgba(0,212,255,0.55)',
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                    </Animated.View>

                    {/* Inner card */}
                    <LinearGradient
                        colors={['#0E0E1F', '#1A1A2E', '#0F1A35']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.pendingInner}
                    >
                        <LinearGradient
                            colors={['rgba(0,212,255,0.18)', 'transparent']}
                            start={{ x: 1, y: 0 }}
                            end={{ x: 0.2, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        />

                        <View style={styles.pendingHeader}>
                            <View style={styles.pendingChip}>
                                <Ionicons name="sparkles" size={12} color={colors.primary} />
                                <Text style={styles.pendingChipText}>Check-in diário</Text>
                            </View>
                            <Animated.View style={{ opacity: iconPulse }}>
                                <View style={styles.pendingIconBubble}>
                                    <Ionicons name="heart" size={20} color={colors.primary} />
                                </View>
                            </Animated.View>
                        </View>

                        <Text style={styles.pendingTitle}>
                            Como você está se sentindo hoje?
                        </Text>
                        <Text style={styles.pendingSubtitle}>
                            Responda em 30 segundos para liberar seu score de prontidão e
                            ajustar o treino de hoje.
                        </Text>

                        <Animated.View
                            style={{
                                transform: [{ scale: pulse }],
                                marginTop: spacing.lg,
                            }}
                        >
                            <LinearGradient
                                colors={[colors.primary, '#7B6BFF']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.pendingCta}
                            >
                                <Text style={styles.pendingCtaText}>Responder agora</Text>
                                <Ionicons name="arrow-forward" size={18} color="#0A0A18" />
                            </LinearGradient>
                        </Animated.View>
                    </LinearGradient>
                </View>
            </Animated.View>
        </Pressable>
    );
}

// =============================================================================
// LOCKED VARIANT — gated behind first workout
// =============================================================================

function ReadinessCardLocked() {
    return (
        <LinearGradient
            colors={['#15152A', '#1A1A2E', '#0F1A35']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lockedCard}
        >
            <View style={styles.lockedHeader}>
                <View style={styles.lockedChip}>
                    <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
                    <Text style={styles.lockedChipText}>Check-in bloqueado</Text>
                </View>
                <View style={styles.lockedIconBubble}>
                    <Ionicons name="footsteps-outline" size={20} color={colors.textSecondary} />
                </View>
            </View>

            <Text style={styles.lockedTitle}>
                Complete seu primeiro treino
            </Text>
            <Text style={styles.lockedSubtitle}>
                O check-in diário e o score de prontidão são liberados assim
                que você concluir sua primeira corrida.
            </Text>

            <View style={styles.lockedFootnote}>
                <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
                <Text style={styles.lockedFootnoteText}>
                    Precisamos de pelo menos 1 treino para calibrar suas análises.
                </Text>
            </View>
        </LinearGradient>
    );
}

// =============================================================================
// COMPLETED VARIANT — calm summary
// =============================================================================

function ReadinessCardDone({ readiness }: { readiness: ReadinessBlock }) {
    const color = readiness.statusColor ?? 'green';
    const gradient = STATUS_GRADIENT[color];
    const accent = STATUS_COLOR[color];
    const score = readiness.score ?? 0;
    const dims = readiness.dimensions;

    return (
        <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.doneCard}
        >
            <LinearGradient
                colors={[`${accent}33`, 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <View style={styles.doneHeader}>
                <View style={[styles.doneChip, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
                    <Ionicons name="checkmark-circle" size={12} color={accent} />
                    <Text style={[styles.doneChipText, { color: accent }]}>
                        Respondido hoje
                    </Text>
                </View>
            </View>

            <View style={styles.doneBody}>
                <View style={styles.doneScoreSide}>
                    <Text style={[styles.doneScore, { color: accent }]}>{score}</Text>
                    <Text style={styles.doneStatusLabel}>
                        {readiness.statusLabel ?? 'Prontidão de hoje'}
                    </Text>
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
                                        <Ionicons
                                            name={DIMENSION_ICONS[key] as any}
                                            size={12}
                                            color={colors.textSecondary}
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
    );
}

const styles = StyleSheet.create({
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
        backgroundColor: 'rgba(0,212,255,0.14)',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.28)',
    },
    pendingChipText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
        letterSpacing: 0.4,
    },
    pendingIconBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,212,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.30)',
    },
    pendingTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: spacing.xs,
    },
    pendingSubtitle: {
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
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold,
        color: '#0A0A18',
        letterSpacing: 0.3,
    },

    // ============ LOCKED ============
    lockedCard: {
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
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
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    lockedChipText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
        letterSpacing: 0.4,
    },
    lockedIconBubble: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    lockedTitle: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: 2,
    },
    lockedSubtitle: {
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
        borderTopColor: 'rgba(255,255,255,0.04)',
    },
    lockedFootnoteText: {
        flex: 1,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },

    // ============ DONE ============
    doneCard: {
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        ...shadows.md,
    },
    doneHeader: {
        flexDirection: 'row',
        alignItems: 'center',
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
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
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
        fontSize: 56,
        fontWeight: typography.fontWeights.bold,
        lineHeight: 60,
    },
    doneStatusLabel: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: borderRadius.full,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    dimensionBarFill: {
        width: '100%',
        borderRadius: borderRadius.full,
    },
});
