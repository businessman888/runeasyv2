import React, { useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { ScreenContainer } from '../../components/ScreenContainer';
import { PerformanceCard } from '../../components/wellness/PerformanceCard';
import { colors, typography, spacing, borderRadius, fonts } from '../../theme';
import { useWeeklyInsightStore } from '../../stores/weeklyInsightStore';
import { formatWeekRange, formatPace, formatKm } from './format';

import { AdherenceBlock } from './components/AdherenceBlock';
import { VolumeComparison } from './components/VolumeComparison';
import { IntensityCard } from './components/IntensityCard';
import { ZonesRadar } from './components/ZonesRadar';
import { AdjustmentTray } from './components/AdjustmentTray';

/**
 * INSIGHT SEMANAL — o dashboard da semana do plano.
 *
 * Diferente da retrospectiva (stories de celebração, fim de ciclo), esta tela é
 * ANALÍTICA e RECORRENTE: o corredor a vê toda semana, então nada de
 * espetáculo. A composição segue a tela de Wellness — cabeçalho de seção, cards
 * com a mesma moldura, números grandes e gráficos calmos.
 *
 * ── ORDEM DE LEITURA ─────────────────────────────────────────────────────────
 *
 * 1. Narrativa do coach — o fio condutor, uma frase que amarra o resto
 * 2. Os dois números da aderência (nunca somados)
 * 3. A bandeja de reajuste — o que fazer a respeito (a peça central, ALTA na
 *    tela de propósito: é a ação, não um apêndice depois dos gráficos)
 * 4. Volume prescrito × executado
 * 5. Ritmo prescrito × executado
 * 6. Distribuição de zonas
 * 7. Comparação com a semana anterior
 */

export function WeeklyInsightScreen() {
    const navigation = useNavigation();

    const { latest, loading, error, applying, fetch, markSeen, applyAdjustment } =
        useWeeklyInsightStore();

    useEffect(() => {
        void fetch();
    }, [fetch]);

    // Abrir a tela É ter visto — desliga o modal de entrada. O card persistente
    // continua, porque ele serve para reler.
    useEffect(() => {
        if (latest && !latest.seen_at) {
            void markSeen(latest.id);
        }
    }, [latest, markSeen]);

    const handleApply = useCallback(async () => {
        if (!latest) return { applied: false };
        return applyAdjustment(latest.id);
    }, [latest, applyAdjustment]);

    const onRefresh = useCallback(() => {
        void fetch(true);
    }, [fetch]);

    // ── Estados de UI ────────────────────────────────────────────────────────

    if (loading && !latest) {
        return (
            <ScreenContainer>
                <Header onBack={() => navigation.goBack()} subtitle="" />
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </ScreenContainer>
        );
    }

    if (error && !latest) {
        return (
            <ScreenContainer>
                <Header onBack={() => navigation.goBack()} subtitle="" />
                <View style={styles.centered}>
                    <Ionicons
                        name="cloud-offline-outline"
                        size={40}
                        color={colors.textMuted}
                    />
                    <Text style={styles.stateTitle}>Não deu para carregar</Text>
                    <Text style={styles.stateText}>{error}</Text>
                    <Pressable
                        onPress={onRefresh}
                        style={styles.retryBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Tentar novamente"
                    >
                        <Text style={styles.retryText}>Tentar novamente</Text>
                    </Pressable>
                </View>
            </ScreenContainer>
        );
    }

    if (!latest) {
        return (
            <ScreenContainer>
                <Header onBack={() => navigation.goBack()} subtitle="" />
                <View style={styles.centered}>
                    <Ionicons
                        name="bar-chart-outline"
                        size={40}
                        color={colors.textMuted}
                    />
                    <Text style={styles.stateTitle}>Nenhum insight ainda</Text>
                    <Text style={styles.stateText}>
                        Assim que a primeira semana do seu plano fechar, o resumo
                        dela aparece aqui.
                    </Text>
                </View>
            </ScreenContainer>
        );
    }

    const deltas = latest.metrics_deltas ?? {};
    const zones = latest.zone_distribution;

    return (
        <ScreenContainer>
            <Header
                onBack={() => navigation.goBack()}
                subtitle={formatWeekRange(latest.week_start, latest.week_end)}
                week={latest.week_number}
            />

            <ScrollView
                // `ScreenContainer` já aplica o safe-area inferior; aqui é só a
                // folga de leitura no fim do scroll.
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* 1. O fio condutor */}
                {!!latest.ai_narrative && (
                    <View style={styles.narrativeCard}>
                        <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={18}
                            color={colors.primary}
                        />
                        <Text style={styles.narrative}>{latest.ai_narrative}</Text>
                    </View>
                )}

                {/* 2. Os dois números */}
                <AdherenceBlock insight={latest} />

                {/* 3. O que fazer a respeito */}
                {latest.suggested_adjustment && (
                    <AdjustmentTray
                        adjustment={latest.suggested_adjustment}
                        applied={latest.adjustment_applied_at !== null}
                        applying={applying}
                        onApply={handleApply}
                    />
                )}

                {/* 4-6. Os gráficos */}
                <VolumeComparison
                    plannedKm={latest.planned_distance_km ?? 0}
                    completedKm={latest.completed_distance_km ?? 0}
                    totalKm={latest.total_distance_km ?? 0}
                    freeRunKm={latest.free_run_distance_km ?? 0}
                />

                <IntensityCard intensity={latest.intensity_adherence ?? {}} />

                {zones && (
                    <ZonesRadar
                        prescribed={zones.prescribed ?? {}}
                        executed={zones.executed ?? {}}
                    />
                )}

                {/* 7. Semana anterior — reusa o card do Wellness, inclusive o
                    tratamento de deltaPct null (sem base de comparação). */}
                <View style={styles.section}>
                    <View style={styles.sectionHead}>
                        <Text style={styles.heading}>Comparado à semana anterior</Text>
                    </View>
                    <View style={styles.grid}>
                        {deltas.distance && (
                            <PerformanceCard
                                label="Distância"
                                value={formatKm(deltas.distance.value)}
                                unit=" km"
                                deltaPct={deltas.distance.deltaPct}
                                sparkline={deltas.distance.sparkline}
                            />
                        )}
                        {deltas.frequency && (
                            <PerformanceCard
                                label="Corridas"
                                value={String(deltas.frequency.value)}
                                deltaPct={deltas.frequency.deltaPct}
                                sparkline={deltas.frequency.sparkline}
                            />
                        )}
                        {deltas.pace && (
                            <PerformanceCard
                                label="Pace"
                                value={formatPace(deltas.pace.value)}
                                unit="/km"
                                deltaPct={deltas.pace.deltaPct}
                                sparkline={deltas.pace.sparkline}
                                // Pace menor é melhor — inverte a cor do delta.
                                invertDelta
                            />
                        )}
                        {deltas.duration && (
                            <PerformanceCard
                                label="Tempo"
                                value={String(deltas.duration.value)}
                                unit=" min"
                                deltaPct={deltas.duration.deltaPct}
                                sparkline={deltas.duration.sparkline}
                            />
                        )}
                    </View>
                </View>
            </ScrollView>
        </ScreenContainer>
    );
}

function Header({
    onBack,
    subtitle,
    week,
}: {
    onBack: () => void;
    subtitle: string;
    week?: number;
}) {
    return (
        <View style={styles.header}>
            <Pressable
                onPress={onBack}
                hitSlop={12}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
            >
                <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerText}>
                <Text style={styles.title}>
                    {week ? `Semana ${week}` : 'Insight semanal'}
                </Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {/* Espelha a largura do botão para o título ficar óptico ao centro. */}
            <View style={styles.backBtn} />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.base,
        paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 44, justifyContent: 'center' },
    headerText: { flex: 1, alignItems: 'center' },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    subtitle: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    content: {
        paddingHorizontal: spacing.base,
        paddingBottom: spacing['3xl'],
        gap: spacing.xl,
    },
    narrativeCard: {
        flexDirection: 'row',
        gap: spacing.sm,
        backgroundColor: 'rgba(0,212,255,0.06)',
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.16)',
        padding: spacing.lg,
    },
    narrative: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.md,
        lineHeight: 22,
        color: colors.textLight,
    },
    section: { gap: spacing.md },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between' },
    heading: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: spacing.md,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xl,
    },
    stateTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    stateText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    retryBtn: {
        marginTop: spacing.md,
        paddingHorizontal: spacing.xl,
        height: 46,
        borderRadius: borderRadius.full,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    retryText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.text,
    },
});

export default WeeklyInsightScreen;
