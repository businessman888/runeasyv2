import React, { useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useTrainingStore } from '../../stores';
import type { PlanWeek } from '../../types/plan-overview.types';
import { WeekRow } from './components/WeekRow';

// ─── Figma tokens ────────────────────────────────────────────────────────────
const BG = '#0E0E1F';
const CARD_BG = '#1C1C2E';
const TEXT_PRIMARY = '#EBEBF5';
const TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const SEGMENT_FILL = '#00D4FF';
const SEGMENT_TRACK = 'rgba(235, 235, 245, 0.1)';

const MONTH_PT_LONG = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatEndDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate().toString().padStart(2, '0')} de ${MONTH_PT_LONG[d.getMonth()]}, ${d.getFullYear()}`;
}

export function PlanGoalsScreen() {
    const navigation = useNavigation<any>();
    const planOverview = useTrainingStore((s) => s.planOverview);
    const loading = useTrainingStore((s) => s.planOverviewLoading);
    const error = useTrainingStore((s) => s.planOverviewError);
    const fetchPlanOverview = useTrainingStore((s) => s.fetchPlanOverview);

    useEffect(() => {
        if (!planOverview && !loading) {
            fetchPlanOverview();
        }
    }, [planOverview, loading, fetchPlanOverview]);

    const handleWeekPress = useCallback(
        (weekNumber: number) => {
            if (!planOverview) return;
            navigation.navigate('WeekDetail', {
                weekNumber,
                planId: planOverview.overview.plan_id,
            });
        },
        [navigation, planOverview],
    );

    const renderItem = useCallback(
        ({ item }: { item: PlanWeek }) => (
            <WeekRow
                week={item}
                isFuture={
                    !!planOverview && item.week_number > planOverview.overview.current_week
                }
                onPress={handleWeekPress}
            />
        ),
        [handleWeekPress, planOverview],
    );

    const keyExtractor = useCallback(
        (item: PlanWeek) => `week-${item.week_number}`,
        [],
    );

    return (
        <ScreenContainer style={styles.screen}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={styles.headerSideBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                    hitSlop={12}
                >
                    <Ionicons name="chevron-back" size={24} color="#00D4FF" />
                </Pressable>
                <Text style={styles.headerTitle}>Seu Plano</Text>
                <View style={styles.headerSideBtn} />
            </View>

            {loading && !planOverview && (
                <View style={styles.centered}>
                    <ActivityIndicator color={SEGMENT_FILL} />
                    <Text style={styles.centeredText}>Carregando seu plano...</Text>
                </View>
            )}

            {error && !planOverview && (
                <View style={styles.centered}>
                    <Text style={styles.centeredText}>{error}</Text>
                    <Pressable
                        onPress={fetchPlanOverview}
                        style={styles.retryBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Tentar novamente"
                    >
                        <Text style={styles.retryBtnText}>Tentar novamente</Text>
                    </Pressable>
                </View>
            )}

            {planOverview && (
                <FlatList
                    data={planOverview.weeks}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContent}
                    ItemSeparatorComponent={ItemSeparator}
                    ListHeaderComponent={
                        <PlanSummaryCard
                            title={planOverview.overview.title}
                            endDate={planOverview.overview.end_date}
                            totalWeeks={planOverview.overview.total_weeks}
                            completedWeeks={planOverview.overview.completed_weeks}
                            totalDistanceKm={planOverview.overview.total_distance_km}
                        />
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={fetchPlanOverview}
                            tintColor={SEGMENT_FILL}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </ScreenContainer>
    );
}

function ItemSeparator() {
    return <View style={{ height: 15 }} />;
}

interface PlanSummaryCardProps {
    title: string;
    endDate: string;
    totalWeeks: number;
    completedWeeks: number;
    totalDistanceKm: number;
}

function PlanSummaryCard({
    title,
    endDate,
    totalWeeks,
    completedWeeks,
    totalDistanceKm,
}: PlanSummaryCardProps) {
    const segments = Array.from({ length: Math.max(totalWeeks, 1) }, (_, i) => i);

    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{title}</Text>
            <Text style={styles.summaryEnd}>Data do final: {formatEndDate(endDate)}</Text>

            <View style={styles.segmentsRow}>
                {segments.map((i) => (
                    <View
                        key={`seg-${i}`}
                        style={[
                            styles.segment,
                            i < completedWeeks && styles.segmentFilled,
                        ]}
                    />
                ))}
            </View>

            <View style={styles.metricsRow}>
                <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Semanas Completas</Text>
                    <Text style={styles.metricValue}>
                        {completedWeeks}/{totalWeeks}
                    </Text>
                </View>
                <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Distância</Text>
                    <Text style={styles.metricValue}>{totalDistanceKm} Km</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        backgroundColor: BG,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 16,
    },
    headerSideBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '400',
        color: TEXT_PRIMARY,
        fontFamily: undefined,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
    },
    centeredText: {
        color: TEXT_PRIMARY,
        fontSize: 14,
        textAlign: 'center',
    },
    retryBtn: {
        backgroundColor: SEGMENT_FILL,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    retryBtnText: {
        color: '#0E0E1F',
        fontSize: 14,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: 10,
        paddingBottom: 100,
        gap: 0,
    },
    summaryCard: {
        backgroundColor: CARD_BG,
        borderRadius: 15,
        paddingHorizontal: 15,
        paddingVertical: 13,
        gap: 14,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    summaryTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    summaryEnd: {
        fontSize: 14,
        fontWeight: '400',
        color: TEXT_SECONDARY,
        marginTop: -8,
    },
    segmentsRow: {
        flexDirection: 'row',
        gap: 3,
        marginTop: 6,
    },
    segment: {
        flex: 1,
        height: 4,
        backgroundColor: SEGMENT_TRACK,
        borderRadius: 10,
    },
    segmentFilled: {
        backgroundColor: SEGMENT_FILL,
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    metricCol: {
        gap: 4,
    },
    metricLabel: {
        fontSize: 12,
        fontWeight: '400',
        color: TEXT_SECONDARY,
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
});
