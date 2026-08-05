import React, { useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { ScreenContainer } from '../../components/ScreenContainer';
import { colors, typography, spacing, borderRadius, fonts } from '../../theme';
import { useWeeklyInsightStore } from '../../stores/weeklyInsightStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { formatWeekRange } from './format';
import { useWeeklySeries } from './hooks/useWeeklySeries';

import { CoachCallout } from './components/CoachCallout';
import { HeroStats } from './components/HeroStats';
import { WeeklyProgressChart } from './components/WeeklyProgressChart';
import { VolumeComparison } from './components/VolumeComparison';
import { IntensityCard } from './components/IntensityCard';
import { ZonesRadar } from './components/ZonesRadar';
import { AdjustmentTray } from './components/AdjustmentTray';
import { InsightSkeleton } from './components/InsightSkeleton';

/**
 * INSIGHT SEMANAL — o dashboard da semana do plano.
 *
 * Diferente da retrospectiva (stories de celebração, fim de ciclo), esta tela é
 * ANALÍTICA e RECORRENTE: o corredor a vê toda semana, então nada de espetáculo.
 *
 * ── A HIERARQUIA ─────────────────────────────────────────────────────────────
 *
 * A primeira versão era uma pilha de nove cards do mesmo cinza — o olho entrava
 * e não sabia onde pousar, que é exatamente o que faz um dashboard parecer um
 * formulário. Agora há um BLOCO HERÓI no topo (voz do coach + os três números,
 * com o do plano em ciano) e, abaixo dele, seções com identidade própria.
 *
 * A bandeja de reajuste fecha a tela de propósito: ela é a conclusão do que os
 * gráficos mostraram, e lida depois deles faz sentido narrativo — "foi assim,
 * portanto faça isto".
 *
 * ── A COREOGRAFIA ────────────────────────────────────────────────────────────
 *
 * Cada seção recebe um índice e revela com ~45ms de atraso em cascata
 * (`useEnterAnimation`). Os índices abaixo são a ordem de leitura — mudá-los
 * muda a onda.
 */

// Ordem da cascata. Explícita para a coreografia ser legível de um lugar só.
const IDX = {
    coach: 0,
    stats: 1,
    progress: 2,
    volume: 3,
    intensity: 4,
    zones: 5,
    tray: 6,
} as const;

export function WeeklyInsightScreen() {
    const navigation = useNavigation();

    const { latest, loading, error, applying, fetch, markSeen, applyAdjustment } =
        useWeeklyInsightStore();

    // A trajetória vem do plano, não do insight — e a tela pode ser aberta
    // direto pela notificação, sem a home ter carregado o overview antes.
    const fetchPlanOverview = useTrainingStore((s) => s.fetchPlanOverview);
    const series = useWeeklySeries();

    useEffect(() => {
        void fetch();
    }, [fetch]);

    useEffect(() => {
        if (!series.hasData) void fetchPlanOverview();
    }, [series.hasData, fetchPlanOverview]);

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
        void fetchPlanOverview();
    }, [fetch, fetchPlanOverview]);

    // ── Estados de UI ────────────────────────────────────────────────────────

    if (loading && !latest) {
        return (
            <ScreenContainer>
                <Header onBack={() => navigation.goBack()} />
                <InsightSkeleton />
            </ScreenContainer>
        );
    }

    if (error && !latest) {
        return (
            <ScreenContainer>
                <Header onBack={() => navigation.goBack()} />
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
                <Header onBack={() => navigation.goBack()} />
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

    const zones = latest.zone_distribution;

    return (
        <ScreenContainer>
            <Header
                onBack={() => navigation.goBack()}
                subtitle={formatWeekRange(latest.week_start, latest.week_end)}
                week={latest.week_number}
                totalWeeks={series.totalWeeks}
            />

            <ScrollView
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
                {/* ── HERÓI ── */}
                {!!latest.ai_narrative && (
                    <CoachCallout
                        narrative={latest.ai_narrative}
                        index={IDX.coach}
                    />
                )}

                <HeroStats insight={latest} index={IDX.stats} />

                {/* ── A TRAJETÓRIA ── */}
                <WeeklyProgressChart
                    points={series.points}
                    currentWeek={series.currentWeek || latest.week_number}
                    totalWeeks={series.totalWeeks}
                    index={IDX.progress}
                />

                {/* ── A SEMANA EM DETALHE ── */}
                <VolumeComparison
                    plannedKm={latest.planned_distance_km ?? 0}
                    completedKm={latest.completed_distance_km ?? 0}
                    totalKm={latest.total_distance_km ?? 0}
                    freeRunKm={latest.free_run_distance_km ?? 0}
                    executionRatio={latest.execution_ratio_percent}
                    index={IDX.volume}
                />

                <IntensityCard
                    intensity={latest.intensity_adherence ?? {}}
                    index={IDX.intensity}
                />

                {zones && (
                    <ZonesRadar
                        prescribed={zones.prescribed ?? {}}
                        executed={zones.executed ?? {}}
                        index={IDX.zones}
                    />
                )}

                {/* ── A CONCLUSÃO: o que fazer a respeito ── */}
                {latest.suggested_adjustment && (
                    <AdjustmentTray
                        adjustment={latest.suggested_adjustment}
                        applied={latest.adjustment_applied_at !== null}
                        applying={applying}
                        onApply={handleApply}
                    />
                )}
            </ScrollView>
        </ScreenContainer>
    );
}

function Header({
    onBack,
    subtitle,
    week,
    totalWeeks,
}: {
    onBack: () => void;
    subtitle?: string;
    week?: number;
    totalWeeks?: number;
}) {
    // "Semana 3 de 12" — o "de N" é a informação de contexto mais barata da
    // tela, e ela faltava por completo.
    const title = week
        ? totalWeeks && totalWeeks > 0
            ? `Semana ${week} de ${totalWeeks}`
            : `Semana ${week}`
        : 'Insight semanal';

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
                <Text style={styles.title}>{title}</Text>
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
        fontSize: typography.fontSizes.lg,
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
        // Respiro entre blocos — o "cramped = cheap" do checklist.
        gap: spacing.xl,
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
