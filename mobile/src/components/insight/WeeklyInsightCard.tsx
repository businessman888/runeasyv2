import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { ADJUSTMENT_SHORT } from '../../screens/weekly-insight/adjustmentCopy';
import {
    formatKm,
    formatWeekRange,
} from '../../screens/weekly-insight/format';
import type { WeeklyInsight } from '../../types/weeklyInsight.types';

/**
 * CARD PERSISTENTE — a rede de segurança de quem fechou o modal sem abrir.
 *
 * Aparece na home e no calendário enquanto houver um insight concluído. NÃO
 * depende de `seen_at`: some só quando a semana seguinte substitui o insight.
 * Se dependesse, quem fechou o modal perderia o resumo da semana inteira.
 *
 * Compacto de propósito — é uma porta, não um resumo. Um número, o estado da
 * semana e a sugestão em uma linha.
 *
 * O card INTEIRO é o alvo de toque (bem acima dos 44pt), com o chevron como
 * affordance de navegação. A cor de acento fica só no ícone e no texto da
 * sugestão; o card em si usa a moldura neutra do sistema, como os outros cards
 * de conteúdo da home.
 */

interface WeeklyInsightCardProps {
    insight: WeeklyInsight;
    onPress: () => void;
    /** `true` quando ainda não foi aberto — ganha o ponto de "novo". */
    unread?: boolean;
    style?: object;
}

export const WeeklyInsightCard = memo(function WeeklyInsightCard({
    insight,
    onPress,
    unread,
    style,
}: WeeklyInsightCardProps) {
    useThemeSubscription();
    const adjustment = insight.suggested_adjustment;
    const completed = insight.completed_workouts ?? 0;
    const planned = insight.planned_workouts ?? 0;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
                style,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Insight da semana ${insight.week_number}`}
            accessibilityHint="Abre o resumo completo da semana"
        >
            <View style={styles.iconWrap}>
                <Ionicons name="stats-chart" size={20} color={colors.primary} />
                {unread && <View style={styles.dot} />}
            </View>

            <View style={styles.body}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Semana {insight.week_number}</Text>
                    <Text style={styles.range}>
                        {formatWeekRange(insight.week_start, insight.week_end)}
                    </Text>
                </View>

                <Text style={styles.summary} numberOfLines={1}>
                    {formatKm(insight.completed_distance_km)} km do plano ·{' '}
                    {completed}/{planned} treinos
                </Text>

                {adjustment && (
                    <Text style={styles.hint} numberOfLines={1}>
                        {ADJUSTMENT_SHORT[adjustment.code]}
                    </Text>
                )}
            </View>

            <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
            />
        </Pressable>
    );
});

const styles = createThemeStyles(() => ({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.base,
        minHeight: 76,
    },
    cardPressed: { opacity: 0.85 },
    iconWrap: {
        width: 42,
        height: 42,
        borderRadius: borderRadius.lg,
        backgroundColor: 'rgba(0,212,255,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        borderWidth: 1.5,
        borderColor: colors.card,
    },
    body: { flex: 1, gap: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    title: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.base,
        color: colors.text,
    },
    range: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    summary: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    hint: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
    },
}));
