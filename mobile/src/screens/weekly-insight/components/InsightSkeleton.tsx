import React, { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius } from '../../../theme';

/**
 * Esqueleto de carregamento — a tela mantém a FORMA enquanto o dado chega.
 *
 * Um spinner centralizado (o que havia antes) apaga o layout e depois o
 * reconstrói de uma vez, o que lê como um salto. O esqueleto preserva a
 * silhueta — herói, gráfico, cards — então a chegada do dado é uma troca de
 * conteúdo, não uma remontagem.
 *
 * O pulso é a única animação em loop da tela, e é aceitável porque comunica
 * "ainda carregando". Ele termina quando o dado chega — nada aqui fica em loop
 * depois que a tela assenta.
 */

const PULSE_MS = 900;

export const InsightSkeleton = memo(function InsightSkeleton() {
    const reduced = useReducedMotion();
    const pulse = useSharedValue(0.5);

    useEffect(() => {
        if (reduced) {
            pulse.value = 0.5;
            return;
        }
        pulse.value = withRepeat(
            withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
            -1,
            true,
        );
    }, [reduced, pulse]);

    const shimmer = useAnimatedStyle(() => ({ opacity: pulse.value * 0.5 + 0.25 }));

    return (
        <View style={styles.wrap} accessibilityLabel="Carregando insight semanal">
            {/* Callout do coach */}
            <Animated.View style={[styles.block, styles.coach, shimmer]} />

            {/* Linha de 3 stats */}
            <Animated.View style={[styles.block, styles.stats, shimmer]} />

            {/* Gráfico de trajetória */}
            <View style={styles.section}>
                <Animated.View style={[styles.block, styles.heading, shimmer]} />
                <Animated.View style={[styles.block, styles.chart, shimmer]} />
            </View>

            {/* Dois cards de detalhe */}
            <View style={styles.section}>
                <Animated.View style={[styles.block, styles.heading, shimmer]} />
                <Animated.View style={[styles.block, styles.card, shimmer]} />
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    wrap: {
        paddingHorizontal: spacing.base,
        gap: spacing.xl,
    },
    section: { gap: spacing.md },
    block: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
    },
    coach: { height: 104 },
    stats: { height: 88 },
    heading: {
        height: 20,
        width: '48%',
        borderRadius: borderRadius.sm,
    },
    chart: { height: 210 },
    card: { height: 140 },
});
