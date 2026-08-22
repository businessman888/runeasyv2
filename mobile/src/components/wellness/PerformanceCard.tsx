import React, { memo } from 'react';
import { View, Text, StyleSheet, type DimensionValue } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import type { IconTone } from '../../theme/iconography';
import { AppIcon } from '../ui/AppIcon';
import { Sparkline } from './Sparkline';

export interface PerformanceCardProps {
    label: string;
    value: string;
    unit?: string;
    deltaPct: number | null;
    sparkline: number[];
    /** If true, lower values are better (e.g. pace). Flips delta color. */
    invertDelta?: boolean;
    /** Accent color used for the sparkline and delta arrow. */
    accentColor?: string;
    /** Largura do card (responsivo). Default '48%' (2 colunas, layout phone). */
    widthPercent?: DimensionValue;
}

/**
 * Strava/Runna-inspired metric card:
 *  - No icon bubble (the label tells the story).
 *  - Big number is the focal point — value dominates the card.
 *  - Sparkline lives at the bottom as a calm horizontal trace.
 *  - Delta is a discreet inline indicator next to the label.
 *  - Subtle border, no decorative gradients.
 */
export const PerformanceCard = memo(function PerformanceCard({
    label,
    value,
    unit,
    deltaPct,
    sparkline,
    invertDelta,
    accentColor = colors.primary,
    widthPercent,
}: PerformanceCardProps) {
    let deltaColor: string = colors.textMuted;
    let deltaArrow: 'arrow-up' | 'arrow-down' | null = null;
    let deltaText = '';
    let deltaTone: IconTone = 'tertiary';
    if (deltaPct !== null && deltaPct !== 0) {
        const isPositive = deltaPct > 0;
        const isGood = invertDelta ? !isPositive : isPositive;
        deltaColor = isGood ? colors.success : colors.error;
        deltaArrow = isPositive ? 'arrow-up' : 'arrow-down';
        deltaText = `${Math.abs(deltaPct).toFixed(0)}%`;
        deltaTone = isGood ? 'success' : 'danger';
    }

    return (
        <View style={[styles.card, widthPercent ? { width: widthPercent } : null]}>
            <View style={styles.topRow}>
                <Text style={styles.label} numberOfLines={1}>
                    {label}
                </Text>
                {deltaArrow && (
                    <View style={styles.deltaBox}>
                        <AppIcon name={deltaArrow === 'arrow-up' ? 'trendUp' : 'trendDown'} size={16} tone={deltaTone} />
                        <Text style={[styles.deltaText, { color: deltaColor }]}>
                            {deltaText}
                        </Text>
                    </View>
                )}
            </View>

            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                {value}
                {unit ? <Text style={styles.unit}>{unit}</Text> : null}
            </Text>

            <View style={styles.sparkRow}>
                <Sparkline data={sparkline} color={accentColor} width={84} height={18} />
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        width: '48%',
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.xl,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.base,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        minHeight: 108,
        justifyContent: 'space-between',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    label: {
        flex: 1,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.semibold,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    deltaBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginLeft: spacing.xs,
    },
    deltaText: {
        fontSize: 10,
        fontWeight: typography.fontWeights.bold,
        letterSpacing: 0.2,
    },
    value: {
        fontSize: 30,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        letterSpacing: -0.5,
        marginTop: spacing.xs,
        lineHeight: 34,
    },
    unit: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
        letterSpacing: 0,
    },
    sparkRow: {
        marginTop: spacing.xs,
        opacity: 0.85,
        alignItems: 'flex-start',
    },
});
