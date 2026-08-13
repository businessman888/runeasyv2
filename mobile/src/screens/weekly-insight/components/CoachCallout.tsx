import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, borderRadius, fonts } from '../../../theme';
import { useEnterAnimation } from '../hooks/useEnterAnimation';

/**
 * A VOZ DO COACH COMO FIO CONDUTOR — callout, não parágrafo.
 *
 * O Haiku escreve 2-3 frases. Na largura de um celular isso vira um muro logo no
 * topo, e o leitor pula. Aqui só a PRIMEIRA frase aparece, em destaque; o resto
 * expande no toque.
 *
 * O corte é heurístico (primeiro `.` seguido de espaço), e é aceitável porque o
 * prompt já instrui frases curtas e diretas. Nada de texto se perde — só deixa
 * de competir pela atenção que os números precisam.
 *
 * Visualmente é o topo da hierarquia: gradiente ciano sutil e a única borda de
 * acento acima da bandeja. Isso o torna o ponto de entrada do olho.
 */

interface CoachCalloutProps {
    narrative: string;
    index?: number;
    /**
     * `false` segura a animacao de entrada. Existe porque a
     * `MesoInsightScreen` monta o dashboard fora da tela e so o traz depois:
     * sem isto a coreografia rodava no vazio e o usuario chegava num painel ja
     * montado. Default `true` -- a tela semanal nao sente diferenca.
     */
    enabled?: boolean;
}

/** Divide em "primeira frase" e "resto". Sem ponto final, tudo é headline. */
export function splitNarrative(text: string): { lead: string; rest: string } {
    const trimmed = text.trim();
    // Procura o primeiro terminador seguido de espaço — evita cortar em "5.5 km"
    // ou numa abreviação colada.
    const match = trimmed.match(/^(.+?[.!?])\s+(.*)$/s);
    if (!match) return { lead: trimmed, rest: '' };
    return { lead: match[1].trim(), rest: match[2].trim() };
}

export const CoachCallout = memo(function CoachCallout({
    narrative,
    index = 0,
    enabled = true,
}: CoachCalloutProps) {
    const [expanded, setExpanded] = useState(false);
    const progress = useEnterAnimation(index, enabled);

    const { lead, rest } = useMemo(() => splitNarrative(narrative), [narrative]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    const toggle = useCallback(() => setExpanded((v) => !v), []);
    const hasRest = rest.length > 0;

    return (
        <Animated.View style={animatedStyle}>
            <LinearGradient
                colors={['rgba(0,212,255,0.13)', 'rgba(0,212,255,0.03)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                <View style={styles.head}>
                    <View style={styles.iconWrap}>
                        <Ionicons name="sparkles" size={14} color={colors.primary} />
                    </View>
                    <Text style={styles.eyebrow}>Leitura do coach</Text>
                </View>

                <Text style={styles.lead}>{lead}</Text>

                {expanded && hasRest && (
                    <Animated.Text entering={FadeIn.duration(220)} style={styles.rest}>
                        {rest}
                    </Animated.Text>
                )}

                {hasRest && (
                    <Pressable
                        onPress={toggle}
                        hitSlop={10}
                        style={styles.moreBtn}
                        accessibilityRole="button"
                        accessibilityLabel={expanded ? 'Ver menos' : 'Ver mais'}
                        accessibilityState={{ expanded }}
                    >
                        <Text style={styles.moreText}>
                            {expanded ? 'Ver menos' : 'Ver mais'}
                        </Text>
                        <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={13}
                            color={colors.primary}
                        />
                    </Pressable>
                )}
            </LinearGradient>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: {
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.22)',
        padding: spacing.lg,
        gap: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    iconWrap: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,212,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        letterSpacing: 0.9,
        textTransform: 'uppercase',
    },
    lead: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.lg,
        lineHeight: 25,
        color: colors.text,
    },
    rest: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        lineHeight: 21,
        color: colors.textSecondary,
    },
    moreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        // Alvo de toque confortável sem inflar o card visualmente.
        paddingVertical: 6,
        minHeight: 32,
    },
    moreText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
    },
});
