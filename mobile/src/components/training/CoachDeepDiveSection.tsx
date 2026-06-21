/**
 * "Aprofundar com o coach" — on-demand deep-dive briefing (Pro feature).
 *
 * Implements the 4 visual states from spec-visual-briefing-estados.md:
 *   1. Inicial   → "+" prompt (no briefing yet)
 *   2. Carregando→ honeycomb loader + rotating messages (POST in flight)
 *   3. Revelando → typing reveal of the response (client-side effect)
 *   4. Completo  → full text + "Gerado para este treino" seal
 *
 * Free users tapping "+" are routed to the paywall instead of calling the API.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../theme';
import { useWorkoutBriefing } from '../../hooks/useWorkoutBriefing';
import { useTypingReveal } from '../../hooks/useTypingReveal';
import { useProFeature } from '../../hooks/useProFeature';
import { HoneycombLoader } from '../ui/HoneycombLoader';
import { Skeleton } from '../Skeleton';

const LOADING_MESSAGES = [
    'Coach analisando seu treino...',
    'Calibrando pro seu nível...',
    'Quase pronto...',
];

export function CoachDeepDiveSection({ workoutId }: { workoutId: string | undefined }) {
    const { phase, briefing, generate, onRevealComplete } = useWorkoutBriefing(workoutId);
    const { isFree, openUpgrade } = useProFeature();

    const { displayed, isRevealing } = useTypingReveal(briefing?.content ?? '', {
        enabled: phase === 'revealing',
        onDone: onRevealComplete,
    });

    // Rotating messages during the loading state.
    const [msgIndex, setMsgIndex] = useState(0);
    useEffect(() => {
        if (phase !== 'generating') {
            setMsgIndex(0);
            return;
        }
        const id = setInterval(() => {
            setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
        }, 1400);
        return () => clearInterval(id);
    }, [phase]);

    const handlePlus = () => {
        if (isFree) {
            openUpgrade();
            return;
        }
        void generate().catch(() => {
            // generate() already resets phase to 'empty' on failure; swallow here
            // so an unhandled rejection doesn't surface to the user.
        });
    };

    // ── Estado: loading (checking backend) ───────────────────────────────────
    if (phase === 'loading') {
        return (
            <View style={styles.card}>
                <Skeleton width="60%" height={16} borderRadius={6} />
                <View style={{ height: spacing.sm }} />
                <Skeleton width="40%" height={12} borderRadius={6} />
            </View>
        );
    }

    // ── Estado 1: inicial (no briefing yet) ──────────────────────────────────
    if (phase === 'empty') {
        return (
            <View style={styles.card}>
                <View style={styles.row}>
                    <View style={styles.flex}>
                        <Text style={styles.title}>Aprofundar com o coach</Text>
                        <Text style={styles.subtitle}>Explicação detalhada deste treino</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.plusButton}
                        onPress={handlePlus}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Aprofundar com o coach"
                        accessibilityHint="Gera uma explicação detalhada deste treino"
                    >
                        <Ionicons name="add" size={24} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── Estado 2: carregando ─────────────────────────────────────────────────
    if (phase === 'generating') {
        return (
            <View style={styles.card}>
                <View style={styles.loadingRow}>
                    <HoneycombLoader size={64} />
                    <Text style={styles.loadingText}>{LOADING_MESSAGES[msgIndex]}</Text>
                </View>
            </View>
        );
    }

    // ── Estado 3 & 4: revelando / completo ───────────────────────────────────
    const isDone = phase === 'done' || phase === 'persisted';
    const text = isDone ? briefing?.content ?? '' : displayed;

    return (
        <View style={styles.card}>
            <View style={styles.coachHeader}>
                <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
                <Text style={styles.coachLabel}>Coach</Text>
            </View>
            <Text style={styles.coachText}>
                {text}
                {phase === 'revealing' && isRevealing ? (
                    <Text style={styles.cursor}>▍</Text>
                ) : null}
            </Text>
            {isDone && (
                <View style={styles.seal}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.sealText}>Gerado para este treino</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#15152A',
        borderRadius: 16,
        padding: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.08)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },
    flex: { flex: 1 },
    title: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    plusButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.4)',
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    loadingText: {
        flex: 1,
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.75)',
        fontWeight: typography.fontWeights.medium as any,
    },
    coachHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    coachLabel: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.primary,
        letterSpacing: 0.5,
    },
    coachText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.85)',
        lineHeight: 21,
    },
    cursor: {
        color: colors.primary,
    },
    seal: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: spacing.md,
    },
    sealText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.55)',
        fontWeight: typography.fontWeights.medium as any,
    },
});
