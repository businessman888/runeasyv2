import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useFeedbackStore, Feedback } from '../stores/feedbackStore';
import { SharingModal } from './sharing/SharingModal';

interface Props {
    route: any;
    navigation: any;
}

export function FeedbackScreen({ route, navigation }: Props) {
    const { feedbackId } = route.params || {};
    const { currentFeedback, fetchFeedback, rateFeedback, isLoading } = useFeedbackStore();
    const [selectedRating, setSelectedRating] = React.useState<number | null>(null);
    const [sharingVisible, setSharingVisible] = React.useState(false);

    React.useEffect(() => {
        if (feedbackId) {
            fetchFeedback(feedbackId);
        }
    }, [feedbackId]);

    React.useEffect(() => {
        if (currentFeedback?.feedback_rating) {
            setSelectedRating(currentFeedback.feedback_rating);
        }
    }, [currentFeedback]);

    const handleRate = (rating: number) => {
        setSelectedRating(rating);
        if (currentFeedback) {
            rateFeedback(currentFeedback.id, rating);
        }
    };

    const getToneColor = (tone: string) => {
        switch (tone) {
            case 'celebration': return colors.success;
            case 'encouragement': return colors.info;
            case 'improvement': return colors.warning;
            case 'caution': return colors.error;
            default: return colors.primary;
        }
    };

    const getToneEmoji = (tone: string) => {
        switch (tone) {
            case 'celebration': return '🎉';
            case 'encouragement': return '💪';
            case 'improvement': return '📈';
            case 'caution': return '⚠️';
            default: return '🏃';
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Carregando feedback...</Text>
            </SafeAreaView>
        );
    }

    if (!currentFeedback) {
        return (
            <SafeAreaView style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>Feedback não encontrado</Text>
            </SafeAreaView>
        );
    }

    const feedback = currentFeedback;
    const toneColor = getToneColor(feedback.hero_tone);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <View style={[styles.heroCard, { borderLeftColor: toneColor }]}>
                    <Text style={styles.heroEmoji}>{getToneEmoji(feedback.hero_tone)}</Text>
                    <Text style={styles.heroMessage}>{feedback.hero_message}</Text>
                    <Text style={styles.heroDate}>
                        {new Date(feedback.created_at).toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                        })}
                    </Text>
                </View>

                {/* Metrics Comparison */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📊 Métricas</Text>
                    <View style={styles.metricsGrid}>
                        <MetricCard
                            label="Distância"
                            planned={`${feedback.metrics_comparison.distance.planned.toFixed(1)} km`}
                            executed={`${feedback.metrics_comparison.distance.executed.toFixed(1)} km`}
                            diff={feedback.metrics_comparison.distance.diff_percent}
                        />
                        <MetricCard
                            label="Pace"
                            planned={feedback.metrics_comparison.pace.planned}
                            executed={feedback.metrics_comparison.pace.executed}
                            diff={feedback.metrics_comparison.pace.diff_percent}
                        />
                    </View>
                </View>

                {/* Strengths */}
                {feedback.strengths.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>💪 Pontos Fortes</Text>
                        {feedback.strengths.map((strength, index) => (
                            <View key={index} style={styles.pointCard}>
                                <Text style={styles.pointIcon}>{strength.icon}</Text>
                                <View style={styles.pointContent}>
                                    <Text style={styles.pointTitle}>{strength.title}</Text>
                                    <Text style={styles.pointDescription}>{strength.description}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Improvements */}
                {feedback.improvements.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📈 Oportunidades</Text>
                        {feedback.improvements.map((improvement, index) => (
                            <View key={index} style={styles.pointCard}>
                                <Text style={styles.pointIcon}>{improvement.icon}</Text>
                                <View style={styles.pointContent}>
                                    <Text style={styles.pointTitle}>{improvement.title}</Text>
                                    <Text style={styles.pointDescription}>{improvement.description}</Text>
                                    <View style={styles.tipContainer}>
                                        <Text style={styles.tipLabel}>💡 Dica:</Text>
                                        <Text style={styles.tipText}>{improvement.tip}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Progression Impact */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🎯 Impacto na Evolução</Text>
                    <View style={styles.impactCard}>
                        <Text style={styles.impactText}>{feedback.progression_impact}</Text>
                    </View>
                </View>

                {/* Share Button */}
                <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => setSharingVisible(true)}
                >
                    <Ionicons name="share-outline" size={20} color={colors.white} />
                    <Text style={styles.shareButtonText}>Compartilhar Treino</Text>
                </TouchableOpacity>

                {/* Rating */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>⭐ Avalie este feedback</Text>
                    <View style={styles.ratingContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity
                                key={star}
                                style={[
                                    styles.starButton,
                                    selectedRating && selectedRating >= star && styles.starButtonSelected,
                                ]}
                                onPress={() => handleRate(star)}
                            >
                                <Text style={styles.starText}>
                                    {selectedRating && selectedRating >= star ? '⭐' : '☆'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.ratingHint}>
                        Sua avaliação nos ajuda a melhorar os feedbacks
                    </Text>
                </View>
            </ScrollView>

            <SharingModal
                visible={sharingVisible}
                onClose={() => setSharingVisible(false)}
                workoutId={feedback.workout_id}
            />
        </SafeAreaView>
    );
}

// Metric Card Component
function MetricCard({
    label,
    planned,
    executed,
    diff
}: {
    label: string;
    planned: string;
    executed: string;
    diff: number;
}) {
    const isPositive = diff >= 0;
    const diffColor = Math.abs(diff) <= 5 ? colors.success :
        Math.abs(diff) <= 15 ? colors.warning : colors.error;

    return (
        <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>{label}</Text>
            <View style={styles.metricRow}>
                <View style={styles.metricColumn}>
                    <Text style={styles.metricSubLabel}>Planejado</Text>
                    <Text style={styles.metricValue}>{planned}</Text>
                </View>
                <View style={styles.metricColumn}>
                    <Text style={styles.metricSubLabel}>Executado</Text>
                    <Text style={[styles.metricValue, styles.metricValuePrimary]}>{executed}</Text>
                </View>
            </View>
            <View style={[styles.diffBadge, { backgroundColor: `${diffColor}20` }]}>
                <Text style={[styles.diffText, { color: diffColor }]}>
                    {isPositive ? '+' : ''}{diff.toFixed(1)}%
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        marginTop: spacing.md,
    },
    emptyContainer: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    emptyText: {
        fontSize: typography.fontSizes.lg,
        color: colors.textSecondary,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: spacing.lg,
        paddingBottom: spacing['2xl'],
    },
    heroCard: {
        backgroundColor: colors.white,
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        borderLeftWidth: 4,
        alignItems: 'center',
        ...shadows.md,
    },
    heroEmoji: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    heroMessage: {
        fontSize: typography.fontSizes.xl,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    heroDate: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textTransform: 'capitalize',
    },
    section: {
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: '600',
        color: colors.text,
        marginBottom: spacing.md,
    },
    metricsGrid: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    metricCard: {
        flex: 1,
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        ...shadows.sm,
    },
    metricLabel: {
        fontSize: typography.fontSizes.sm,
        fontWeight: '600',
        color: colors.text,
        marginBottom: spacing.sm,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    metricColumn: {
        alignItems: 'center',
    },
    metricSubLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    metricValue: {
        fontSize: typography.fontSizes.md,
        fontWeight: '500',
        color: colors.text,
    },
    metricValuePrimary: {
        color: colors.primary,
    },
    diffBadge: {
        alignSelf: 'center',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    diffText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: '600',
    },
    pointCard: {
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.sm,
    },
    pointIcon: {
        fontSize: 24,
        marginRight: spacing.md,
    },
    pointContent: {
        flex: 1,
    },
    pointTitle: {
        fontSize: typography.fontSizes.md,
        fontWeight: '600',
        color: colors.text,
        marginBottom: spacing.xs,
    },
    pointDescription: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    tipContainer: {
        marginTop: spacing.sm,
        padding: spacing.sm,
        backgroundColor: `${colors.primary}10`,
        borderRadius: borderRadius.md,
    },
    tipLabel: {
        fontSize: typography.fontSizes.sm,
        fontWeight: '600',
        color: colors.primary,
        marginBottom: 2,
    },
    tipText: {
        fontSize: typography.fontSizes.sm,
        color: colors.text,
        lineHeight: 18,
    },
    impactCard: {
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        ...shadows.sm,
    },
    impactText: {
        fontSize: typography.fontSizes.md,
        color: colors.text,
        lineHeight: 24,
    },
    ratingContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md,
        marginBottom: spacing.sm,
    },
    starButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.sm,
    },
    starButtonSelected: {
        backgroundColor: `${colors.warning}20`,
    },
    starText: {
        fontSize: 24,
    },
    ratingHint: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.lg,
    },
    shareButtonText: {
        color: colors.white,
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.bold,
    },
});
