import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, fonts } from '../../theme';
import { formatKm } from '../../screens/weekly-insight/format';
import { PHASE_LABELS, type MesoInsight } from '../../types/mesoInsight.types';

/**
 * CARD PERSISTENTE DO BLOCO — a rede de segurança de quem fechou a folha.
 *
 * Espelha o `WeeklyInsightCard`, e pela mesma razão: sem ele, dispensar o
 * carrossel tornaria o bloco inalcançável até o próximo — quatro semanas de
 * espera por um resumo que já existe. O push seria a única outra porta.
 *
 * NÃO depende de `seen_at`: some só quando o bloco seguinte o substitui. Se
 * dependesse, quem fechou a folha perderia o capítulo inteiro.
 *
 * Compacto de propósito — é uma porta, não um resumo: o rótulo do bloco, o km
 * corrido e a fase. O arco e os detalhes moram na tela.
 */

interface MesoInsightCardProps {
    insight: MesoInsight;
    onPress: () => void;
    /** `true` quando ainda não foi aberto — ganha o ponto de "novo". */
    unread?: boolean;
    style?: object;
}

export const MesoInsightCard = memo(function MesoInsightCard({
    insight,
    onPress,
    unread,
    style,
}: MesoInsightCardProps) {
    const fase = PHASE_LABELS[insight.dominant_phase] ?? insight.dominant_phase;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
            accessibilityRole="button"
            accessibilityLabel={`Bloco ${insight.block_index}, ${fase}`}
            accessibilityHint="Abre o resumo das quatro semanas do bloco"
        >
            <View style={styles.icon}>
                <Ionicons name="layers-outline" size={18} color={colors.primary} />
                {unread && <View style={styles.dot} />}
            </View>

            <View style={styles.body}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>
                        Bloco {insight.block_index} · {fase}
                    </Text>
                    <Text style={styles.range}>
                        S{insight.week_start}–{insight.week_end}
                    </Text>
                </View>
                <Text style={styles.stats}>
                    {formatKm(insight.completed_distance_km)} km em{' '}
                    {insight.completed_workouts ?? 0} treinos · quatro semanas
                </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
    );
});

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.base,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
        paddingHorizontal: spacing.base,
    },
    pressed: { opacity: 0.85 },

    icon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 212, 255, 0.10)',
    },
    // O ponto de "novo" acompanha o ícone, não a cor do texto: estado nunca é
    // comunicado só por cor (regra de acessibilidade da HIG).
    dot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.card,
    },

    body: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    title: {
        flexShrink: 1,
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
        color: colors.text,
    },
    range: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    stats: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
});
