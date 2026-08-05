import React, { memo, useEffect } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedProps,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import { STAGGER_MS } from '../hooks/useEnterAnimation';

/**
 * Número que conta de 0 até o valor final, na UI thread.
 *
 * ── POR QUE UM TextInput ─────────────────────────────────────────────────────
 *
 * Reanimated não consegue escrever no filho de um `<Text>` — `children` não é
 * uma prop animável. `TextInput` tem `value` como prop nativa, então
 * `useAnimatedProps` a atualiza direto no native shadow node, sem um único
 * re-render de React. É o truque padrão; o `editable={false}` +
 * `pointerEvents="none"` o devolvem ao comportamento de texto puro.
 *
 * ── ONDE USAR ────────────────────────────────────────────────────────────────
 *
 * Só nos números-herói. Movimento atrai o olho: se todo número da tela contar,
 * nenhum é destacado — e a tela vira um caça-níqueis.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface CountUpProps {
    value: number;
    /** Casas decimais. `0` (padrão) para contagens, `1` para km. */
    decimals?: number;
    style?: TextStyle | TextStyle[];
    /** Posição na coreografia da tela — mesmo índice da seção que o contém. */
    index?: number;
    duration?: number;
}

export const CountUp = memo(function CountUp({
    value,
    decimals = 0,
    style,
    index = 0,
    duration = 900,
}: CountUpProps) {
    const reduced = useReducedMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (reduced) {
            progress.value = 1;
            return;
        }
        progress.value = 0;
        progress.value = withDelay(
            index * STAGGER_MS,
            withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
        );
    }, [value, index, duration, reduced, progress]);

    const animatedProps = useAnimatedProps(() => {
        const current = value * progress.value;
        // Vírgula decimal: a tela é pt-BR e "12.4 km" destoaria do resto.
        const text = current.toFixed(decimals).replace('.', ',');
        return { text, defaultValue: text };
    });

    return (
        <AnimatedTextInput
            animatedProps={animatedProps}
            editable={false}
            pointerEvents="none"
            // Sem isto o TextInput herda paddings de plataforma e o número
            // desalinha do rótulo ao lado.
            style={[styles.reset, style]}
            // O leitor de tela recebe o valor final, não a contagem.
            accessibilityLabel={value.toFixed(decimals).replace('.', ',')}
            underlineColorAndroid="transparent"
        />
    );
});

const styles = StyleSheet.create({
    reset: {
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
});
