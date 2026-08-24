import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    type SharedValue,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography, fonts, createThemeStyles, useThemeSubscription } from '../../../theme';
import { formatKm } from '../../weekly-insight/format';
import type { VolumeTrendPoint } from '../../../types/mesoInsight.types';

/**
 * O ARCO — as 4 semanas do bloco, prescrito × corrido.
 *
 * ── POR QUE À MÃO, E NÃO NO gifted-charts ────────────────────────────────────
 *
 * Quatro barras não justificam uma biblioteca de gráfico, e à mão elas entram
 * na COREOGRAFIA da tela: a altura interpola do mesmo `useEnterAnimation` que
 * escalona as outras seções, então o arco sobe na onda em vez de rodar no
 * timing próprio da lib. É a mesma decisão que o `ZonesRadar` da 2B tomou pelo
 * mesmo motivo.
 *
 * ── O QUE O DESENHO PRECISA MOSTRAR ──────────────────────────────────────────
 *
 * A quarta semana é o DELOAD — o motor de volume corta 25% de propósito. O
 * trilho (prescrito) por trás da barra (corrido) é o que faz esse recuo ler
 * como recuperação planejada e não como falha: o trilho recua junto.
 *
 * A escala é o MAIOR valor do bloco, não um teto fixo. Com teto fixo, um bloco
 * de base inteiro ficaria achatado embaixo e o arco desapareceria.
 */

const BAR_H = 104;

interface MesoVolumeArcProps {
    trend: VolumeTrendPoint[];
    /** Progresso da seção na coreografia da tela. */
    progress: SharedValue<number>;
}

export const MesoVolumeArc = memo(function MesoVolumeArc({
    trend,
    progress,
}: MesoVolumeArcProps) {
    useThemeSubscription();
    if (trend.length === 0) return null;

    const max = Math.max(
        1,
        ...trend.map((p) => Math.max(p.plannedKm, p.completedKm)),
    );

    return (
        <View style={styles.card}>
            <View style={styles.row}>
                {trend.map((p, i) => (
                    <View key={p.weekNumber} style={styles.col}>
                        <Text style={styles.km}>{formatKm(p.completedKm)}</Text>

                        <View style={styles.track}>
                            {/* Trilho = prescrito. Recua junto no deload. */}
                            <View
                                style={[
                                    styles.planned,
                                    { height: Math.max(4, (p.plannedKm / max) * BAR_H) },
                                ]}
                            />
                            <Bar
                                target={Math.max(4, (p.completedKm / max) * BAR_H)}
                                progress={progress}
                                order={i}
                            />
                        </View>

                        <Text style={styles.week}>S{p.weekNumber}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.swatch, styles.swatchDone]} />
                    <Text style={styles.legendText}>Você correu</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.swatch, styles.swatchPlan]} />
                    <Text style={styles.legendText}>Prescrito</Text>
                </View>
            </View>
        </View>
    );
});

/**
 * Uma barra. O `order` desloca a fatia de `progress` que ela consome, de modo
 * que as quatro sobem em sequência dentro do mesmo valor animado — sem quatro
 * timers concorrentes.
 */
const Bar = memo(function Bar({
    target,
    progress,
    order,
}: {
    target: number;
    progress: SharedValue<number>;
    order: number;
}) {
    useThemeSubscription();
    const start = order * 0.12;

    const style = useAnimatedStyle(() => ({
        height: interpolate(
            progress.value,
            [start, start + 0.5],
            [4, target],
            'clamp',
        ),
    }));

    return <Animated.View style={[styles.done, style]} />;
});

const styles = createThemeStyles(() => ({
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.base,
        gap: spacing.base,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.sm,
    },
    col: { flex: 1, alignItems: 'center', gap: spacing.xs },

    track: {
        width: '100%',
        maxWidth: 44,
        height: BAR_H,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    planned: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        borderRadius: borderRadius.sm,
        backgroundColor: colors.borderLight,
    },
    done: {
        width: '100%',
        borderRadius: borderRadius.sm,
        backgroundColor: colors.primary,
    },

    km: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
    },
    week: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },

    legend: { flexDirection: 'row', gap: spacing.base, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    swatch: { width: 10, height: 10, borderRadius: 3 },
    swatchDone: { backgroundColor: colors.primary },
    swatchPlan: { backgroundColor: colors.borderLight },
    legendText: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
}));
