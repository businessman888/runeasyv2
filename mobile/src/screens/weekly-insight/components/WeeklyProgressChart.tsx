import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { SectionHeader } from './SectionHeader';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import type { WeekPoint } from '../hooks/useWeeklySeries';

/**
 * VOLUME POR SEMANA DO PLANO — a trajetória.
 *
 * ── O QUE ESTA SEÇÃO RESOLVE ─────────────────────────────────────────────────
 *
 * Todo o resto da tela descreve UMA semana. Sem uma linha ao longo do plano, o
 * atleta não tem noção de onde está no arco — e um dashboard sem trajetória lê
 * como um relatório isolado. Este é o gráfico que dá sensação de progresso.
 *
 * ── AS DUAS SÉRIES ───────────────────────────────────────────────────────────
 *
 * PRESCRITO   tracejado, mudo, do início ao FIM do plano — é o arco, e a parte
 *             futura dele é o que mostra "para onde vai".
 * EXECUTADO   ciano sólido com área, para na semana atual. Semana futura é
 *             `null`, não `0` — a lib não desenha ponto onde não há dado, e é
 *             assim que "ainda não aconteceu" se distingue de "correu zero".
 *
 * O ponto maior na semana atual é o "você está aqui".
 *
 * Usa `LineChart` da `react-native-gifted-charts`, a mesma lib e o mesmo molde
 * do `EvolutionChart` do Wellness — nenhuma dependência nova.
 */

interface WeeklyProgressChartProps {
    points: WeekPoint[];
    currentWeek: number;
    totalWeeks: number;
    index?: number;
}

export const WeeklyProgressChart = memo(function WeeklyProgressChart({
    points,
    currentWeek,
    totalWeeks,
    index = 2,
}: WeeklyProgressChartProps) {
    const { width: windowWidth } = useWindowDimensions();
    const progress = useEnterAnimation(index, points.length > 0);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    // Mesma disciplina do EvolutionChart: reativo a rotação, capado para não
    // estourar a coluna centralizada em tablet.
    const screenWidth = Math.min(windowWidth, 900);
    const chartWidth = screenWidth - spacing.base * 2 - spacing.lg * 2 - 34;

    const { planned, executed, maxValue } = useMemo(() => {
        const label = (p: WeekPoint) =>
            // Rotular toda semana num plano de 12 vira ruído ilegível.
            p.weekNumber % 2 === 1 ? `S${p.weekNumber}` : '';

        const plannedData = points.map((p) => ({
            value: p.plannedKm,
            label: label(p),
        }));

        // Só até a semana atual. Cortar o array (em vez de mandar null) é o que
        // faz a área parar exatamente no presente.
        const executedPoints = points.filter((p) => !p.isFuture);
        const executedData = executedPoints.map((p) => ({
            value: p.completedKm ?? 0,
            label: label(p),
            // Ponto visível só na semana atual — o "você está aqui".
            hideDataPoint: !p.isCurrent,
            dataPointRadius: p.isCurrent ? 5 : 0,
            dataPointColor: colors.primary,
        }));

        const all = [
            ...plannedData.map((d) => d.value),
            ...executedData.map((d) => d.value),
        ];
        const max = Math.max(...all, 1);

        return {
            planned: plannedData,
            executed: executedData,
            maxValue: Math.ceil(max * 1.15),
        };
    }, [points]);

    if (points.length === 0) {
        // Acontece quando a tela é aberta direto pela notificação, sem passar
        // pela home — `planOverview` ainda não foi buscado. Estado próprio em
        // vez de quebrar ou sumir sem explicação.
        return (
            <View style={styles.section}>
                <SectionHeader eyebrow="Trajetória" title="Volume por semana" />
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                        Abra a aba de treinos para carregar a progressão do plano.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <Animated.View style={[styles.section, animatedStyle]}>
            <SectionHeader
                eyebrow="Trajetória"
                title="Volume por semana"
                note={`Semana ${currentWeek} de ${totalWeeks}`}
            />

            <View style={styles.card}>
                <LineChart
                    // Série 1 = prescrito (o arco completo, tracejado ao fundo).
                    data={planned}
                    strokeDashArray={[5, 5]}
                    color="rgba(255,255,255,0.24)"
                    thickness={1.5}
                    hideDataPoints
                    // `areaChart` é GLOBAL: sem zerar aqui, o prescrito também
                    // ganharia área — e o default de opacidade da lib é 1, ou
                    // seja, um bloco sólido claro cobrindo o gráfico. Só o
                    // executado tem preenchimento.
                    startOpacity={0}
                    endOpacity={0}
                    // Série 2 = executado (ciano com área, até a semana atual).
                    data2={executed}
                    color2={colors.primary}
                    thickness2={2.5}
                    areaChart
                    startFillColor2={colors.primary}
                    endFillColor2={colors.primary}
                    startOpacity2={0.32}
                    endOpacity2={0.02}
                    curved
                    height={165}
                    width={chartWidth}
                    maxValue={maxValue}
                    noOfSections={4}
                    initialSpacing={12}
                    endSpacing={8}
                    spacing={Math.max(18, chartWidth / Math.max(points.length, 1))}
                    // Grid recessivo: presente para dar régua, nunca competindo
                    // com o dado.
                    yAxisColor="transparent"
                    xAxisColor={colors.border}
                    rulesType="solid"
                    rulesColor="rgba(255,255,255,0.05)"
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={styles.axisText}
                    isAnimated
                    animationDuration={700}
                />

                <View style={styles.legend}>
                    <LegendItem
                        color={colors.primary}
                        label="Você correu"
                        solid
                    />
                    <LegendItem
                        color="rgba(255,255,255,0.34)"
                        label="Prescrito"
                    />
                    <Text style={styles.unit}>km</Text>
                </View>
            </View>
        </Animated.View>
    );
});

function LegendItem({
    color,
    label,
    solid,
}: {
    color: string;
    label: string;
    solid?: boolean;
}) {
    return (
        <View style={styles.legendItem}>
            <View
                style={[
                    styles.legendDash,
                    { backgroundColor: color },
                    // Traço contínuo × tracejado — a legenda espelha a linha, em
                    // vez de usar só cor para distinguir as séries.
                    solid ? null : styles.legendDashed,
                ]}
            />
            <Text style={styles.legendText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: spacing.md },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.lg,
        paddingLeft: spacing.md,
        paddingRight: spacing.md,
    },
    axisText: {
        color: colors.textMuted,
        fontSize: 10,
        fontFamily: fonts.medium,
    },
    legend: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.base,
        marginTop: spacing.md,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDash: { width: 14, height: 2.5, borderRadius: 2 },
    legendDashed: { width: 5, marginRight: 9 },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    unit: {
        flex: 1,
        textAlign: 'right',
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.xl,
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
