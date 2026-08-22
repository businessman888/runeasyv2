import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import type { AppIconName, IconTone } from '../../theme/iconography';
import { AppIcon } from '../ui/AppIcon';
import { useHealthKitStore } from '../../stores/healthKitStore';
import type { HealthBlock } from '../../types/wellness.types';

interface HealthSectionProps {
    health: HealthBlock;
}

function classifyResting(hr: number | null): { label: string; color: string; tone: IconTone } | null {
    if (hr === null) return null;
    if (hr < 60) return { label: 'Excelente', color: colors.success, tone: 'success' };
    if (hr < 70) return { label: 'Bom', color: semanticColors.accent, tone: 'accent' };
    return { label: 'Regular', color: colors.warning, tone: 'warning' };
}

export function HealthSection({ health }: HealthSectionProps) {
    const isIOS = Platform.OS === 'ios';
    const hkConnected = useHealthKitStore((s) => s.isConnected);
    const hkConnect = useHealthKitStore((s) => s.connect);
    const hkIsConnecting = useHealthKitStore((s) => s.isConnecting);
    const connected = isIOS && hkConnected && health.isConnected;

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={styles.heading}>Saúde</Text>
                {connected && (
                    <View style={styles.deviceTag}>
                        <AppIcon name="wearable" size={16} tone="accent" />
                        <Text style={styles.deviceTagText}>
                            {health.deviceName ?? 'via Apple Health'}
                        </Text>
                    </View>
                )}
            </View>

            {!isIOS ? (
                <AndroidSoonCard />
            ) : !connected ? (
                <ConnectCard onConnect={hkConnect} loading={hkIsConnecting} />
            ) : (
                <ConnectedGrid health={health} />
            )}
        </View>
    );
}

function ConnectedGrid({ health }: { health: HealthBlock }) {
    const restingClass = classifyResting(health.restingHr);

    return (
        <View style={styles.grid}>
            <HealthCard
                icon="heartRate"
                iconTone={restingClass?.tone ?? 'tertiary'}
                label="FC repouso"
                value={health.restingHr !== null ? String(health.restingHr) : '--'}
                unit={health.restingHr !== null ? 'bpm' : undefined}
                accent={restingClass?.color ?? colors.textMuted}
                badge={restingClass?.label}
            />
            <HealthCard
                icon="heartRate"
                iconTone="accent"
                label="FC média 7d"
                value={health.avgHr7d !== null ? String(health.avgHr7d) : '--'}
                unit={health.avgHr7d !== null ? 'bpm' : undefined}
                accent={colors.primary}
            />
            <HealthCard
                icon="trainingLoad"
                iconTone="warning"
                label="FC máxima 7d"
                value={health.maxHr7d !== null ? String(health.maxHr7d) : '--'}
                unit={health.maxHr7d !== null ? 'bpm' : undefined}
                accent={colors.warning}
            />
            <HealthCard
                icon="flame"
                iconTone="secondary"
                label="Calorias 7d"
                value={
                    health.calories7d !== null
                        ? health.calories7d.toLocaleString('pt-BR')
                        : '--'
                }
                unit={health.calories7d !== null ? 'cal' : undefined}
                accent={colors.accent}
            />
        </View>
    );
}

function HealthCard({
    icon,
    label,
    iconTone,
    value,
    unit,
    accent,
    badge,
}: {
    icon: AppIconName;
    label: string;
    iconTone: IconTone;
    value: string;
    unit?: string;
    accent: string;
    badge?: string;
}) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: `${accent}1A` }]}>
                    <AppIcon name={icon} size={16} tone={iconTone} />
                </View>
                <Text style={styles.cardLabel}>{label}</Text>
            </View>
            <Text style={styles.cardValue}>
                {value}
                {unit ? <Text style={styles.cardUnit}> {unit}</Text> : null}
            </Text>
            {badge && (
                <View style={[styles.cardBadge, { backgroundColor: `${accent}1A`, borderColor: `${accent}55` }]}>
                    <Text style={[styles.cardBadgeText, { color: accent }]}>{badge}</Text>
                </View>
            )}
        </View>
    );
}

function ConnectCard({
    onConnect,
    loading,
}: {
    onConnect: () => Promise<unknown>;
    loading: boolean;
}) {
    return (
        <Pressable
            onPress={() => onConnect()}
            disabled={loading}
            style={styles.ctaCard}
            accessibilityRole="button"
            accessibilityLabel="Conectar HealthKit"
        >
            <View style={styles.ctaIcon}>
                <AppIcon name="heartRate" size={28} tone="accent" />
            </View>
            <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>
                    Conecte seu relógio
                </Text>
                <Text style={styles.ctaSubtitle}>
                    Apple Watch, Garmin, Polar, Fitbit — tudo via Apple Health.
                </Text>
            </View>
            <View style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>
                    {loading ? 'Conectando...' : 'Conectar'}
                </Text>
                <AppIcon name="chevronForward" size={16} tone="onAccent" />
            </View>
        </Pressable>
    );
}

function AndroidSoonCard() {
    return (
        <View style={styles.soonCard}>
            <View style={styles.soonHeader}>
                <View style={styles.soonIcon}>
                    <AppIcon name="wearable" size={24} tone="secondary" />
                </View>
                <View style={styles.soonBadge}>
                    <Text style={styles.soonBadgeText}>Em breve no Android</Text>
                </View>
            </View>
            <Text style={styles.soonTitle}>
                Métricas de saúde do seu relógio
            </Text>
            <Text style={styles.soonSubtitle}>
                Integração com Google Fit e Health Connect chegando em breve para
                trazer FC, calorias e mais.
            </Text>
            <View style={styles.soonDeviceRow}>
                {(['wearable', 'workout', 'heartRate'] as const).map((name) => (
                    <View key={name} style={styles.soonDeviceIcon}>
                        <AppIcon name={name} size={16} tone="secondary" />
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    deviceTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.accentSubtle,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    deviceTagText: {
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    card: {
        width: '48%',
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        gap: spacing.xs,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    cardIcon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    cardValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    cardUnit: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    cardBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    cardBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
    },
    ctaCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    ctaIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.accentSubtle,
    },
    ctaContent: {
        flex: 1,
        gap: 2,
    },
    ctaTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    ctaSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.accent,
    },
    ctaButtonText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold,
        color: semanticColors.textOnAccent,
    },
    soonCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        gap: spacing.sm,
    },
    soonHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    soonIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.glass,
    },
    soonBadge: {
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    soonBadgeText: {
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
        letterSpacing: 0.3,
    },
    soonTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    soonSubtitle: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        lineHeight: typography.fontSizes.sm * typography.lineHeights.relaxed,
    },
    soonDeviceRow: {
        flexDirection: 'row',
        gap: spacing.xs,
        marginTop: spacing.xs,
    },
    soonDeviceIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
});
