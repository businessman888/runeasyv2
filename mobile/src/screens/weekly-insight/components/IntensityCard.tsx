import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { colors, typography, spacing, borderRadius, fonts, createThemeStyles, useThemeSubscription } from '../../../theme';
import { ZONE_COLORS } from '../../../theme/zoneColors';
import { SectionHeader } from './SectionHeader';
import { useEnterAnimation } from '../hooks/useEnterAnimation';
import { formatPace, describeIntensityDelta } from '../format';
import type { IntensityBucket, Zone } from '../../../types/weeklyInsight.types';

/**
 * ADERÊNCIA DE INTENSIDADE — prescrito × executado, por zona.
 *
 * O insight de maior valor da tela, e o que motiva o cue central da bandeja
 * ("segure o ritmo nos dias fáceis"). Compara o pace ESPERADO (ponderado pelos
 * segmentos de `instructions_json`) com o pace real da sessão.
 *
 * `avgDeltaSec` NEGATIVO = correu mais rápido que o alvo. Em Z1/Z2 isso é o erro
 * clássico de quem está começando; em Z4/Z5 é o objetivo do treino. Por isso o
 * destaque de alerta só aparece nas zonas fáceis — sinalizar "rápido demais" num
 * intervalado seria repreender a pessoa por executar bem.
 */

const EASY_ZONES: Zone[] = ['Z1', 'Z2'];
const ZONE_ORDER: Zone[] = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
/** Mesma tolerância do backend (`EASY_PACE_TOLERANCE_SEC`). */
const TOLERANCE_SEC = 15;

interface IntensityCardProps {
    intensity: Partial<Record<Zone, IntensityBucket>>;
    index?: number;
}

export const IntensityCard = memo(function IntensityCard({
    intensity,
    index = 4,
}: IntensityCardProps) {
    useThemeSubscription();
    const progress = useEnterAnimation(index);
    const zones = ZONE_ORDER.filter((z) => (intensity?.[z]?.n ?? 0) > 0);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ translateY: (1 - progress.value) * 12 }],
    }));

    if (zones.length === 0) {
        return (
            <View style={styles.section}>
                <SectionHeader eyebrow="Ritmo" title="Alvo × executado" />
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Sem comparação disponível</Text>
                    <Text style={styles.emptyText}>
                        Nenhum treino concluído desta semana tinha pace prescrito e
                        pace medido ao mesmo tempo.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <SectionHeader eyebrow="Ritmo" title="Alvo × executado" note="min/km" />

            <Animated.View style={[styles.card, containerStyle]}>
                {zones.map((z) => {
                    const b = intensity[z]!;
                    const isEasy = EASY_ZONES.includes(z);
                    const tooFast = isEasy && b.avgDeltaSec <= -TOLERANCE_SEC;

                    return (
                        <View key={z} style={styles.row}>
                            <View style={styles.rowHead}>
                                <View
                                    style={[
                                        styles.dot,
                                        { backgroundColor: ZONE_COLORS[z] },
                                    ]}
                                />
                                <Text style={styles.zoneCode}>{z}</Text>
                                <Text style={styles.count}>
                                    {b.n} {b.n === 1 ? 'treino' : 'treinos'}
                                </Text>
                                {tooFast && (
                                    <View style={styles.flag}>
                                        <Ionicons
                                            name="flash"
                                            size={11}
                                            color={colors.warning}
                                        />
                                        <Text style={styles.flagText}>
                                            rápido demais
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.paces}>
                                <PaceCell
                                    label="alvo"
                                    value={formatPace(b.avgExpectedSec)}
                                    muted
                                />
                                <Ionicons
                                    name="arrow-forward"
                                    size={14}
                                    color={colors.textMuted}
                                />
                                <PaceCell
                                    label="você"
                                    value={formatPace(b.avgActualSec)}
                                    accent={tooFast ? colors.warning : colors.text}
                                />
                                <Text
                                    style={[
                                        styles.delta,
                                        tooFast && { color: colors.warning },
                                    ]}
                                >
                                    {describeIntensityDelta(b.avgDeltaSec)}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </Animated.View>
        </View>
    );
});

function PaceCell({
    label,
    value,
    muted,
    accent,
}: {
    label: string;
    value: string;
    muted?: boolean;
    accent?: string;
}) {
    useThemeSubscription();
    return (
        <View style={styles.paceCell}>
            <Text style={styles.paceLabel}>{label}</Text>
            <Text
                style={[
                    styles.paceValue,
                    muted && { color: colors.textSecondary },
                    accent ? { color: accent } : null,
                ]}
            >
                {value}
            </Text>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    section: { gap: spacing.md },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.base,
    },
    row: { gap: 8 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    dot: { width: 8, height: 8, borderRadius: 4 },
    zoneCode: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.sm,
        color: colors.text,
        letterSpacing: 0.5,
    },
    count: {
        flex: 1,
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textMuted,
    },
    flag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: borderRadius.full,
        backgroundColor: 'rgba(255,196,0,0.12)',
    },
    flagText: {
        fontFamily: fonts.semibold,
        fontSize: 10,
        color: colors.warning,
    },
    paces: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    paceCell: { gap: 1 },
    paceLabel: {
        fontFamily: fonts.medium,
        fontSize: 10,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    paceValue: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    delta: {
        flex: 1,
        textAlign: 'right',
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        paddingBottom: 3,
    },
    emptyCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        gap: spacing.xs,
    },
    emptyTitle: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.base,
        color: colors.text,
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
}));
