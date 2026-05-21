import React, { useCallback, useEffect, useMemo } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    FadeInDown,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { ScreenContainer } from '../../components/ScreenContainer';
import { useTrainingStore } from '../../stores';
import type { PlanWeek } from '../../types/plan-overview.types';
import { WeekRow } from './components/WeekRow';
import { UpgradeProCard } from '../../components/upgrade/UpgradeProCard';
import { useProFeature } from '../../hooks/useProFeature';

// ─── Figma tokens ────────────────────────────────────────────────────────────
const BG = '#0E0E1F';
const TEXT_PRIMARY = '#EBEBF5';
const TEXT_SECONDARY = 'rgba(235, 235, 245, 0.65)';
const TEXT_DIM = 'rgba(235, 235, 245, 0.45)';
const CYAN = '#00D4FF';

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
    const { isProUser } = useProFeature();

    useEffect(() => {
        // Avoid hitting the backend for users that don't have a plan
        if (isProUser && !planOverview && !loading) {
            fetchPlanOverview();
        }
    }, [planOverview, loading, fetchPlanOverview, isProUser]);

    if (!isProUser) {
        return (
            <ScreenContainer>
                <UpgradeProCard
                    variant="fullscreen"
                    tagline="Acompanhe seu plano semana a semana com Coach AI"
                    bullets={[
                        'Plano completo semana a semana',
                        'Acompanhamento de quilometragem',
                        'Histórico e progressão de fases',
                    ]}
                />
            </ScreenContainer>
        );
    }

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
        ({ item, index }: { item: PlanWeek; index: number }) => (
            <Animated.View
                entering={FadeInUp.delay(80 + index * 50).duration(380)}
            >
                <WeekRow
                    week={item}
                    isFuture={
                        !!planOverview &&
                        item.week_number > planOverview.overview.current_week
                    }
                    isPast={
                        !!planOverview &&
                        item.week_number < planOverview.overview.current_week
                    }
                    onPress={handleWeekPress}
                />
            </Animated.View>
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
                    <Ionicons name="chevron-back" size={24} color={CYAN} />
                </Pressable>
                <Text style={styles.headerTitle}>Seu Plano</Text>
                <View style={styles.headerSideBtn} />
            </View>

            {loading && !planOverview && (
                <View style={styles.centered}>
                    <ActivityIndicator color={CYAN} />
                    <Text style={styles.centeredText}>Carregando seu plano...</Text>
                </View>
            )}

            {error && !planOverview && (
                <View style={styles.centered}>
                    <MaterialCommunityIcons
                        name="cloud-off-outline"
                        size={48}
                        color={TEXT_DIM}
                    />
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
                        <Animated.View entering={FadeInDown.duration(400)}>
                            <PlanSummaryCard
                                title={planOverview.overview.title}
                                endDate={planOverview.overview.end_date}
                                totalWeeks={planOverview.overview.total_weeks}
                                completedWeeks={planOverview.overview.completed_weeks}
                                currentWeek={planOverview.overview.current_week}
                                completedKm={planOverview.overview.total_distance_km}
                                targetKm={planOverview.overview.target_total_km}
                            />
                        </Animated.View>
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={loading}
                            onRefresh={fetchPlanOverview}
                            tintColor={CYAN}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </ScreenContainer>
    );
}

function ItemSeparator() {
    return <View style={{ height: 14 }} />;
}

interface PlanSummaryCardProps {
    title: string;
    endDate: string;
    totalWeeks: number;
    completedWeeks: number;
    currentWeek: number;
    completedKm: number;
    targetKm: number;
}

function PlanSummaryCard({
    title,
    endDate,
    totalWeeks,
    completedWeeks,
    currentWeek,
    completedKm,
    targetKm,
}: PlanSummaryCardProps) {
    const overallPct = useMemo(() => {
        if (!targetKm) return 0;
        return Math.min(1, completedKm / targetKm);
    }, [completedKm, targetKm]);

    const progressWidth = useSharedValue(0);

    React.useEffect(() => {
        progressWidth.value = withTiming(overallPct * 100, {
            duration: 900,
            easing: Easing.out(Easing.cubic),
        });
    }, [overallPct, progressWidth]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value}%` as `${number}%`,
    }));

    return (
        <View style={styles.summaryWrapper}>
            <LinearGradient
                colors={['#1A1A38', '#15152A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
            >
                {/* Decorative cyan accent in the corner */}
                <View style={styles.summaryAccent}>
                    <View style={styles.summaryAccentDot} />
                </View>

                <View style={styles.summaryTopRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.summaryTitle}>{title}</Text>
                        <View style={styles.summaryMetaRow}>
                            <MaterialCommunityIcons
                                name="flag-checkered"
                                size={13}
                                color={TEXT_SECONDARY}
                            />
                            <Text style={styles.summaryEnd}>{formatEndDate(endDate)}</Text>
                        </View>
                    </View>

                    <View style={styles.weekCounterBubble}>
                        <Text style={styles.weekCounterValue}>{currentWeek}</Text>
                        <Text style={styles.weekCounterDivider}>/</Text>
                        <Text style={styles.weekCounterTotal}>{totalWeeks}</Text>
                    </View>
                </View>

                {/* Big distance progress: real / planned */}
                <View style={styles.distanceBlock}>
                    <View style={styles.distanceRow}>
                        <Text style={styles.distanceValue}>{formatKm(completedKm)}</Text>
                        <Text style={styles.distanceUnit}> / {formatKm(targetKm)} Km</Text>
                    </View>
                    <Text style={styles.distanceLabel}>Distância acumulada</Text>

                    <View style={styles.distanceProgressTrack}>
                        <Animated.View style={[styles.distanceProgressFill, fillStyle]}>
                            <LinearGradient
                                colors={['#00D4FF', '#4FB8FF']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={StyleSheet.absoluteFill}
                            />
                        </Animated.View>
                    </View>
                </View>

                {/* Bottom stat strip: weeks + percent */}
                <View style={styles.bottomStrip}>
                    <View style={styles.stripCol}>
                        <Text style={styles.stripLabel}>Semanas Completas</Text>
                        <Text style={styles.stripValue}>
                            {completedWeeks}
                            <Text style={styles.stripValueDim}>/{totalWeeks}</Text>
                        </Text>
                    </View>
                    <View style={styles.stripDivider} />
                    <View style={styles.stripCol}>
                        <Text style={styles.stripLabel}>Progresso</Text>
                        <Text style={styles.stripValue}>{Math.round(overallPct * 100)}%</Text>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
}

function formatKm(km: number): string {
    if (typeof km !== 'number' || !isFinite(km)) return '0';
    if (km === 0) return '0';
    return km < 10 ? km.toFixed(1) : Math.round(km).toString();
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
        paddingVertical: 14,
    },
    headerSideBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: TEXT_PRIMARY,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
    },
    centeredText: {
        color: TEXT_PRIMARY,
        fontSize: 14,
        textAlign: 'center',
    },
    retryBtn: {
        backgroundColor: CYAN,
        paddingHorizontal: 22,
        paddingVertical: 11,
        borderRadius: 12,
    },
    retryBtnText: {
        color: '#0E0E1F',
        fontSize: 14,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 14,
        paddingBottom: 120,
    },

    // ─── Summary card ────────────────────────────────────────────────────
    summaryWrapper: {
        marginBottom: 18,
    },
    summaryCard: {
        borderRadius: 22,
        padding: 18,
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.12)',
        overflow: 'hidden',
    },
    summaryAccent: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(0, 212, 255, 0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryAccentDot: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(0, 212, 255, 0.06)',
    },
    summaryTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    summaryTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: TEXT_PRIMARY,
        lineHeight: 26,
    },
    summaryMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    summaryEnd: {
        fontSize: 12,
        fontWeight: '500',
        color: TEXT_SECONDARY,
    },
    weekCounterBubble: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        backgroundColor: 'rgba(0, 212, 255, 0.12)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.25)',
    },
    weekCounterValue: {
        fontSize: 22,
        fontWeight: '800',
        color: CYAN,
        lineHeight: 24,
    },
    weekCounterDivider: {
        fontSize: 14,
        fontWeight: '600',
        color: TEXT_DIM,
        lineHeight: 22,
        marginBottom: 1,
    },
    weekCounterTotal: {
        fontSize: 14,
        fontWeight: '600',
        color: TEXT_SECONDARY,
        lineHeight: 22,
        marginBottom: 1,
    },

    // distance hero
    distanceBlock: {
        gap: 8,
        marginTop: 2,
    },
    distanceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    distanceValue: {
        fontSize: 36,
        fontWeight: '800',
        color: TEXT_PRIMARY,
        letterSpacing: -0.5,
    },
    distanceUnit: {
        fontSize: 16,
        fontWeight: '600',
        color: TEXT_SECONDARY,
    },
    distanceLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: TEXT_SECONDARY,
        marginTop: -4,
    },
    distanceProgressTrack: {
        height: 8,
        backgroundColor: 'rgba(235, 235, 245, 0.08)',
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 6,
    },
    distanceProgressFill: {
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
    },

    // bottom strip
    bottomStrip: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.18)',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'center',
    },
    stripCol: {
        flex: 1,
        gap: 4,
    },
    stripDivider: {
        width: 1,
        height: 28,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        marginHorizontal: 8,
    },
    stripLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: TEXT_SECONDARY,
    },
    stripValue: {
        fontSize: 18,
        fontWeight: '700',
        color: TEXT_PRIMARY,
    },
    stripValueDim: {
        fontSize: 14,
        fontWeight: '600',
        color: TEXT_DIM,
    },
});
