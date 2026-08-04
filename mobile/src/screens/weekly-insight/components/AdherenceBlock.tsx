import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { formatKm, formatPercent } from '../format';
import type { WeeklyInsight } from '../../../types/weeklyInsight.types';

/**
 * OS DOIS NÚMEROS QUE NUNCA SE SOMAM.
 *
 * Aderência ao plano (escopo: treinos do plano) e total corrido (escopo: tudo,
 * inclusive corrida livre) aparecem LADO A LADO, com rótulos que dizem o escopo
 * de cada um. É a regra que a Fase 1A estabeleceu ao consertar a retrospectiva,
 * onde os dois estavam misturados e a corrida livre inflava a aderência.
 *
 * Mostrar os dois separados também é o que permite ao coach dizer "você correu
 * 25 km, mas só 15 entraram no plano" em vez de exibir 60% sem explicação.
 *
 * ── DUAS PERGUNTAS, DOIS PERCENTUAIS ─────────────────────────────────────────
 *
 * `completion_rate` responde "você apareceu?" (sessões feitas ÷ previstas).
 * `execution_ratio_percent` responde "quando apareceu, cumpriu?" (distância
 * feita ÷ prescrita, só dos treinos concluídos). São a base da escada de
 * reajuste, e separá-los na tela é o que torna a sugestão compreensível.
 */

interface AdherenceBlockProps {
    insight: WeeklyInsight;
}

export const AdherenceBlock = memo(function AdherenceBlock({
    insight,
}: AdherenceBlockProps) {
    const completed = insight.completed_workouts ?? 0;
    const planned = insight.planned_workouts ?? 0;

    return (
        <View style={styles.section}>
            <View style={styles.pair}>
                <Stat
                    label="Do plano"
                    value={formatKm(insight.completed_distance_km)}
                    unit="km"
                    caption={`de ${formatKm(insight.planned_distance_km)} km prescritos`}
                    accent={colors.primary}
                />
                <Stat
                    label="Total corrido"
                    value={formatKm(insight.total_distance_km)}
                    unit="km"
                    caption={
                        (insight.free_run_distance_km ?? 0) > 0
                            ? `${formatKm(insight.free_run_distance_km)} km fora do plano`
                            : 'tudo dentro do plano'
                    }
                    accent={colors.textLight}
                />
            </View>

            <View style={styles.answers}>
                <Answer
                    question="Você apareceu?"
                    value={formatPercent(insight.completion_rate)}
                    detail={`${completed} de ${planned} treinos · ${insight.frequency_actual_days ?? 0} dia(s)`}
                />
                <View style={styles.divider} />
                <Answer
                    question="Cumpriu o que fez?"
                    value={formatPercent(insight.execution_ratio_percent)}
                    detail="da distância prescrita nos treinos concluídos"
                />
            </View>
        </View>
    );
});

function Stat({
    label,
    value,
    unit,
    caption,
    accent,
}: {
    label: string;
    value: string;
    unit: string;
    caption: string;
    accent: string;
}) {
    return (
        <View style={styles.statCard}>
            <Text style={styles.statLabel}>{label}</Text>
            <View style={styles.statValueRow}>
                <Text
                    style={[styles.statValue, { color: accent }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                >
                    {value}
                </Text>
                <Text style={styles.statUnit}>{unit}</Text>
            </View>
            <Text style={styles.statCaption}>{caption}</Text>
        </View>
    );
}

function Answer({
    question,
    value,
    detail,
}: {
    question: string;
    value: string;
    detail: string;
}) {
    return (
        <View style={styles.answer}>
            <Text style={styles.answerQuestion}>{question}</Text>
            <Text style={styles.answerValue}>{value}</Text>
            <Text style={styles.answerDetail}>{detail}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: spacing.md },
    pair: { flexDirection: 'row', gap: spacing.md },
    statCard: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 2,
    },
    statLabel: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    statValue: {
        fontFamily: fonts.extrabold,
        fontSize: 34,
        lineHeight: 38,
        letterSpacing: -0.8,
    },
    statUnit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        paddingBottom: 5,
    },
    statCaption: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    answers: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
    },
    answer: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm },
    answerQuestion: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    answerValue: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes['2xl'],
        color: colors.text,
    },
    answerDetail: {
        fontFamily: fonts.regular,
        fontSize: 10,
        color: colors.textMuted,
        textAlign: 'center',
    },
    divider: {
        width: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: spacing.xs,
    },
});
