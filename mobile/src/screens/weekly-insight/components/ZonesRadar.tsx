import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Polygon, Line, Text as SvgText, Circle } from 'react-native-svg';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../../theme';
import { SectionHeader } from './SectionHeader';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import type { ZoneBucket } from '../../../types/weeklyInsight.types';
import { semanticColors } from "../../../theme/semanticColors";

/**
 * DISTRIBUIÇÃO DE ZONAS — radar desenhado à mão em SVG.
 *
 * ── POR QUE NÃO O RadarChart DA LIB ──────────────────────────────────────────
 *
 * A `react-native-gifted-charts` tem um `RadarChart`, e a primeira versão desta
 * tela o usava. Três motivos para desenhar à mão:
 *
 *  1. A animação dela roda no timing PRÓPRIO e não entra na coreografia de
 *     stagger da tela. Com todo o resto revelando em onda, um radar animando
 *     fora de compasso fica pior que um radar estático.
 *  2. `labelsPositionOffset` é grosseiro demais para garantir que Z1–Z5 não
 *     encostem na borda (o `radius` dela é fixo em `center * 0.8`).
 *  3. O `gridConfig` default preenche cada nível concêntrico — é a origem dos
 *     "pentágonos brancos" que deixavam o gráfico com cara de não-estilizado.
 *
 * Um radar são dois polígonos e cinco rótulos. O app já desenha SVG à mão no
 * `Sparkline`, então isto não introduz um padrão novo.
 *
 * ── POR QUE NORMALIZAR PARA % ────────────────────────────────────────────────
 *
 * Os dados vêm em km, e um plano típico é esmagadoramente Z1 (em produção, 88 de
 * 120 treinos). Em valor absoluto o radar viraria uma agulha apontando para Z1
 * com as outras quatro pontas coladas no centro. Normalizado pelo total de cada
 * série, ele compara FORMA — a distribuição do esforço.
 *
 * Consequência a manter em mente: este gráfico não diz "correu menos", diz
 * "correu diferente". A magnitude está no gráfico de volume, acima.
 */

const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

/** Anéis do grid, como fração do raio. Três bastam para dar régua sem poluir. */
const GRID_RINGS = [1, 0.66, 0.33];
/** Folga entre o polígono e os rótulos — o que impedia Z1–Z5 de encostar. */
const LABEL_GAP = 22;

interface ZonesRadarProps {
    prescribed: Record<string, ZoneBucket>;
    executed: Record<string, ZoneBucket>;
    index?: number;
    /**
     * `false` segura a animacao de entrada. Existe porque a
     * `MesoInsightScreen` monta o dashboard fora da tela e so o traz depois:
     * sem isto a coreografia rodava no vazio e o usuario chegava num painel ja
     * montado. Default `true` -- a tela semanal nao sente diferenca.
     */
    enabled?: boolean;
}

interface Series {
    /** Fração 0..1 por zona, normalizada pelo total da própria série. */
    scales: number[];
    /** Percentual inteiro por zona, para a leitura numérica. */
    percents: number[];
    total: number;
}

function toSeries(buckets: Record<string, ZoneBucket> | undefined): Series {
    const km = ZONES.map((z) => Number(buckets?.[z]?.km ?? 0));
    const total = km.reduce((s, v) => s + v, 0);
    if (total <= 0) {
        return { scales: ZONES.map(() => 0), percents: ZONES.map(() => 0), total: 0 };
    }
    const fractions = km.map((v) => v / total);
    // Escala pelo MAIOR valor da série, não pelo total: com 5 eixos, uma zona a
    // 60% do total ocuparia só 60% do raio e o polígono ficaria minúsculo.
    const max = Math.max(...fractions, 0.0001);
    return {
        scales: fractions.map((f) => f / max),
        percents: fractions.map((f) => Math.round(f * 100)),
        total,
    };
}

/** Vértice i de um pentágono, começando no topo e girando no sentido horário. */
function vertex(cx: number, cy: number, r: number, i: number, scale: number) {
    const angle = (-90 + i * (360 / ZONES.length)) * (Math.PI / 180);
    return {
        x: cx + r * scale * Math.cos(angle),
        y: cy + r * scale * Math.sin(angle),
    };
}

