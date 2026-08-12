import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, fonts } from '../../../theme';
import { ADJUSTMENT_SHORT } from '../../../screens/weekly-insight/adjustmentCopy';
import {
    formatWeekRange,
    formatKm,
    formatPercent,
} from '../../../screens/weekly-insight/format';
import type { WeeklyInsight } from '../../../types/weeklyInsight.types';
import { cardStyles } from './cardStyles';

/**
 * O card do INSIGHT SEMANAL dentro do carrossel.
 *
 * Miolo extraído do antigo `WeeklyInsightSheet` sem mudança de conteúdo — o que
 * mudou é só quem o envolve (agora o carrossel, que pode ter mais de um card).
 *
 * ── ONDE MORA A AÇÃO ─────────────────────────────────────────────────────────
 *
 * Aqui NÃO. O botão de adiar/repetir semana vive no `AdjustmentTray`, dentro da
 * `WeeklyInsightScreen`. Este card só carrega o CTA que leva até lá — foi assim
 * desde a 2B, e é o que faz "preservar a ação no carrossel" ser uma questão de
 * preservar o CTA, não de portar a bandeja.
 */
export const WeeklyInsightCardBody = memo(function WeeklyInsightCardBody({
    insight,
    onOpen,
}: {
    insight: WeeklyInsight;
    onOpen: () => void;
}) {
    const adjustment = insight.suggested_adjustment;
    const completed = insight.completed_workouts ?? 0;
    const planned = insight.planned_workouts ?? 0;

    return (
        <View style={cardStyles.body}>
            <View style={cardStyles.headText}>
                <Text style={cardStyles.eyebrow}>
                    Semana {insight.week_number} fechada
                </Text>
                <Text style={cardStyles.range}>
                    {formatWeekRange(insight.week_start, insight.week_end)}
                </Text>
            </View>

            {/* O número-chave: quanto do plano saiu. */}
            <View style={cardStyles.keyRow}>
                <View style={cardStyles.keyBlock}>
                    <Text style={cardStyles.keyValue}>
                        {formatKm(insight.completed_distance_km)}
                        <Text style={cardStyles.keyUnit}> km</Text>
                    </Text>
                    <Text style={cardStyles.keyLabel}>
                        de {formatKm(insight.planned_distance_km)} km do plano
                    </Text>
                </View>
                <View style={cardStyles.keyDivider} />
                <View style={cardStyles.keyBlock}>
                    <Text style={cardStyles.keyValue}>
                        {formatPercent(insight.completion_rate)}
                    </Text>
                    <Text style={cardStyles.keyLabel}>
                        {completed} de {planned} treinos
                    </Text>
                </View>
            </View>

            {!!insight.ai_narrative && (
                <Text style={cardStyles.narrative} numberOfLines={4}>
                    {insight.ai_narrative}
                </Text>
            )}

            {adjustment && adjustment.code !== 'manter' && (
                <View style={styles.hintRow}>
                    <Ionicons
                        name={
                            adjustment.class === 'schedule'
                                ? 'calendar-outline'
                                : 'bulb-outline'
                        }
                        size={15}
                        color={colors.primary}
                    />
                    <Text style={styles.hintText}>
                        {ADJUSTMENT_SHORT[adjustment.code]}
                    </Text>
                </View>
            )}

            <Pressable
                onPress={onOpen}
                style={({ pressed }) => [
                    cardStyles.cta,
                    pressed && cardStyles.ctaPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Ver semana completa"
            >
                <Text style={cardStyles.ctaText}>Ver semana completa</Text>
            </Pressable>
        </View>
    );
});

const styles = StyleSheet.create({
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    hintText: {
        flex: 1,
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
    },
});
