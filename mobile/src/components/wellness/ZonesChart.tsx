import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { ZONE_COLORS, ZONE_LABELS } from '../../theme/zoneColors';
import type { ZonesBlock } from '../../types/wellness.types';

interface ZonesChartProps {
    zones: ZonesBlock;
}

const ZONES: Array<{
    key: 'z1Pct' | 'z2Pct' | 'z3Pct' | 'z4Pct' | 'z5Pct';
    minutesKey: 'z1Minutes' | 'z2Minutes' | 'z3Minutes' | 'z4Minutes' | 'z5Minutes';
    label: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
}> = [
        { key: 'z1Pct', minutesKey: 'z1Minutes', label: 'Z1' },
        { key: 'z2Pct', minutesKey: 'z2Minutes', label: 'Z2' },
        { key: 'z3Pct', minutesKey: 'z3Minutes', label: 'Z3' },
        { key: 'z4Pct', minutesKey: 'z4Minutes', label: 'Z4' },
        { key: 'z5Pct', minutesKey: 'z5Minutes', label: 'Z5' },
    ];

export function ZonesChart({ zones }: ZonesChartProps) {
    if (zones.totalMinutes === 0) {
        return (
            <View style={styles.section}>
                <Text style={styles.heading}>Zonas de Treino</Text>
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Sem treinos esta semana</Text>
                    <Text style={styles.emptyText}>
                        Conclua um treino para ver sua distribuição de zonas.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <Text style={styles.heading}>Zonas de Treino</Text>
            <View style={styles.card}>
                {ZONES.map((z) => (
                    <ZoneRow
                        key={z.key}
                        label={z.label}
                        pct={zones[z.key]}
                        minutes={zones[z.minutesKey]}
                    />
                ))}
            </View>
        </View>
    );
}

function ZoneRow({
    label,
    pct,
    minutes,
}: {
    label: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';
    pct: number;
    minutes: number;
}) {
    const widthAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(widthAnim, {
            toValue: pct,
            duration: 800,
            useNativeDriver: false,
        }).start();
    }, [pct, widthAnim]);

    const color = ZONE_COLORS[label];
    const zoneLabel = ZONE_LABELS[label];

    return (
        <View style={styles.row}>
            <View style={styles.rowLabel}>
                <View style={[styles.zoneDot, { backgroundColor: color }]} />
                <Text style={styles.zoneCode}>{label}</Text>
                <Text style={styles.zoneName}>{zoneLabel}</Text>
            </View>

            <View style={styles.barTrack}>
                <Animated.View
                    style={[
                        styles.barFill,
                        {
                            backgroundColor: color,
                            width: widthAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                            }),
                        },
                    ]}
                />
            </View>

            <Text style={styles.rowValue}>
                {minutes}min · {pct}%
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    row: {
        gap: 6,
    },
    rowLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    zoneDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    zoneCode: {
        fontSize: typography.fontSizes.sm,
        color: colors.text,
        fontWeight: typography.fontWeights.bold,
        letterSpacing: 0.5,
    },
    zoneName: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    barTrack: {
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 5,
    },
    rowValue: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        alignSelf: 'flex-end',
        fontWeight: typography.fontWeights.medium,
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
        fontSize: typography.fontSizes.base,
        color: colors.text,
        fontWeight: typography.fontWeights.semibold,
    },
    emptyText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
