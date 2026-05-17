import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Sparkline } from './Sparkline';

export interface PerformanceCardProps {
    label: string;
    value: string;
    unit?: string;
    deltaPct: number | null;
    sparkline: number[];
    /** If true, lower values are better (e.g. pace). Flips delta color. */
    invertDelta?: boolean;
    iconName: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
}

export const PerformanceCard = memo(function PerformanceCard({
    label,
    value,
    unit,
    deltaPct,
    sparkline,
    invertDelta,
    iconName,
    iconColor = colors.primary,
}: PerformanceCardProps) {
    let deltaColor = colors.textMuted;
    let deltaArrow: 'arrow-up' | 'arrow-down' | 'remove' = 'remove';
    let deltaText = '—';
    if (deltaPct !== null) {
        const isPositive = deltaPct > 0;
        const isNegative = deltaPct < 0;
        const isGood = invertDelta ? isNegative : isPositive;
        const isBad = invertDelta ? isPositive : isNegative;
        if (isGood) {
            deltaColor = colors.success;
            deltaArrow = invertDelta ? 'arrow-down' : 'arrow-up';
        } else if (isBad) {
            deltaColor = colors.error;
            deltaArrow = invertDelta ? 'arrow-up' : 'arrow-down';
        }
        deltaText = `${Math.abs(deltaPct).toFixed(1)}%`;
    }

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={[styles.iconBubble, { backgroundColor: `${iconColor}1A` }]}>
                    <Ionicons name={iconName} size={14} color={iconColor} />
                </View>
                <Text style={styles.label} numberOfLines={1}>
                    {label}
                </Text>
            </View>

            <View style={styles.valueRow}>
                <Text style={styles.value} numberOfLines={1}>
                    {value}
                    {unit ? <Text style={styles.unit}> {unit}</Text> : null}
                </Text>
            </View>

            <View style={styles.footer}>
                <View style={styles.deltaBox}>
                    {deltaPct !== null && (
                        <Ionicons name={deltaArrow} size={11} color={deltaColor} />
                    )}
                    <Text style={[styles.deltaText, { color: deltaColor }]}>
                        {deltaText}
                    </Text>
                </View>
                <Sparkline data={sparkline} color={iconColor} width={56} height={20} />
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    card: {
        width: '48%',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    iconBubble: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        flex: 1,
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    valueRow: {
        marginTop: 2,
    },
    value: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: typography.fontSizes['2xl'] * 1.1,
    },
    unit: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
    },
    deltaBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    deltaText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
    },
});
