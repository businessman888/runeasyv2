import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { formatKm, formatPercent } from '../../../screens/weekly-insight/format';
import {
    PHASE_LABELS,
    type MesoInsight,
} from '../../../types/mesoInsight.types';
import { cardStyles } from './cardStyles';

/**
 * O card do INSIGHT DE MESOCICLO no carrossel — um CONVITE, não o insight.
 *
 * ── ELE JÁ FOI O INSIGHT INTEIRO ─────────────────────────────────────────────
 *
 * Enquanto não havia tela por trás, este card carregava tudo: arco, aderência,
 * tiros e narrativa. Com a `MesoInsightScreen` existindo, manter isso aqui
 * duplicaria o topo da tela e deixaria a folha alta demais — o cartão de
 * entrada passaria mais informação que o destino.
 *
 * Agora é simétrico ao card semanal: rótulo, número-herói, o arco em miniatura
 * e um CTA. O arco fica porque é a ASSINATURA desta altitude — o desenho que o
 * insight semanal, enxergando uma semana só, não tem como fazer.
 */
export const MesoInsightCardBody = memo(function MesoInsightCardBody({
    insight,
    onOpen,
}: {
    insight: MesoInsight;
    onOpen: () => void;
}) {
    const trend = insight.volume_trend ?? [];

    // Escala das barras pelo MAIOR valor do bloco (prescrito ou corrido), para
    // o vale de deload aparecer como vale — e não achatado contra o teto.
    const maxKm = useMemo(
        () =>
            Math.max(
                1,
                ...trend.map((p) => Math.max(p.plannedKm, p.completedKm)),
            ),
        [trend],
    );

    const fase = PHASE_LABELS[insight.dominant_phase] ?? insight.dominant_phase;

    return (
        <View style={cardStyles.body}>
            <View style={cardStyles.headText}>
                <Text style={cardStyles.eyebrow}>
                    Bloco {insight.block_index} · {fase}
                </Text>
                <Text style={cardStyles.range}>
                    Semanas {insight.week_start} a {insight.week_end}
                </Text>
            </View>

            {/* ── O ARCO ── */}
            {trend.length > 0 && (
                <View style={styles.trend}>
                    {trend.map((p) => {
                        const doneH = Math.max(
                            2,
                            Math.round((p.completedKm / maxKm) * TREND_H),
                        );
                        const planH = Math.max(
                            2,
                            Math.round((p.plannedKm / maxKm) * TREND_H),
                        );
                        return (
                            <View key={p.weekNumber} style={styles.trendCol}>
                                {/* Trilho = prescrito; barra cheia = corrido. */}
                                <View style={[styles.rail, { height: planH }]}>
                                    <View style={[styles.fill, { height: doneH }]} />
                                </View>
                                <Text style={styles.trendLabel}>S{p.weekNumber}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            <View style={cardStyles.keyRow}>
                <View style={cardStyles.keyBlock}>
                    <Text style={cardStyles.keyValue}>
                        {formatKm(insight.completed_distance_km)}
                        <Text style={cardStyles.keyUnit}> km</Text>
                    </Text>
                    <Text style={cardStyles.keyLabel}>
                        de {formatKm(insight.planned_distance_km)} km do bloco
                    </Text>
                </View>
                <View style={cardStyles.keyDivider} />
                <View style={cardStyles.keyBlock}>
                    <Text style={cardStyles.keyValue}>
                        {formatPercent(insight.completion_rate)}
                    </Text>
                    <Text style={cardStyles.keyLabel}>
                        {insight.completed_workouts ?? 0} de{' '}
                        {insight.planned_workouts ?? 0} treinos
                    </Text>
                </View>
            </View>

            {!!insight.ai_narrative && (
                <Text style={cardStyles.narrative} numberOfLines={3}>
                    {insight.ai_narrative}
                </Text>
            )}

            <MesoFooter insight={insight} />

            <Pressable
                onPress={onOpen}
                style={({ pressed }) => [
                    cardStyles.cta,
                    pressed && cardStyles.ctaPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Ver o bloco completo"
            >
                <Text style={cardStyles.ctaText}>Ver o bloco completo</Text>
            </Pressable>
        </View>
    );
});

/**
 * O rodapé: evolução de nível quando houve, execução dos tiros quando não.
 *
 * "Não mudou" é o caso COMUM — a cadência real permite ~1 movimento por plano,
 * e ele cai no bloco que não gera insight. Por isso a ausência não vira espaço
 * vazio nem frase de consolo: entra o número real dos tiros, que é informação
 * verdadeira sobre o bloco.
 */
const MesoFooter = memo(function MesoFooter({
    insight,
}: {
    insight: MesoInsight;
}) {
    const vdot = insight.vdot_highlight;
    const efforts = insight.quality_efforts ?? [];

    if (vdot) {
        const subiu = vdot.direction === 'up';
        return (
            <View style={[styles.footer, styles.footerHighlight]}>
                <Ionicons
                    name={subiu ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={colors.primary}
                />
                <Text style={[styles.footerText, styles.footerTextHighlight]}>
                    {subiu
                        ? 'Seu ritmo evoluiu neste bloco — os treinos à frente já foram ajustados.'
                        : 'Aliviamos seu ritmo neste bloco — os treinos à frente já foram ajustados.'}
                </Text>
            </View>
        );
    }

    if (efforts.length > 0) {
        const noAlvo = efforts.filter((e) => e.deltaSeconds === 0).length;
        return (
            <View style={styles.footer}>
                <Ionicons name="flash-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.footerText}>
                    {noAlvo === efforts.length
                        ? `${efforts.length} treino${efforts.length > 1 ? 's' : ''} de qualidade, ${efforts.length > 1 ? 'todos' : 'ele'} no ritmo alvo.`
                        : `${efforts.length} treino(s) de qualidade medidos, ${noAlvo} no ritmo alvo.`}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.footer}>
            <Ionicons name="footsteps-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.footerText}>
                Bloco de volume aeróbico — sem treino de qualidade medido.
            </Text>
        </View>
    );
});

/** Altura máxima das barras do arco. */
const TREND_H = 56;

const styles = StyleSheet.create({
    trend: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.sm,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
        paddingHorizontal: spacing.base,
    },
    trendCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
    rail: {
        width: '100%',
        maxWidth: 34,
        borderRadius: borderRadius.sm,
        backgroundColor: colors.borderLight,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    fill: {
        width: '100%',
        borderRadius: borderRadius.sm,
        backgroundColor: colors.primary,
    },
    trendLabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },

    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.base,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.glassLight,
    },
    footerHighlight: {
        backgroundColor: 'rgba(0, 212, 255, 0.10)',
    },
    footerText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        lineHeight: 19,
        color: colors.textSecondary,
    },
    footerTextHighlight: {
        fontFamily: fonts.semibold,
        color: colors.textLight,
    },
});
