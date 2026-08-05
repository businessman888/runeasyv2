import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { CountUp } from './CountUp';
import type { WeeklyInsight } from '../../../types/weeklyInsight.types';

/**
 * A LINHA DE 3 STATS — o herói numérico da tela.
 *
 * ── OS DOIS ESCOPOS CONTINUAM SEPARADOS ──────────────────────────────────────
 *
 * "Do plano" (só treinos do plano) e "Total corrido" (tudo, inclusive corrida
 * livre) são colunas distintas com rótulo de escopo, exatamente como a Fase 1A
 * estabeleceu. Nunca somar: seriam a mesma corrida contada duas vezes.
 *
 * ── POR QUE SÓ O PRIMEIRO É CIANO ────────────────────────────────────────────
 *
 * O ciano é a cor de destaque do app e vale mais quanto menos for usada. "Do
 * plano" é o número que responde à pergunta da tela — é ele que ganha a cor, o
 * tamanho maior e o contador. Os outros dois são contexto, e ficam em branco.
 * Três números da mesma cor e do mesmo tamanho seriam três números sem hierarquia.
 */

interface HeroStatsProps {
    insight: WeeklyInsight;
    index?: number;
}

export const HeroStats = memo(function HeroStats({
    insight,
    index = 1,
}: HeroStatsProps) {
    const progress = useEnterAnimation(index);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    const completed = insight.completed_workouts ?? 0;
    const planned = insight.planned_workouts ?? 0;

    return (
        <Animated.View style={[styles.card, animatedStyle]}>
            <Stat
                label="Do plano"
                value={insight.completed_distance_km ?? 0}
                decimals={1}
                unit="km"
                caption={`de ${(insight.planned_distance_km ?? 0).toFixed(0)} km`}
                accent={colors.primary}
                hero
                index={index}
            />

            <View style={styles.divider} />

            <Stat
                label="Total corrido"
                value={insight.total_distance_km ?? 0}
                decimals={1}
                unit="km"
                caption={
                    (insight.free_run_distance_km ?? 0) > 0
                        ? `${(insight.free_run_distance_km ?? 0).toFixed(0)} km livres`
                        : 'tudo no plano'
                }
                index={index}
            />

            <View style={styles.divider} />

            <Stat
                label="Aderência"
                value={insight.completion_rate ?? 0}
                decimals={0}
                unit="%"
                caption={`${completed} de ${planned} treinos`}
                index={index}
            />
        </Animated.View>
    );
});

function Stat({
    label,
    value,
    decimals,
    unit,
    caption,
    accent,
    hero,
    index,
}: {
    label: string;
    value: number;
    decimals: number;
    unit: string;
    caption: string;
    accent?: string;
    hero?: boolean;
    index: number;
}) {
    return (
        <View style={styles.stat}>
            <Text style={styles.label} numberOfLines={1}>
                {label}
            </Text>
            <View style={styles.valueRow}>
                <CountUp
                    value={value}
                    decimals={decimals}
                    index={index}
                    style={[
                        styles.value,
                        hero ? styles.valueHero : null,
                        accent ? { color: accent } : null,
                    ]}
                />
                <Text style={[styles.unit, hero ? styles.unitHero : null]}>
                    {unit}
                </Text>
            </View>
            <Text style={styles.caption} numberOfLines={1}>
                {caption}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.sm,
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    label: {
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: colors.textSecondary,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
    },
    valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    value: {
        fontFamily: fonts.extrabold,
        fontSize: 24,
        lineHeight: 30,
        color: colors.text,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    valueHero: { fontSize: 32, lineHeight: 38 },
    unit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        paddingBottom: 5,
    },
    unitHero: { fontSize: typography.fontSizes.sm, paddingBottom: 7 },
    caption: {
        fontFamily: fonts.medium,
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
