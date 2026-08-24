import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../../theme';
import { SectionHeader } from './SectionHeader';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { formatKm } from '../format';
import { semanticColors } from "../../../theme/semanticColors";

/**
 * PRESCRITO × EXECUTADO — uma barra sobre o trilho do prescrito.
 *
 * ── POR QUE UMA BARRA, E NÃO DUAS ────────────────────────────────────────────
 *
 * A versão anterior desenhava duas barras empilhadas, e o leitor tinha que
 * comparar dois comprimentos separados. Sobrepondo o executado no trilho do
 * prescrito, a LACUNA vira a informação — o quanto falta é literalmente o
 * espaço vazio à direita. Não há matemática a fazer.
 *
 * ── A CORRIDA LIVRE FICA FORA DA BARRA ───────────────────────────────────────
 *
 * Ela entra numa linha separada, nunca somada ao trilho do plano. É a regra da
 * Fase 1A: quem corre por fora não infla a própria aderência. Os dois números
 * convivem na tela justamente para o atleta ver a diferença.
 */

interface VolumeComparisonProps {
    plannedKm: number;
    completedKm: number;
    totalKm: number;
    freeRunKm: number;
    /** Σ executado ÷ Σ prescrito SÓ dos treinos concluídos. */
    executionRatio: number | null;
    index?: number;
}

export const VolumeComparison = memo(function VolumeComparison({
    plannedKm,
    completedKm,
    totalKm,
    freeRunKm,
    executionRatio,
    index = 3,
}: VolumeComparisonProps) {
    useThemeSubscription();
    const progress = useEnterAnimation(index);

    const ratio = plannedKm > 0 ? Math.min(completedKm / plannedKm, 1) : 0;
    const overshoot = plannedKm > 0 && completedKm > plannedKm;

    const containerStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    const fillStyle = useAnimatedStyle(() => ({
        width: `${Math.max(ratio, 0.015) * 100 * progress.value}%` as `${number}%`,
    }));

    return (
        <View style={styles.section}>
            <SectionHeader
                eyebrow="Aderência"
                title="Prescrito × executado"
                note={`${formatKm(plannedKm)} km previstos`}
            />

            <Animated.View style={[styles.card, containerStyle]}>
                <View style={styles.numbers}>
                    <Text style={styles.big}>
                        {formatKm(completedKm)}
                        <Text style={styles.bigUnit}> km</Text>
                    </Text>
                    <Text style={styles.of}>de {formatKm(plannedKm)} km</Text>
                </View>

                <View style={styles.track}>
                    <Animated.View style={[styles.fillWrap, fillStyle]}>
                        <LinearGradient
                            colors={['rgba(0,212,255,0.75)', colors.primary]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.fill}
                        />
                    </Animated.View>
                </View>

                {overshoot && (
                    <Text style={styles.overshoot}>
                        Você passou do prescrito nesta semana.
                    </Text>
                )}

                {executionRatio != null && executionRatio > 0 && (
                    <Text style={styles.footnote}>
                        Nos treinos que fez, cumpriu{' '}
                        <Text style={styles.footnoteStrong}>
                            {Math.round(executionRatio)}%
                        </Text>{' '}
                        da distância prescrita.
                    </Text>
                )}

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
            </Animated.View>
        </View>
    );
});

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
    numbers: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    big: {
        fontFamily: fonts.extrabold,
        fontSize: 30,
        lineHeight: 34,
        color: colors.primary,
        letterSpacing: -0.6,
    },
    bigUnit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
    },
    of: {
        flex: 1,
        textAlign: 'right',
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textMuted,
    },
    track: {
        height: 12,
        borderRadius: 6,
        backgroundColor: semanticColors.fillSubtle,
        overflow: 'hidden',
    },
    fillWrap: { height: '100%', borderRadius: 6, overflow: 'hidden' },
    fill: { flex: 1 },
    overshoot: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.success,
    },
    footnote: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        lineHeight: 17,
        color: colors.textSecondary,
    },
    footnoteStrong: { fontFamily: fonts.bold, color: colors.textLight },
    freeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    freeDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: colors.recovery,
    },
    freeText: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    freeTotal: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.textLight,
    },
}));
