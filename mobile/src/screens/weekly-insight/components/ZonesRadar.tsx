import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { RadarChart } from 'react-native-gifted-charts';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { ZONE_COLORS } from '../../../theme/zoneColors';
import type { ZoneBucket } from '../../../types/weeklyInsight.types';

/**
 * ZONAS PRESCRITAS × EXECUTADAS — radar de dois polígonos.
 *
 * `RadarChart` vem da `react-native-gifted-charts`, a mesma lib do
 * `EvolutionChart` do Wellness — nenhuma dependência nova.
 *
 * ── POR QUE NORMALIZAR PARA % ────────────────────────────────────────────────
 *
 * Os dados chegam em km por zona, e um plano típico é esmagadoramente Z1 (em
 * produção, 88 de 120 treinos). Em valor absoluto o radar viraria uma agulha
 * apontando para Z1, com as outras quatro pontas coladas no centro — bonito e
 * ilegível. Normalizando cada série pelo PRÓPRIO total, os dois polígonos
 * passam a descrever FORMA (a distribuição do esforço), que é o que a
 * comparação prescrito × executado quer mostrar.
 *
 * Consequência a manter em mente: o radar não diz "correu menos", diz "correu
 * diferente". O volume absoluto está no `VolumeComparison`, logo acima.
 *
 * ── ZONA SEM DADO ────────────────────────────────────────────────────────────
 *
 * Se não houve nenhum treino concluído, o polígono de executado seria um ponto
 * no centro — o componente cai para um estado vazio explícito em vez de
 * desenhar um radar degenerado.
 */

const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

interface ZonesRadarProps {
    prescribed: Record<string, ZoneBucket>;
    executed: Record<string, ZoneBucket>;
}

function toPercentSeries(buckets: Record<string, ZoneBucket>): {
    series: number[];
    total: number;
} {
    const values = ZONES.map((z) => Number(buckets?.[z]?.km ?? 0));
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0) return { series: ZONES.map(() => 0), total: 0 };
    return {
        series: values.map((v) => Math.round((v / total) * 100)),
        total,
    };
}

export const ZonesRadar = memo(function ZonesRadar({
    prescribed,
    executed,
}: ZonesRadarProps) {
    const { width } = useWindowDimensions();
    // Mesma disciplina do EvolutionChart: reativo a rotação, capado para não
    // estourar a coluna em tablet.
    const chartSize = Math.min(width - spacing.base * 2 - spacing.lg * 2, 300);

    const pres = useMemo(() => toPercentSeries(prescribed), [prescribed]);
    const exec = useMemo(() => toPercentSeries(executed), [executed]);

    const hasExecuted = exec.total > 0;
    const hasPrescribed = pres.total > 0;

    if (!hasPrescribed) {
        return (
            <View style={styles.section}>
                <Text style={styles.heading}>Distribuição de zonas</Text>
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Sem zonas prescritas</Text>
                    <Text style={styles.emptyText}>
                        Os treinos desta semana não trazem zona definida.
                    </Text>
                </View>
            </View>
        );
    }

    // Escala comum: o maior percentual entre as duas séries, arredondado para
    // cima. Sem isso a lib normaliza cada polígono por si e a comparação some.
    const maxValue = Math.max(...pres.series, ...exec.series, 10);

    return (
        <View style={styles.section}>
            <Text style={styles.heading}>Distribuição de zonas</Text>

            <View style={styles.card}>
                <View style={styles.chartWrap}>
                    <RadarChart
                        // Prescrito primeiro (embaixo), executado por cima.
                        dataSet={hasExecuted ? [pres.series, exec.series] : [pres.series]}
                        labels={[...ZONES]}
                        maxValue={maxValue}
                        chartSize={chartSize}
                        noOfSections={4}
                        hideAsterLines={false}
                        polygonConfigArray={
                            hasExecuted
                                ? [
                                      {
                                          fill: 'rgba(255,255,255,0.06)',
                                          stroke: 'rgba(255,255,255,0.35)',
                                          strokeWidth: 1.5,
                                      },
                                      {
                                          fill: 'rgba(0,212,255,0.22)',
                                          stroke: colors.primary,
                                          strokeWidth: 2,
                                      },
                                  ]
                                : [
                                      {
                                          fill: 'rgba(255,255,255,0.06)',
                                          stroke: 'rgba(255,255,255,0.35)',
                                          strokeWidth: 1.5,
                                      },
                                  ]
                        }
                        gridConfig={{
                            stroke: 'rgba(255,255,255,0.08)',
                            strokeWidth: 1,
                        }}
                        asterLinesConfig={{ stroke: 'rgba(255,255,255,0.08)' }}
                        labelConfig={{
                            stroke: colors.textSecondary,
                            fontSize: 11,
                            fontFamily: fonts.semibold,
                            fontWeight: '600',
                        }}
                        hideLabels={false}
                    />
                </View>

                <View style={styles.legend}>
                    <LegendDot
                        color="rgba(255,255,255,0.45)"
                        label="Prescrito"
                    />
                    {hasExecuted ? (
                        <LegendDot color={colors.primary} label="Executado" />
                    ) : (
                        <Text style={styles.legendEmpty}>
                            Nenhum treino concluído nesta semana
                        </Text>
                    )}
                </View>

                {/* A leitura em números, para quem quer o dado exato — e porque
                    forma sozinha não comunica magnitude. */}
                {hasExecuted && (
                    <View style={styles.rows}>
                        {ZONES.map((z, i) => {
                            const p = pres.series[i];
                            const e = exec.series[i];
                            if (p === 0 && e === 0) return null;
                            return (
                                <View key={z} style={styles.row}>
                                    <View
                                        style={[
                                            styles.zoneDot,
                                            { backgroundColor: ZONE_COLORS[z] },
                                        ]}
                                    />
                                    <Text style={styles.zoneCode}>{z}</Text>
                                    <Text style={styles.zoneCompare}>
                                        {p}% → {e}%
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        </View>
    );
});

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: spacing.md },
    heading: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    chartWrap: { alignItems: 'center' },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.lg,
        flexWrap: 'wrap',
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    legendEmpty: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    rows: {
        gap: 6,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    zoneDot: { width: 8, height: 8, borderRadius: 4 },
    zoneCode: {
        width: 26,
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
    },
    zoneCompare: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        gap: spacing.xs,
    },
    emptyTitle: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.base,
        color: colors.text,
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
