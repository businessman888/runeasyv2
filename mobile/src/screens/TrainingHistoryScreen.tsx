import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { useFeedbackStore } from '../stores/feedbackStore';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function SearchIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="search-outline" size={size} color={color} />;
}

function FilterIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="options-outline" size={size} color={color} />;
}

function ChevronRightIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-forward" size={size} color={color} />;
}

function CheckIcon({ size = 14, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="checkmark" size={size} color={color} />;
}

// Colored dot icon with glow effect
function BolinhaIcon({ color = '#00D4FF' }: { color?: string }) {
    return (
        <View style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 4,
            elevation: 3,
        }} />
    );
}

// Strava icon
function StravaIcon({ size = 20 }: { size?: number }) {
    return <MaterialCommunityIcons name="strava" size={size} color="#FC4C02" />;
}

const getWorkoutDotColor = (type: string): string => {
    if (type.includes('Long') || type.toLowerCase().includes('longa')) {
        return '#00D4FF';
    }
    if (type.includes('Interval') || type.toLowerCase().includes('velocidade')) {
        return '#FFC400';
    }
    return '#00D4FF';
};

export function TrainingHistoryScreen({ navigation }: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const {
        workoutHistory,
        workoutSummary,
        workoutHistoryLoading,
        workoutHistoryError,
        hasMoreWorkouts,
        fetchWorkoutHistory,
        loadMoreWorkouts,
    } = useFeedbackStore();

    useEffect(() => {
        fetchWorkoutHistory();
    }, []);

    const navigateToFeedback = (workout: any) => {
        if (workout.feedback) {
            navigation.navigate('CoachAnalysis', {
                feedbackId: workout.feedback.id,
                activityId: workout.id,
            });
        } else {
            console.log('No feedback available for this workout');
        }
    };

    const formatDistance = (meters: number) => {
        return (meters / 1000).toFixed(1) + ' km';
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}.${secs.toString().padStart(2, '0')} min`;
    };

    const formatPace = (pace: string | null) => {
        return pace ? `${pace} /km` : 'N/A';
    };

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <BackIcon size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Histórico de Treinos</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Monthly Summary Card */}
                {workoutSummary && (
                    <View style={styles.summaryCard}>
                        <View style={styles.summaryHeader}>
                            <Text style={styles.summaryTitle}>Resumo do Mês</Text>
                            <View style={styles.progressBadge}>
                                <CheckIcon size={12} color="#FFFFFF" />
                                <Text style={styles.progressBadgeText}>Em progresso</Text>
                            </View>
                        </View>
                        <View style={styles.summaryMetrics}>
                            <View style={styles.summaryMetric}>
                                <Text style={styles.summaryMetricValue}>
                                    {workoutSummary.total_distance}
                                    <Text style={styles.summaryMetricUnit}>km</Text>
                                </Text>
                                <Text style={styles.summaryMetricLabel}>Distância</Text>
                            </View>
                            <View style={styles.summaryDivider} />
                            <View style={styles.summaryMetric}>
                                <Text style={styles.summaryMetricValue}>
                                    {workoutSummary.total_activities}
                                </Text>
                                <Text style={styles.summaryMetricLabel}>Atividades</Text>
                            </View>
                            <View style={styles.summaryDivider} />
                            <View style={styles.summaryMetric}>
                                <Text style={styles.summaryMetricValue}>
                                    {workoutSummary.total_elevation}
                                    <Text style={styles.summaryMetricUnit}>m</Text>
                                </Text>
                                <Text style={styles.summaryMetricLabel}>Elevação</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchInputContainer}>
                        <SearchIcon size={20} color="rgba(235,235,245,0.6)" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar treinos..."
                            placeholderTextColor="rgba(235,235,245,0.4)"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                    <TouchableOpacity style={styles.filterButton}>
                        <FilterIcon size={20} color="rgba(235,235,245,0.6)" />
                    </TouchableOpacity>
                </View>

                {/* Loading State */}
                {workoutHistoryLoading && workoutHistory.length === 0 && (
                    <View style={styles.stateContainer}>
                        <Text style={styles.stateText}>Carregando treinos...</Text>
                    </View>
                )}

                {/* Error State */}
                {workoutHistoryError && (
                    <View style={styles.stateContainer}>
                        <Text style={[styles.stateText, { color: '#FF4444' }]}>{workoutHistoryError}</Text>
                    </View>
                )}

                {/* Empty State */}
                {!workoutHistoryLoading && workoutHistory.length === 0 && !workoutHistoryError && (
                    <View style={styles.emptyStateContainer}>
                        <Ionicons name="fitness-outline" size={64} color="rgba(235,235,245,0.3)" />
                        <Text style={styles.emptyStateText}>
                            Comece a treinar para ver o seu histórico de treinos
                        </Text>
                    </View>
                )}

                {/* Workout List */}
                {workoutHistory.map((group, groupIndex) => (
                    <View key={groupIndex} style={styles.workoutGroup}>
                        <Text style={styles.monthHeader}>{group.month}</Text>
                        {group.workouts.map((workout) => (
                            <TouchableOpacity
                                key={workout.id}
                                style={styles.workoutCard}
                                activeOpacity={0.7}
                                onPress={() => navigateToFeedback(workout)}
                            >
                                <View style={styles.workoutDateContainer}>
                                    <Text style={styles.workoutDay}>
                                        {workout.day.toString().padStart(2, '0')}
                                    </Text>
                                    <Text style={styles.workoutDayName}>{workout.day_of_week}</Text>
                                </View>
                                <View style={styles.workoutDivider} />
                                <View style={styles.workoutContent}>
                                    <View style={styles.workoutTitleRow}>
                                        <Text style={styles.workoutTitle}>{workout.name}</Text>
                                        <BolinhaIcon color={getWorkoutDotColor(workout.type)} />
                                    </View>
                                    <View style={styles.workoutMetricsRow}>
                                        <View style={styles.workoutMetrics}>
                                            <Text style={styles.workoutMetric}>
                                                {formatDistance(workout.distance)}
                                            </Text>
                                            <View style={styles.metricDivider} />
                                            <Text style={styles.workoutMetric}>
                                                {formatTime(workout.moving_time)}
                                            </Text>
                                            <View style={styles.metricDivider} />
                                            <Text style={styles.workoutMetric}>
                                                {formatPace(workout.pace)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={styles.workoutRightSection}>
                                    <StravaIcon size={20} />
                                    <ChevronRightIcon size={20} color="rgba(235,235,245,0.6)" />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}

                {/* Load More Button */}
                {hasMoreWorkouts && !workoutHistoryLoading && (
                    <TouchableOpacity
                        style={styles.loadMoreButton}
                        onPress={loadMoreWorkouts}
                    >
                        <Text style={styles.loadMoreText}>Carregar mais treinos</Text>
                        <View style={styles.loadMoreIcon}>
                            <Ionicons name="chevron-down" size={16} color="#00D4FF" />
                        </View>
                    </TouchableOpacity>
                )}

                {/* Bottom padding for BottomBar clearance */}
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
    },
    // States
    stateContainer: {
        padding: spacing.xl,
        alignItems: 'center',
    },
    stateText: {
        color: colors.white,
        fontSize: 14,
    },
    emptyStateContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: spacing.xl,
    },
    emptyStateText: {
        color: colors.white,
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: spacing.lg,
        lineHeight: 26,
    },
    // Summary Card
    summaryCard: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#00D4FF',
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.lg,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    progressBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#00D4FF',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    progressBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    summaryMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    summaryMetric: {
        alignItems: 'center',
        flex: 1,
    },
    summaryMetricValue: {
        fontSize: 28,
        fontWeight: '700',
        color: '#00D4FF',
    },
    summaryMetricUnit: {
        fontSize: 14,
        fontWeight: '400',
    },
    summaryMetricLabel: {
        fontSize: 12,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.6)',
        marginTop: 4,
    },
    summaryDivider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    // Search
    searchContainer: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        height: 44,
        gap: spacing.sm,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#FFFFFF',
    },
    filterButton: {
        width: 44,
        height: 44,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Workout Groups
    workoutGroup: {
        marginBottom: spacing.md,
    },
    monthHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(235,235,245,0.6)',
        marginBottom: spacing.sm,
    },
    // Workout Card
    workoutCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    workoutDateContainer: {
        alignItems: 'center',
        width: 36,
    },
    workoutDay: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    workoutDayName: {
        fontSize: 10,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
    },
    workoutDivider: {
        width: 1,
        height: 36,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: spacing.md,
    },
    workoutContent: {
        flex: 1,
    },
    workoutTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    workoutTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    workoutMetrics: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    workoutMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    workoutMetric: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.6)',
    },
    metricDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginHorizontal: spacing.sm,
    },
    workoutRightSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    // Load More
    loadMoreButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing.md,
        gap: spacing.xs,
    },
    loadMoreText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#00D4FF',
    },
    loadMoreIcon: {
        // No rotation needed with chevron-down
    },
    bottomSpacer: {
        height: 120,
    },
});
