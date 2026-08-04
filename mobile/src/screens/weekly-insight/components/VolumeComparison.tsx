import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withSpring,
} from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { formatKm } from '../format';

/**
 * PLANEJADO × EXECUTADO — duas barras comparativas.
 *
 * Feito à mão com Reanimated, seguindo `StatsBarChart` do calendário (que traz
 * o comentário "no chart lib — per the design spec"): duas barras não justificam
 * a maquinaria de eixo/grid da lib de chart, e à mão o controle de cor por série
 * fica direto.
 *
 * A escala é COMPARTILHADA entre as duas barras — é o ponto do gráfico. Escalar
 * cada uma pelo próprio valor faria "12 de 30 km" parecer igual a "28 de 30 km".
 */

const BAR_H = 34;
const SPRING = { damping: 16, stiffness: 160 } as const;

interface VolumeComparisonProps {
    plannedKm: number;
    completedKm: number;
    /** Total corrido incluindo corrida livre — mostrado como marca, não somado. */
    totalKm: number;
    freeRunKm: number;
}

const Bar = memo(function Bar({
    ratio,
    color,
    delay,
}: {
    ratio: number;
    color: string;
    delay: number;
}) {
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            progress.value = 1;
            return;
        }
        progress.value = withDelay(delay, withSpring(1, SPRING));
    }, [reduced, delay, progress]);

    const animatedStyle = useAnimatedStyle(() => ({
        width: `${Math.max(ratio, 0.02) * 100 * progress.value}%` as `${number}%`,
    }));

    return (
        <View style={styles.track}>
            <Animated.View
                style={[styles.bar, { backgroundColor: color }, animatedStyle]}
            />
        </View>
    );
});

export const VolumeComparison = memo(function VolumeComparison({
    plannedKm,
    completedKm,
    totalKm,
    freeRunKm,
}: VolumeComparisonProps) {
    // Denominador comum: o maior entre planejado e total corrido. Assim a barra
    // do plano e a do executado são lidas na mesma régua.
    const scale = Math.max(plannedKm, completedKm, 1);

    return (
        <View style={styles.section}>
            <Text style={styles.heading}>Volume da semana</Text>

            <View style={styles.card}>
                <Row
                    label="Prescrito"
                    value={`${formatKm(plannedKm)} km`}
                    ratio={plannedKm / scale}
                    color="rgba(255,255,255,0.16)"
                    delay={0}
                />
                <Row
                    label="Você correu (do plano)"
                    value={`${formatKm(completedKm)} km`}
                    ratio={completedKm / scale}
                    color={colors.primary}
                    delay={90}
                />

                {/*
                  Corrida livre entra como LINHA SEPARADA, nunca somada à barra
                  do plano. É a regra que a Fase 1A estabeleceu: quem corre por
                  fora não infla a própria aderência. Os dois números convivem
                  na tela justamente para o atleta ver a diferença.
                */}
                {freeRunKm > 0 && (
                    <View style={styles.freeRow}>
                        <View style={styles.freeDot} />
                        <Text style={styles.freeText}>
                            + {formatKm(freeRunKm)} km fora do plano
                        </Text>
                        <Text style={styles.freeTotal}>
                            {formatKm(totalKm)} km no total
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
});

function Row({
    label,
    value,
    ratio,
    color,
    delay,
}: {
    label: string;
    value: string;
    ratio: number;
    color: string;
    delay: number;
}) {
    return (
        <View style={styles.row}>
            <View style={styles.rowHead}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
            </View>
            <Bar ratio={ratio} color={color} delay={delay} />
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
        gap: spacing.base,
    },
    row: { gap: 6 },
    rowHead: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    rowLabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    rowValue: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    track: {
        height: BAR_H,
        borderRadius: borderRadius.md,
        backgroundColor: 'rgba(255,255,255,0.04)',
        overflow: 'hidden',
        justifyContent: 'center',
    },
    bar: {
        height: '100%',
        borderRadius: borderRadius.md,
    },
    freeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    freeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.recovery,
    },
    freeText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    freeTotal: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.textLight,
    },
});
