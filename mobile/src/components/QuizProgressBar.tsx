import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, borderRadius } from '../theme';

interface QuizProgressBarProps {
    currentStep: number;
    totalSteps?: number;
}

// Lightning/Flash Icon for XP badge
const FlashIcon = () => (
    <Svg width={15} height={15} viewBox="0 0 15 15" fill="none">
        <Path
            d="M8.625 0.9375L3.28125 8.4375H7.5L6.375 14.0625L11.7188 6.5625H7.5L8.625 0.9375Z"
            fill={colors.primary}
        />
    </Svg>
);

export function QuizProgressBar({ currentStep, totalSteps = 14 }: QuizProgressBarProps) {
    const progress = (currentStep / totalSteps) * 100;
    const xp = currentStep * 10; // 10 XP por step

    return (
        <View style={styles.container}>
            {/* Top Row: Pontuação label and XP badge */}
            <View style={styles.topRow}>
                <Text style={styles.scoreLabel}>Pontuação</Text>
                <View style={styles.xpBadge}>
                    <FlashIcon />
                    <Text style={styles.xpText}>{xp}XP</Text>
                </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
                <View
                    style={[
                        styles.progressBarFill,
                        { width: `${progress}%` }
                    ]}
                />
            </View>

            {/* Bottom Row: Progress label  */}
            <View style={styles.bottomRow}>
                <Text style={styles.progressLabel}>
                    Progresso:{' '}
                    <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 4,
        marginBottom: 24,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    scoreLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textLight,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: borderRadius.full,
        paddingHorizontal: 12,
        paddingVertical: 5,
        gap: 4,
    },
    xpText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
    },
    progressBarContainer: {
        height: 4,
        backgroundColor: colors.glassWhite,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: borderRadius.full,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    progressValue: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
});
