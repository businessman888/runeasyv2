import React, { useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { semanticColors } from '../../theme/semanticColors';
import { createThemeStyles, useThemeSubscription } from '../../theme';

// ─── Figma tokens ────────────────────────────────────────────────────────────






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
    useThemeSubscription();
    const navigation = useNavigation<any>();
    // Tablet: semanas em 2 colunas (FlatList numColumns). Phone: 1 coluna (idêntico).
    const { isTablet } = useBreakpoint();
    const planOverview = useTrainingStore((s) => s.planOverview);
    const loading = useTrainingStore((s) => s.planOverviewLoading);
    const error = useTrainingStore((s) => s.planOverviewError);
    const fetchPlanOverview = useTrainingStore((s) => s.fetchPlanOverview);
    const { isProUser } = useProFeature();

    // ── REVALIDA A CADA FOCO ─────────────────────────────────────────────────
    //
    // Antes: `useEffect` com guarda `!planOverview` — buscava UMA vez e nunca
    // mais. Qualquer coisa que mudasse o plano depois disso (o `adiar_semana`
    // da Fase 2, que já está em produção; o alívio de volume da 6.2) deixava
    // esta tela mostrando o plano velho pela sessão inteira, e só um kill do app
    // corrigia. É a classe de bug da MesoInsightScreen: telas com ciclos de
    // cache diferentes sobre o mesmo dado.
    //
    // Calendar e Home já revalidam no foco — esta tela passa a seguir o mesmo
    // padrão. A guarda de `isProUser` continua: sem plano não há o que buscar.
    useFocusEffect(
        useCallback(() => {
            if (isProUser) void fetchPlanOverview();
        }, [isProUser, fetchPlanOverview]),
    );

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
                style={isTablet ? styles.gridItem : undefined}
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
                    <Ionicons name="chevron-back" size={24} color={semanticColors.accent} />
                </Pressable>
                <Text style={styles.headerTitle}>Seu Plano</Text>
                <View style={styles.headerSideBtn} />
            </View>

            {loading && !planOverview && (
                <View style={styles.centered}>
                    <ActivityIndicator color={semanticColors.accent} />
                    <Text style={styles.centeredText}>Carregando seu plano...</Text>
                </View>
            )}

            {error && !planOverview && (
                <View style={styles.centered}>
                    <MaterialCommunityIcons
                        name="cloud-off-outline"
                        size={48}
                        color={semanticColors.textTertiary}
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
                    key={isTablet ? 'cols-2' : 'cols-1'}
                    numColumns={isTablet ? 2 : 1}
                    columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
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
                            tintColor={semanticColors.accent}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </ScreenContainer>
    );
}

function ItemSeparator() {
    useThemeSubscription();
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
    useThemeSubscription();
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
                colors={[semanticColors.surface2, semanticColors.surface1]}
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
                                color={semanticColors.textSecondary}
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
                                colors={[semanticColors.accent, semanticColors.accent]}
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

const styles = createThemeStyles(() => ({
    screen: {
        backgroundColor: semanticColors.canvas,
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
        color: semanticColors.textPrimary,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
    },
    centeredText: {
        color: semanticColors.textPrimary,
        fontSize: 14,
        textAlign: 'center',
    },
    retryBtn: {
        backgroundColor: semanticColors.accent,
        paddingHorizontal: 22,
        paddingVertical: 11,
        borderRadius: 12,
    },
    retryBtnText: {
        color: semanticColors.textOnAccent,
        fontSize: 14,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 14,
        paddingBottom: 120,
    },
    // Tablet: 2 colunas de semanas com respiro horizontal (phone nunca usa).
    columnWrapper: {
        gap: 14,
    },
    gridItem: {
        flex: 1,
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
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
    },
    summaryAccent: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: semanticColors.glass,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryAccentDot: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: semanticColors.glass,
    },
    summaryTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    summaryTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: semanticColors.textPrimary,
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
        color: semanticColors.textSecondary,
    },
    weekCounterBubble: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        backgroundColor: semanticColors.accentSubtle,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    weekCounterValue: {
        fontSize: 22,
        fontWeight: '800',
        color: semanticColors.accent,
        lineHeight: 24,
    },
    weekCounterDivider: {
        fontSize: 14,
        fontWeight: '600',
        color: semanticColors.textTertiary,
        lineHeight: 22,
        marginBottom: 1,
    },
    weekCounterTotal: {
        fontSize: 14,
        fontWeight: '600',
        color: semanticColors.textSecondary,
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
        color: semanticColors.textPrimary,
        letterSpacing: -0.5,
    },
    distanceUnit: {
        fontSize: 16,
        fontWeight: '600',
        color: semanticColors.textSecondary,
    },
    distanceLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        marginTop: -4,
    },
    distanceProgressTrack: {
        height: 8,
        backgroundColor: semanticColors.borderSubtle,
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
        backgroundColor: semanticColors.surface1,
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
        backgroundColor: semanticColors.borderSubtle,
        marginHorizontal: 8,
    },
    stripLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: semanticColors.textSecondary,
    },
    stripValue: {
        fontSize: 18,
        fontWeight: '700',
        color: semanticColors.textPrimary,
    },
    stripValueDim: {
        fontSize: 14,
        fontWeight: '600',
        color: semanticColors.textTertiary,
    },
}));
