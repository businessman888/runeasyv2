import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useStatsStore, useFeedbackStore, useGamificationStore } from '../stores';

export function StatsScreen({ navigation }: any) {
    useThemeSubscription();
    const { fetchAllStats } = useStatsStore();
    const { latestSummary } = useFeedbackStore();
    const { stats: gamStats } = useGamificationStore();

    React.useEffect(() => {
        fetchAllStats();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>RUNEASY AI</Text>
                <TouchableOpacity style={styles.headerButton}>
                    <Text style={styles.shareIcon}>⬆</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Hero Message */}
                <View style={styles.hero}>
                    <View style={styles.verifiedBadge}>
                        <Text style={styles.verifiedIcon}>✓</Text>
                        <Text style={styles.verifiedText}>Plan Executed Perfectly</Text>
                    </View>
                    <Text style={styles.heroTitle}>
                        Impressive{'\n'}
                        <Text style={styles.heroGradient}>Performance!</Text>
                    </Text>
                    <Text style={styles.heroSubtitle}>
                        You maintained target pace for 95% of the workout duration.
                    </Text>
                </View>

                {/* Performance Metrics */}
                <View style={styles.metricsSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Performance Metrics</Text>
                        <Text style={styles.sectionSubtitle}>PLANNED VS ACTUAL</Text>
                    </View>

                    {/* Pace Metric */}
                    <View style={[styles.metricCard, styles.metricCardPrimary]}>
                        <View style={styles.metricAccent} />
                        <View style={styles.metricHeader}>
                            <View style={styles.metricLabelRow}>
                                <View style={[styles.metricIconBox, styles.metricIconPrimary]}>
                                    <Text style={styles.metricIconText}>⚡</Text>
                                </View>
                                <Text style={styles.metricLabel}>Avg Pace</Text>
                            </View>
                            <View style={styles.improveBadge}>
                                <Text style={styles.improveBadgeText}>+0.5%</Text>
                            </View>
                        </View>
                        <View style={styles.metricValues}>
                            <Text style={styles.metricActual}>4:58</Text>
                            <Text style={styles.metricPlanned}>/ 5:00 <Text style={styles.metricUnit}>min/km</Text></Text>
                        </View>
                        <View style={styles.metricProgressBg}>
                            <View style={[styles.metricProgressFill, { width: '95%' }]} />
                        </View>
                    </View>

                    {/* Distance Metric */}
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <View style={styles.metricLabelRow}>
                                <View style={[styles.metricIconBox, styles.metricIconIndigo]}>
                                    <Text style={styles.metricIconText}>📏</Text>
                                </View>
                                <Text style={styles.metricLabel}>Distance</Text>
                            </View>
                            <View style={styles.onTargetBadge}>
                                <Text style={styles.onTargetBadgeText}>On Target</Text>
                            </View>
                        </View>
                        <View style={styles.metricValues}>
                            <Text style={styles.metricActual}>5.10</Text>
                            <Text style={styles.metricPlanned}>/ 5.00 <Text style={styles.metricUnit}>km</Text></Text>
                        </View>
                        <View style={styles.metricProgressBg}>
                            <View style={[styles.metricProgressFillIndigo, { width: '100%' }]} />
                        </View>
                    </View>
                </View>

                {/* AI Technical Analysis */}
                <View style={styles.analysisSection}>
                    <Text style={styles.sectionTitle}>AI Technical Analysis</Text>

                    <View style={styles.insightStrength}>
                        <View style={styles.insightHeader}>
                            <Text style={styles.insightIconSuccess}>📈</Text>
                            <Text style={styles.insightTitle}>Cadence Consistency</Text>
                        </View>
                        <Text style={styles.insightText}>
                            You maintained a steady cadence of 178 spm on uphill segments, showing excellent muscular endurance.
                        </Text>
                    </View>

                    <View style={styles.insightWeakness}>
                        <View style={styles.insightHeader}>
                            <Text style={styles.insightIconWarning}>⚡</Text>
                            <Text style={styles.insightTitle}>Negative Split Potential</Text>
                        </View>
                        <Text style={styles.insightText}>
                            Your pace dropped by 10s/km in the final kilometer. Try conserving energy in the first half for a stronger finish.
                        </Text>
                    </View>
                </View>

                {/* Plan Progress */}
                <View style={styles.planSection}>
                    <View style={styles.planCard}>
                        <View style={styles.planBlur} />
                        <View style={styles.planContent}>
                            <Text style={styles.planTitle}>Marathon Prep Plan</Text>
                            <Text style={styles.planSubtitle}>Week 4 of 12 • Build Phase</Text>
                            <View style={styles.planStats}>
                                <Text style={styles.planValue}>
                                    32<Text style={styles.planValueSub}>/40 km</Text>
                                </Text>
                                <Text style={styles.planLabel}>WEEKLY VOLUME</Text>
                            </View>
                            <View style={styles.planProgressBg}>
                                <View style={[styles.planProgressFill, { width: '80%' }]} />
                            </View>
                            <Text style={styles.planRemaining}>Just 8km left this week!</Text>
                        </View>
                    </View>
                </View>

                {/* Rewards */}
                <View style={styles.rewardsSection}>
                    <Text style={styles.sectionTitle}>Rewards</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.rewardsScroll}
                    >
                        <View style={styles.rewardCardXP}>
                            <View style={styles.rewardIcon}>
                                <Text style={styles.rewardIconText}>⭐</Text>
                            </View>
                            <Text style={styles.rewardValue}>+150</Text>
                            <Text style={styles.rewardLabel}>XP GAINED</Text>
                        </View>

                        <View style={styles.rewardCardBadge}>
                            <View style={[styles.rewardIcon, styles.rewardIconBadge]}>
                                <Text style={styles.rewardIconText}>🔥</Text>
                            </View>
                            <Text style={styles.rewardName}>Early Bird</Text>
                            <Text style={styles.rewardStatus}>BADGE UNLOCKED</Text>
                        </View>

                        <View style={styles.rewardCardStreak}>
                            <View style={[styles.rewardIcon, styles.rewardIconStreak]}>
                                <Text style={styles.rewardIconText}>📅</Text>
                            </View>
                            <Text style={styles.rewardValue}>5</Text>
                            <Text style={styles.rewardLabelStreak}>DAY STREAK</Text>
                        </View>
                    </ScrollView>
                </View>

                <View style={styles.spacer} />
            </ScrollView>

            {/* Bottom Button */}
            <View style={styles.bottomAction}>
                <TouchableOpacity
                    style={styles.doneButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: `${colors.white}B3`,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.border}80`,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(10px)' } : {}),
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.highlight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeIcon: {
        fontSize: 20,
        color: colors.text,
    },
    shareIcon: {
        fontSize: 20,
        color: colors.text,
    },
    headerTitle: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        letterSpacing: 2,
    },
    scrollView: {
        flex: 1,
    },
    hero: {
        alignItems: 'center',
        paddingTop: spacing['2xl'],
        paddingBottom: spacing.lg,
        paddingHorizontal: spacing.lg,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        backgroundColor: `${colors.success}1A`,
        borderRadius: borderRadius.full,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.success}33`,
    },
    verifiedIcon: {
        fontSize: 16,
        color: colors.success,
    },
    verifiedText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold,
        color: colors.success,
        letterSpacing: 1,
    },
    heroTitle: {
        fontSize: 36,
        fontWeight: typography.fontWeights.extrabold,
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.sm,
        letterSpacing: -1,
    },
    heroGradient: {
        color: colors.primary,
    },
    heroSubtitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.medium,
        color: colors.textMuted,
        textAlign: 'center',
        maxWidth: 280,
    },
    metricsSection: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
        gap: spacing.md,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: spacing.md,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        letterSpacing: -0.5,
    },
    sectionSubtitle: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textMuted,
        letterSpacing: 1.5,
    },
    metricCard: {
        position: 'relative',
        backgroundColor: colors.white,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
        overflow: 'hidden',
        ...shadows.sm,
    },
    metricCardPrimary: {},
    metricAccent: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 4,
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(180deg, #00D4FF 0%, #00FFFF 100%)',
        } : {
            backgroundColor: colors.primary,
        }),
    },
    metricHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.sm,
    },
    metricLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    metricIconBox: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.lg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    metricIconPrimary: {
        backgroundColor: `${colors.primary}1A`,
    },
    metricIconIndigo: {
        backgroundColor: semanticColors.surface3,
    },
    metricIconText: {
        fontSize: 20,
    },
    metricLabel: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.textSecondary,
    },
    improveBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        backgroundColor: `${colors.success}1A`,
        borderRadius: borderRadius.sm,
    },
    improveBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.medium,
        color: colors.success,
    },
    onTargetBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        backgroundColor: colors.highlight,
    },
    onTargetBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.medium,
        color: colors.textMuted,
    },
    metricValues: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.md,
        marginTop: 4,
    },
    metricActual: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.extrabold,
        color: colors.text,
        letterSpacing: -1,
    },
    metricPlanned: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.medium,
        color: colors.textMuted,
    },
    metricUnit: {
        fontSize: typography.fontSizes.xs,
    },
    metricProgressBg: {
        height: 6,
        backgroundColor: colors.highlight,
        borderRadius: borderRadius.full,
        marginTop: spacing.md,
        overflow: 'hidden',
    },
    metricProgressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: borderRadius.full,
    },
    metricProgressFillIndigo: {
        height: '100%',
        backgroundColor: '#6366F1',
        borderRadius: borderRadius.full,
    },
    analysisSection: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
        gap: spacing.md,
    },
    insightStrength: {
        borderLeftWidth: 4,
        borderLeftColor: colors.success,
        backgroundColor: colors.white,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.sm,
    },
    insightWeakness: {
        borderLeftWidth: 4,
        borderLeftColor: colors.warning,
        backgroundColor: colors.white,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.sm,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    insightIconSuccess: {
        fontSize: 20,
    },
    insightIconWarning: {
        fontSize: 20,
    },
    insightTitle: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    insightText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    planSection: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.lg,
    },
    planCard: {
        position: 'relative',
        backgroundColor: colors.text,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        overflow: 'hidden',
        ...shadows.lg,
    },
    planBlur: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 160,
        height: 160,
        backgroundColor: colors.primary,
        opacity: 0.2,
        borderRadius: 80,
    },
    planContent: {
        position: 'relative',
        zIndex: 10,
    },
    planTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
    planSubtitle: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        marginTop: 4,
        marginBottom: spacing.lg,
    },
    planStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: spacing.sm,
    },
    planValue: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
    planValueSub: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: semanticColors.textSecondary,
    },
    planLabel: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        letterSpacing: 1.5,
    },
    planProgressBg: {
        height: 8,
        backgroundColor: semanticColors.borderSubtle,
        borderRadius: borderRadius.full,
        overflow: 'hidden',
    },
    planProgressFill: {
        height: '100%',
        borderRadius: borderRadius.full,
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(90deg, #00D4FF 0%, #00FFFF 100%)',
            boxShadow: '0 0 10px rgba(0, 212, 255, 0.6)',
        } : {
            backgroundColor: colors.primary,
        }),
    },
    planRemaining: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textSecondary,
        marginTop: spacing.md,
        textAlign: 'right',
    },
    rewardsSection: {
        paddingBottom: spacing.lg,
    },
    rewardsScroll: {
        paddingLeft: spacing.lg,
        marginTop: spacing.md,
    },
    rewardCardXP: {
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
        backgroundColor: `${colors.primary}0D`,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: `${colors.primary}33`,
        marginRight: spacing.md,
    },
    rewardCardBadge: {
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        marginRight: spacing.md,
    },
    rewardCardStreak: {
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        marginRight: spacing.lg,
    },
    rewardIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: `${colors.primary}33`,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rewardIconBadge: {
        backgroundColor: semanticColors.surface3,
    },
    rewardIconStreak: {
        backgroundColor: semanticColors.surface3,
    },
    rewardIconText: {
        fontSize: 24,
    },
    rewardValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.extrabold,
        color: colors.text,
    },
    rewardLabel: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        letterSpacing: 1,
    },
    rewardName: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginTop: 4,
    },
    rewardStatus: {
        fontSize: 10,
        fontWeight: typography.fontWeights.medium,
        color: '#9333EA',
        letterSpacing: 0.5,
    },
    rewardLabelStreak: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold,
        color: '#EA580C',
        letterSpacing: 1,
    },
    spacer: {
        height: 100,
    },
    bottomAction: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: `${colors.white}CC`,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)' } : {}),
    },
    doneButton: {
        height: 56,
        backgroundColor: colors.primary,
        borderRadius: borderRadius.xl,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: semanticColors.canvas,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
            },
            android: {
                elevation: 6,
            },
            web: {
                boxShadow: '0 4px 16px rgba(0, 212, 255, 0.3)',
            },
        }),
    },
    doneButtonText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
}));
