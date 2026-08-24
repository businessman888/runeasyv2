import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows, createThemeStyles, useThemeSubscription } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { LevelProgressBar } from './LevelProgressBar';

export interface LevelCardStats {
    current_level: number;
    total_points: number;
    points_to_next_level: number;
    points_for_next_level: number;
    progress_pct: number;
    current_streak?: number;
}

interface LevelCardProps {
    stats: LevelCardStats | null;
    /** Slot to inject the patent icon (provided by Sprint C). When null, falls back to a flash icon. */
    patentSlot?: ReactNode;
    /** Optional level name resolved from the current patent (e.g. "Atleta"). */
    patentName?: string;
    variant?: 'home' | 'badges';
}

export function LevelCard({ stats, patentSlot, patentName, variant = 'home' }: LevelCardProps) {
    useThemeSubscription();
    const level = stats?.current_level ?? 1;
    const totalPoints = stats?.total_points ?? 0;
    const pointsToNext = stats?.points_to_next_level ?? 1000;
    const progressPct = stats?.progress_pct ?? 0;
    const streak = stats?.current_streak ?? 0;

    return (
        <LinearGradient
            colors={[semanticColors.surface1, semanticColors.surface2, semanticColors.surface3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
        >
            {/* Keep the original overlay geometry, using the neutral palette. */}
            <LinearGradient
                colors={[semanticColors.glass, semanticColors.transparent]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.2, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <View style={styles.topRow}>
                <View style={styles.eliteChip}>
                    <Ionicons name="flash" size={12} color={semanticColors.accent} />
                    <Text style={styles.eliteChipText}>Elite status</Text>
                </View>
                <View style={styles.patentSlot}>
                    {patentSlot ?? <Ionicons name="diamond" size={26} color={semanticColors.accent} />}
                </View>
            </View>

            <View style={styles.titleRow}>
                <Text style={styles.levelLabel}>Nível</Text>
                <Text style={styles.levelNumber}>{level}</Text>
                {patentName ? <Text style={styles.patentName}>{patentName}</Text> : null}
            </View>

            <View style={styles.xpRow}>
                <Text style={styles.xpCurrent}>
                    {totalPoints.toLocaleString('pt-BR')} XP
                </Text>
                <Text style={styles.xpDivider}>·</Text>
                <Text style={styles.xpNext}>
                    {pointsToNext.toLocaleString('pt-BR')} XP para o próximo nível
                </Text>
            </View>

            <LevelProgressBar percentage={progressPct} height={8} />

            <View style={styles.footerRow}>
                <Text style={styles.footerText}>Nível {level}</Text>
                <Text style={styles.footerProgressText}>
                    {Math.round(progressPct)}%
                </Text>
                <Text style={styles.footerText}>Nível {level + 1}</Text>
            </View>

            {variant === 'badges' && streak > 0 ? (
                <View style={styles.streakRow}>
                    <Ionicons name="flame" size={16} color={semanticColors.accent} />
                    <Text style={styles.streakText}>Combo: {streak} dias</Text>
                </View>
            ) : null}
        </LinearGradient>
    );
}

const styles = createThemeStyles(() => ({
    card: {
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
        ...shadows.neon,
        shadowColor: semanticColors.canvas,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    eliteChip: {
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
    eliteChipText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.accent,
        letterSpacing: 0.4,
    },
    patentSlot: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.sm,
        flexWrap: 'wrap',
    },
    levelLabel: {
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    levelNumber: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.textPrimary,
        lineHeight: typography.fontSizes['3xl'] * 1.05,
    },
    patentName: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.textPrimary,
        marginLeft: spacing.xs,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        flexWrap: 'wrap',
    },
    xpCurrent: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.textPrimary,
    },
    xpDivider: {
        color: semanticColors.textTertiary,
    },
    xpNext: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        flexShrink: 1,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 2,
    },
    footerText: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
        fontWeight: typography.fontWeights.medium,
    },
    footerProgressText: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.accent,
        fontWeight: typography.fontWeights.bold,
    },
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    streakText: {
        fontSize: typography.fontSizes.sm,
        color: colors.completed,
        fontWeight: typography.fontWeights.semibold,
    },
}));