function pointsOf(cx: number, cy: number, r: number, scales: number[]): string {
    return scales
        .map((s, i) => {
            const { x, y } = vertex(cx, cy, r, i, s);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}

export const ZonesRadar = memo(function ZonesRadar({
    prescribed,
    executed,
    index = 5,
    enabled = true,
}: ZonesRadarProps) {
    useThemeSubscription();
    const { width: windowWidth } = useWindowDimensions();
    const progress = useEnterAnimation(index, enabled);

    const pres = useMemo(() => toSeries(prescribed), [prescribed]);
    const exec = useMemo(() => toSeries(executed), [executed]);

    const size = Math.min(windowWidth - spacing.base * 2 - spacing.lg * 2, 300);
    const cx = size / 2;
    const cy = size / 2;
    // O raio precisa deixar espaço para os rótulos FORA do polígono — é isso que
    // resolvia a queixa de "labels ilegíveis/cortadas".
    const radius = size / 2 - LABEL_GAP - 8;

    /**
     * ── POR QUE O POLÍGONO É ESTÁTICO ────────────────────────────────────────
     *
     * A primeira versão animava os PONTOS: um `useAnimatedProps` recalculava
     * `pointsOf(...)` a cada frame para o radar "crescer do centro". Isso
     * quebrava em runtime —
     *
     *   [Worklets] Tried to synchronously call a non-worklet function
     *   `pointsOf` on the UI thread.
     *
     * — porque o corpo de `useAnimatedProps` roda na UI thread, e ali só é
     * possível chamar worklets. `pointsOf` é função JS comum.
     *
     * Dava para marcá-la (e tudo que ela chama) com `'worklet'`, mas isso deixa
     * uma armadilha permanente: qualquer helper novo que entrasse na cadeia
     * quebraria a tela de novo, em runtime, longe daqui.
     *
     * A geometria vira `useMemo` (roda uma vez, em JS) e a ENTRADA é do
     * container: opacity + um scale sutil, que já é uma animação de estilo
     * comum e não precisa de worklet nenhum. Visualmente o radar continua
     * surgindo com a onda do stagger.
     */
    const geometry = useMemo(
        () => ({
            grid: GRID_RINGS.map((ring) =>
                pointsOf(cx, cy, radius, ZONES.map(() => ring)),
            ),
            axes: ZONES.map((_, i) => vertex(cx, cy, radius, i, 1)),
            prescribed: pointsOf(cx, cy, radius, pres.scales),
            executed: pointsOf(cx, cy, radius, exec.scales),
            dots: exec.scales.map((s, i) => vertex(cx, cy, radius, i, s)),
            labels: ZONES.map((_, i) =>
                vertex(cx, cy, radius + LABEL_GAP, i, 1),
            ),
        }),
        [cx, cy, radius, pres.scales, exec.scales],
    );

    const containerStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        // 0.94 → 1: sugere o "crescer" sem tocar na geometria.
        transform: [{ scale: 0.94 + progress.value * 0.06 }],
    }));

    const hasPrescribed = pres.total > 0;
    const hasExecuted = exec.total > 0;

    if (!hasPrescribed) {
        return (
            <View style={styles.section}>
                <SectionHeader eyebrow="Intensidade" title="Distribuição de zonas" />
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Sem zonas prescritas</Text>
                    <Text style={styles.emptyText}>
                        Os treinos desta semana não trazem zona definida.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <SectionHeader
                eyebrow="Intensidade"
                title="Distribuição de zonas"
                note="proporção"
            />

            <Animated.View style={[styles.card, containerStyle]}>
                <View style={styles.chartWrap}>
                    <Svg width={size} height={size}>
                        {/* Grid: anéis recessivos, SEM fill — o fill default da
                            lib era exatamente o "pentágono branco". */}
                        {geometry.grid.map((points, i) => (
                            <Polygon
                                key={`ring-${i}`}
                                points={points}
                                fill="none"
                                stroke={semanticColors.borderSubtle}
                                strokeWidth={1}
                            />
                        ))}

                        {/* Eixos do centro a cada vértice. */}
                        {geometry.axes.map((p, i) => (
                            <Line
                                key={`axis-${ZONES[i]}`}
                                x1={cx}
                                y1={cy}
                                x2={p.x}
                                y2={p.y}
                                stroke={semanticColors.fillSubtle}
                                strokeWidth={1}
                            />
                        ))}

                        {/* PRESCRITO — o alvo: tracejado, sem preenchimento. */}
                        <Polygon
                            points={geometry.prescribed}
                            fill="none"
                            stroke={semanticColors.textTertiary}
                            strokeWidth={1.5}
                            strokeDasharray="5,4"
                        />

                        {/* EXECUTADO — ciano preenchido, a série protagonista. */}
                        {hasExecuted && (
                            <Polygon
                                points={geometry.executed}
                                fill="rgba(0,212,255,0.22)"
                                stroke={colors.primary}
                                strokeWidth={2}
                                strokeLinejoin="round"
                            />
                        )}

                        {/* Vértices do executado, para o polígono ter articulação. */}
                        {hasExecuted &&
                            geometry.dots.map((p, i) => (
                                <Circle
                                    key={`dot-${i}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r={2.5}
                                    fill={colors.primary}
                                />
                            ))}

                        {/* Rótulos FORA do polígono, com folga. `fontWeight` sem
                            depender só de `fontFamily`: fonte customizada em
                            <Text> de SVG é frágil no Android, e o peso garante
                            legibilidade mesmo se a família não resolver. */}
                        {geometry.labels.map((p, i) => (
                            <SvgText
                                key={`label-${ZONES[i]}`}
                                x={p.x}
                                y={p.y}
                                fill={colors.textLight}
                                fontSize={12}
                                fontWeight="700"
                                textAnchor="middle"
                                alignmentBaseline="middle"
                            >
                                {ZONES[i]}
                            </SvgText>
                        ))}
                    </Svg>
                </View>

                <View style={styles.legend}>
                    <LegendItem color={colors.primary} label="Executado" filled />
                    <LegendItem color={semanticColors.textTertiary} label="Prescrito" dashed />
                </View>

                {hasExecuted ? (
                    <View style={styles.rows}>
                        {ZONES.map((z, i) => {
                            const p = pres.percents[i];
                            const e = exec.percents[i];
                            if (p === 0 && e === 0) return null;
                            return (
                                <View key={z} style={styles.row}>
                                    <Text style={styles.zoneCode}>{z}</Text>
                                    <Text style={styles.zonePres}>{p}%</Text>
                                    <Text style={styles.zoneArrow}>→</Text>
                                    <Text style={styles.zoneExec}>{e}%</Text>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <Text style={styles.noExec}>
                        Nenhum treino concluído nesta semana
                    </Text>
                )}
            </Animated.View>
        </View>
    );
});

function LegendItem({
    color,
    label,
    filled,
    dashed,
}: {
    color: string;
    label: string;
    filled?: boolean;
    dashed?: boolean;
}) {
    useThemeSubscription();
    return (
        <View style={styles.legendItem}>
            <View
                style={[
                    styles.legendSwatch,
                    { borderColor: color },
                    filled ? { backgroundColor: 'rgba(0,212,255,0.22)' } : null,
                    dashed ? styles.legendDashed : null,
                ]}
            />
            <Text style={styles.legendText}>{label}</Text>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    section: { gap: spacing.md },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
    },
    chartWrap: { alignItems: 'center' },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.lg,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: {
        width: 14,
        height: 10,
        borderRadius: 3,
        borderWidth: 1.5,
    },
    legendDashed: { borderStyle: 'dashed' },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    rows: {
        gap: 5,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    zoneCode: {
        width: 26,
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
    },
    zonePres: {
        width: 40,
        textAlign: 'right',
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    zoneArrow: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    zoneExec: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
    },
    noExec: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        textAlign: 'center',
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.xl,
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
}));
