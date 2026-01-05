import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useAuthStore } from '../stores';
import * as Storage from '../utils/storage';

const GOAL_LABELS: Record<string, string> = {
    '5k': 'Correr 5K',
    '10k': 'Correr 10K',
    'half_marathon': 'Meia Maratona',
    'marathon': 'Maratona',
    'general_fitness': 'Condicionamento Geral',
};

const LEVEL_LABELS: Record<string, string> = {
    'beginner': 'Iniciante',
    'intermediate': 'Intermediário',
    'advanced': 'Avançado',
};

export function PlanPreviewScreen({ navigation, route }: any) {
    const {
        userId,
        planId,
        workoutsCount,
        goal,
        targetWeeks,
        daysPerWeek,
        level,
        // AI-generated plan preview data
        planHeader,
        planHeadline,
        welcomeBadge,
        nextWorkout,
        fullSchedulePreview,
    } = route.params || {};
    const { login } = useAuthStore();
    const [isUnlocking, setIsUnlocking] = React.useState(false);

    const handleUnlockPlan = async () => {
        setIsUnlocking(true);

        try {
            // Store userId and authenticate the user
            if (userId) {
                await Storage.setItemAsync('user_id', userId);

                // This will set isAuthenticated = true in the auth store
                // The AppNavigator listens to isAuthenticated and will automatically
                // remount with the 'Main' route available. We don't need navigation.reset.
                console.log('Authenticating user...');
                await login(userId);
                console.log('User authenticated! Navigator will switch to Main automatically.');

                // The navigator will automatically switch to Main because 
                // isAuthenticated changed from false to true.
                // No need for navigation.reset() - it would fail anyway since 
                // 'Main' route doesn't exist until isAuthenticated is true.
            } else {
                console.log('No userId provided, cannot unlock plan');
                setIsUnlocking(false);
            }
        } catch (error) {
            console.error('Error unlocking plan:', error);
            setIsUnlocking(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerIcon}>🎯</Text>
                    <Text style={styles.headerTitle}>Seu Plano Personalizado</Text>
                    <Text style={styles.headerSubtitle}>
                        Criado por IA especialmente para você
                    </Text>
                </View>

                {/* Plan Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryCardGradient} />
                    <View style={styles.summaryContent}>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>OBJETIVO</Text>
                                <Text style={styles.summaryValue}>
                                    {GOAL_LABELS[goal] || goal}
                                </Text>
                            </View>
                            <View style={styles.summaryDivider} />
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>NÍVEL</Text>
                                <Text style={styles.summaryValue}>
                                    {LEVEL_LABELS[level] || level}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>DURAÇÃO</Text>
                                <Text style={styles.summaryValue}>{targetWeeks} semanas</Text>
                            </View>
                            <View style={styles.summaryDivider} />
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>FREQUÊNCIA</Text>
                                <Text style={styles.summaryValue}>{daysPerWeek}x por semana</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* AI Analysis Section */}
                <View style={styles.analysisSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionIcon}>🤖</Text>
                        <Text style={styles.sectionTitle}>Análise da IA</Text>
                    </View>
                    <View style={styles.analysisCard}>
                        <Text style={styles.analysisText}>
                            {planHeadline || (
                                <>
                                    Baseado no seu perfil de <Text style={styles.highlight}>{LEVEL_LABELS[level]?.toLowerCase()}</Text> com
                                    objetivo de <Text style={styles.highlight}>{GOAL_LABELS[goal]?.toLowerCase()}</Text>,
                                    criei um plano progressivo de <Text style={styles.highlight}>{targetWeeks} semanas</Text> com{' '}
                                    <Text style={styles.highlight}>{workoutsCount || targetWeeks * daysPerWeek} treinos</Text> programados.
                                </>
                            )}
                        </Text>
                        <View style={styles.analysisFeatures}>
                            <View style={styles.featureItem}>
                                <Text style={styles.featureIcon}>📈</Text>
                                <Text style={styles.featureText}>Progressão gradual de volume</Text>
                            </View>
                            <View style={styles.featureItem}>
                                <Text style={styles.featureIcon}>⚡</Text>
                                <Text style={styles.featureText}>Treinos variados (leve, longo, intervalado)</Text>
                            </View>
                            <View style={styles.featureItem}>
                                <Text style={styles.featureIcon}>🛡️</Text>
                                <Text style={styles.featureText}>Foco em prevenção de lesões</Text>
                            </View>
                            <View style={styles.featureItem}>
                                <Text style={styles.featureIcon}>🎯</Text>
                                <Text style={styles.featureText}>Metas semanais personalizadas</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Workout Preview */}
                <View style={styles.previewSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionIcon}>📅</Text>
                        <Text style={styles.sectionTitle}>Prévia dos Treinos</Text>
                    </View>
                    <View style={styles.workoutPreviewCard}>
                        <View style={styles.workoutItem}>
                            <View style={styles.workoutDot} />
                            <View style={styles.workoutInfo}>
                                <Text style={styles.workoutTitle}>Rodagem Leve</Text>
                                <Text style={styles.workoutMeta}>5km • Zona 2 • Base aeróbica</Text>
                            </View>
                        </View>
                        <View style={styles.workoutItem}>
                            <View style={[styles.workoutDot, styles.workoutDotGreen]} />
                            <View style={styles.workoutInfo}>
                                <Text style={styles.workoutTitle}>Long Run</Text>
                                <Text style={styles.workoutMeta}>8km • Ritmo confortável</Text>
                            </View>
                        </View>
                        <View style={styles.workoutItem}>
                            <View style={[styles.workoutDot, styles.workoutDotOrange]} />
                            <View style={styles.workoutInfo}>
                                <Text style={styles.workoutTitle}>Intervalado</Text>
                                <Text style={styles.workoutMeta}>6x400m • Alta intensidade</Text>
                            </View>
                        </View>
                        <View style={styles.blurOverlay}>
                            <Text style={styles.blurText}>+{(workoutsCount || targetWeeks * daysPerWeek) - 3} treinos</Text>
                        </View>
                    </View>
                </View>

                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{workoutsCount || targetWeeks * daysPerWeek}</Text>
                        <Text style={styles.statLabel}>Treinos</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{targetWeeks}</Text>
                        <Text style={styles.statLabel}>Semanas</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{daysPerWeek}x</Text>
                        <Text style={styles.statLabel}>Por semana</Text>
                    </View>
                </View>
            </ScrollView>

            {/* Unlock Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.unlockButton}
                    onPress={handleUnlockPlan}
                    disabled={isUnlocking}
                >
                    {isUnlocking ? (
                        <ActivityIndicator color="#0F172A" />
                    ) : (
                        <>
                            <Text style={styles.unlockIcon}>🔓</Text>
                            <Text style={styles.unlockText}>Desbloquear Plano</Text>
                        </>
                    )}
                </TouchableOpacity>
                <Text style={styles.footerNote}>
                    Acesso completo ao seu plano de treinos
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.lg,
        paddingBottom: 120,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing['2xl'],
    },
    headerIcon: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    headerTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: spacing.xs,
    },
    summaryCard: {
        position: 'relative',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        marginBottom: spacing['2xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    summaryCardGradient: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: '50%',
        height: '100%',
        ...Platform.select({
            web: {
                backgroundImage: 'linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.1))',
            },
            default: {
                backgroundColor: 'rgba(0, 212, 255, 0.05)',
            },
        }),
    },
    summaryContent: {
        gap: spacing.lg,
    },
    summaryRow: {
        flexDirection: 'row',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryDivider: {
        width: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    summaryLabel: {
        fontSize: 10,
        fontWeight: typography.fontWeights.bold,
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: 1,
        marginBottom: spacing.xs,
    },
    summaryValue: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
    analysisSection: {
        marginBottom: spacing['2xl'],
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionIcon: {
        fontSize: 20,
        marginRight: spacing.sm,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.white,
    },
    analysisCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
    },
    analysisText: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    highlight: {
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },
    analysisFeatures: {
        gap: spacing.md,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    featureIcon: {
        fontSize: 18,
    },
    featureText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    previewSection: {
        marginBottom: spacing['2xl'],
    },
    workoutPreviewCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        position: 'relative',
        overflow: 'hidden',
    },
    workoutItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    workoutDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.primary,
        marginRight: spacing.md,
    },
    workoutDotGreen: {
        backgroundColor: colors.success,
    },
    workoutDotOrange: {
        backgroundColor: colors.warning,
    },
    workoutInfo: {
        flex: 1,
    },
    workoutTitle: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.white,
    },
    workoutMeta: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    blurOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            web: {
                backgroundImage: 'linear-gradient(transparent, rgba(15, 23, 42, 0.95))',
            },
            default: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
            },
        }),
    },
    blurText: {
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },
    statsRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        alignItems: 'center',
    },
    statValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: spacing.xs,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: spacing.lg,
        backgroundColor: '#0F172A',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    unlockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.xl,
        gap: spacing.sm,
        ...shadows.neon,
    },
    unlockIcon: {
        fontSize: 20,
    },
    unlockText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: '#0F172A',
    },
    footerNote: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginTop: spacing.sm,
    },
});
