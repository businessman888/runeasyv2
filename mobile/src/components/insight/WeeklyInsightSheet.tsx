import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, fonts } from '../../theme';
import { ADJUSTMENT_SHORT } from '../../screens/weekly-insight/adjustmentCopy';
import {
    formatWeekRange,
    formatKm,
    formatPercent,
} from '../../screens/weekly-insight/format';
import type { WeeklyInsight } from '../../types/weeklyInsight.types';

/**
 * MODAL DE ENTRADA — dispara na abertura do app quando há insight não visto.
 *
 * Segue o padrão de bottom sheet do app (`RaceDetailSheet`, `ValueInputSheet`):
 * `Modal transparent animationType="slide"` + backdrop tocável + folha
 * ancorada embaixo. Não há lib de bottom sheet no projeto, e introduzir uma só
 * para esta tela seria inconsistente com as cinco folhas que já existem.
 *
 * ── O QUE ELE MOSTRA, E O QUE NÃO ────────────────────────────────────────────
 *
 * Um resumo enxuto: o número-chave da semana e a frase do coach. NÃO é a tela
 * inteira em miniatura — se coubesse tudo aqui, a tela não precisaria existir.
 * O trabalho do modal é dizer "tem coisa nova e vale olhar", não entregar a
 * análise.
 *
 * ── FECHAR NÃO PERDE ─────────────────────────────────────────────────────────
 *
 * Fechar pelo X ou pelo backdrop apenas dispensa o modal NESTA sessão; não
 * carimba `seen_at`. O insight continua no card persistente da home e do
 * calendário — essa é a rede de segurança de quem fechou sem ler. Só abrir a
 * tela marca como visto.
 */

interface WeeklyInsightSheetProps {
    insight: WeeklyInsight | null;
    visible: boolean;
    onClose: () => void;
    onOpen: () => void;
}

export const WeeklyInsightSheet = memo(function WeeklyInsightSheet({
    insight,
    visible,
    onClose,
    onOpen,
}: WeeklyInsightSheetProps) {
    const insets = useSafeAreaInsets();

    const handleOpen = useCallback(() => {
        onOpen();
    }, [onOpen]);

    if (!insight) return null;

    const adjustment = insight.suggested_adjustment;
    const completed = insight.completed_workouts ?? 0;
    const planned = insight.planned_workouts ?? 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable
                style={styles.backdrop}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
            />

            <View
                style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            >
                <View style={styles.grabber} />

                <View style={styles.head}>
                    <View style={styles.headText}>
                        <Text style={styles.eyebrow}>Semana {insight.week_number} fechada</Text>
                        <Text style={styles.range}>
                            {formatWeekRange(insight.week_start, insight.week_end)}
                        </Text>
                    </View>
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        style={styles.closeBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Fechar"
                        accessibilityHint="O resumo continua disponível no card da tela inicial"
                    >
                        <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </Pressable>
                </View>

                {/* O número-chave: quanto do plano saiu. */}
                <View style={styles.keyRow}>
                    <View style={styles.keyBlock}>
                        <Text style={styles.keyValue}>
                            {formatKm(insight.completed_distance_km)}
                            <Text style={styles.keyUnit}> km</Text>
                        </Text>
                        <Text style={styles.keyLabel}>
                            de {formatKm(insight.planned_distance_km)} km do plano
                        </Text>
                    </View>
                    <View style={styles.keyDivider} />
                    <View style={styles.keyBlock}>
                        <Text style={styles.keyValue}>
                            {formatPercent(insight.completion_rate)}
                        </Text>
                        <Text style={styles.keyLabel}>
                            {completed} de {planned} treinos
                        </Text>
                    </View>
                </View>

                {!!insight.ai_narrative && (
                    <Text style={styles.narrative} numberOfLines={4}>
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
                    onPress={handleOpen}
                    style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Ver semana completa"
                >
                    <Text style={styles.ctaText}>Ver semana completa</Text>
                </Pressable>
            </View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.cardDark,
        borderTopLeftRadius: borderRadius['2xl'],
        borderTopRightRadius: borderRadius['2xl'],
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        gap: spacing.base,
    },
    grabber: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)',
        marginBottom: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start' },
    headText: { flex: 1 },
    eyebrow: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xl,
        color: colors.text,
    },
    range: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.base,
    },
    keyBlock: { flex: 1, alignItems: 'center', gap: 2 },
    keyValue: {
        fontFamily: fonts.extrabold,
        fontSize: 30,
        lineHeight: 34,
        color: colors.text,
        letterSpacing: -0.6,
    },
    keyUnit: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
    },
    keyLabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
        textAlign: 'center',
    },
    keyDivider: {
        width: StyleSheet.hairlineWidth,
        alignSelf: 'stretch',
        backgroundColor: colors.border,
        marginVertical: spacing.xs,
    },
    narrative: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        lineHeight: 21,
        color: colors.textLight,
    },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    hintText: {
        flex: 1,
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
    },
    cta: {
        height: 54,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    ctaText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: '#0F0F1E',
    },
});
