import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface QuizProgressBarProps {
    currentStep: number;
    totalSteps?: number;
}

// Lightning/Flash Icon for XP badge
const FlashIcon = () => (
    <Svg width={15} height={15} viewBox="0 0 15 15" fill="none">
        <Path
            d="M8.625 0.9375L3.28125 8.4375H7.5L6.375 14.0625L11.7188 6.5625H7.5L8.625 0.9375Z"
            fill="#00D4FF"
        />
    </Svg>
);

export function QuizProgressBar({ currentStep, totalSteps = 9 }: QuizProgressBarProps) {
    const progress = ((currentStep + 1) / totalSteps) * 100;
    const xp = (currentStep + 1) * 10; // 10 XP por step

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
        paddingHorizontal: 9,
        marginBottom: 32,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    scoreLabel: {
        fontSize: 14,
        fontWeight: '400',
        fontFamily: 'Poppins',
        color: 'rgba(235, 235, 245, 1)', // var(--text/primary)
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#131313', // var(--bg/secondary)
        borderWidth: 1,
        borderColor: '#00D4FF', // var(--accent/cyan-primary)
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        gap: 4,
    },
    xpText: {
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'Inter',
        color: '#00D4FF', // var(--accent/cyan-primary)
    },
    progressBarContainer: {
        height: 4,
        backgroundColor: 'rgba(235, 235, 245, 0.1)', // var(--neutral/glass-stroke)
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#00D4FF', // var(--accent/cyan-primary)
        borderRadius: 20,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: 11,
        fontWeight: '400',
        fontFamily: 'Poppins',
        color: 'rgba(235, 235, 245, 0.6)', // var(--text/secondary)
    },
    progressValue: {
        fontSize: 11,
        fontWeight: '700',
        fontFamily: 'Inter',
        color: '#00D4FF', // var(--accent/cyan-primary)
    },
});
