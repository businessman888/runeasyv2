import React, { useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, typography, spacing, borderRadius } from '../../theme';
import { useWellnessStore } from '../../stores/wellnessStore';
import { Skeleton, SkeletonText } from '../Skeleton';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

function formatDuration(sec: number | null): string {
    if (!sec || sec <= 0) return '--';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h${rem}`;
}

export function OverviewSection() {
    const navigation = useNavigation<Nav>();
    const summary = useWellnessStore((s) => s.summary);
    const loading = useWellnessStore((s) => s.loading);
    const fetchSummary = useWellnessStore((s) => s.fetchSummary);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const goToWellness = useCallback(() => {
        navigation.navigate('Wellness');
    }, [navigation]);

    if (!summary && loading) {
        return <OverviewSkeleton />;
    }

    if (!summary) {
        return null;
    }

    const { overview, performance } = summary;
    const hasAnyActivity = performance.distance.value > 0 || performance.frequency.value > 0;

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={styles.heading}>Overview</Text>
                <TouchableOpacity
                    onPress={goToWellness}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Ver detalhes do wellness"
                >
                    <View style={styles.linkRow}>
                        <Text style={styles.linkText}>Ver detalhes</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </View>
                </TouchableOpacity>
            </View>

            {!hasAnyActivity ? (
                <Pressable style={styles.emptyCard} onPress={goToWellness}>
                    <View style={styles.emptyIcon}>
                        <Ionicons name="rocket-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.emptyTitle}>Comece sua primeira corrida da semana</Text>
                        <Text style={styles.emptySubtitle}>
                            Seus números aparecem aqui assim que você treinar.
                        </Text>
                    </View>
                </Pressable>
            ) : (
                <>
                    <View style={styles.largeRow}>
                        <DistanceCard
                            value={overview.weekDistanceKm}
                            deltaPct={performance.distance.deltaPct}
                            onPress={goToWellness}
                        />
                        <FrequencyCard
                            done={overview.frequencyDone}
                            planned={overview.frequencyPlanned}
                            onPress={goToWellness}
                        />
                    </View>

                    <View style={styles.smallRow}>
                        <SmallCard
                            icon="flame"
                            iconColor={colors.accent}
                            label="Calorias"
                            value={
                                overview.caloriesLastRun !== null
                                    ? overview.caloriesLastRun.toLocaleString('pt-BR')
                                    : '--'
                            }
                            unit={overview.caloriesLastRun !== null ? 'cal' : undefined}
                        />
                        <SmallCard
                            icon="time-outline"
                            iconColor={colors.primaryLight}
                            label="Duração"
                            value={formatDuration(overview.durationLastRunSec)}
                        />
                        <SmallCard
                            icon="heart"
                            iconColor={colors.error}
                            label="FC último"
                            value={overview.lastRunAvgHr !== null ? String(overview.lastRunAvgHr) : '--'}
                            unit={overview.lastRunAvgHr !== null ? 'bpm' : undefined}
                            hint={overview.lastRunAvgHr === null ? 'Conecte um relógio' : undefined}
                        />
                    </View>
                </>
            )}
        </View>
    );
}

function DistanceCard({
    value,
    deltaPct,
    onPress,
}: {
    value: number;
    deltaPct: number | null;
    onPress: () => void;
}) {
    const showDelta = deltaPct !== null;
    const positive = (deltaPct ?? 0) > 0;
    const deltaColor = !showDelta
        ? colors.textMuted
        : positive
            ? colors.success
            : (deltaPct ?? 0) < 0
                ? colors.error
                : colors.textMuted;

    return (
        <Pressable style={styles.largeCard} onPress={onPress}>
            <LinearGradient
                colors={['rgba(0,212,255,0.10)', 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <View style={styles.largeCardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(0,212,255,0.15)' }]}>
                    <Ionicons name="map-outline" size={16} color={colors.primary} />
                </View>
                <Text style={styles.largeCardLabel}>Distância</Text>
            </View>
            <Text style={styles.largeValue}>
                {value.toFixed(1)}
                <Text style={styles.largeUnit}> km</Text>
            </Text>
            {showDelta && (
                <View style={styles.deltaRow}>
                    <Ionicons
                        name={positive ? 'arrow-up' : 'arrow-down'}
                        size={11}
                        color={deltaColor}
                    />
                    <Text style={[styles.deltaText, { color: deltaColor }]}>
                        {Math.abs(deltaPct!).toFixed(1)}%
                    </Text>
                    <Text style={styles.deltaSub}>vs semana anterior</Text>
                </View>
            )}
        </Pressable>
    );
}

function FrequencyCard({
    done,
    planned,
    onPress,
}: {
    done: number;
    planned: number;
    onPress: () => void;
}) {
    const pct = planned > 0 ? Math.min(1, done / planned) : 0;

    return (
        <Pressable style={styles.largeCard} onPress={onPress}>
            <LinearGradient
                colors={['rgba(16,185,129,0.10)', 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <View style={styles.largeCardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                    <Ionicons name="bar-chart-outline" size={16} color={colors.success} />
                </View>
                <Text style={styles.largeCardLabel}>Treinos</Text>
            </View>
            <Text style={styles.largeValue}>
                {done}
                {planned > 0 && <Text style={styles.largeUnit}>/{planned}</Text>}
            </Text>
            <View style={styles.progressTrack}>
                <View
                    style={[
                        styles.progressFill,
                        {
                            width: `${pct * 100}%`,
                            backgroundColor: colors.success,
                        },
                    ]}
                />
            </View>
        </Pressable>
    );
}

function SmallCard({
    icon,
    iconColor,
    label,
    value,
    unit,
    hint,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    label: string;
    value: string;
    unit?: string;
    hint?: string;
}) {
    return (
        <View style={styles.smallCard}>
            <View style={[styles.cardIcon, { backgroundColor: `${iconColor}1A` }]}>
                <Ionicons name={icon} size={14} color={iconColor} />
            </View>
            <Text style={styles.smallLabel}>{label}</Text>
            <Text style={styles.smallValue}>
                {value}
                {unit ? <Text style={styles.smallUnit}> {unit}</Text> : null}
            </Text>
            {hint && <Text style={styles.smallHint}>{hint}</Text>}
        </View>
    );
}

function OverviewSkeleton() {
    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <SkeletonText width={100} height={18} />
            </View>
            <View style={styles.largeRow}>
                <Skeleton width="48%" height={96} borderRadius={borderRadius.xl} />
                <Skeleton width="48%" height={96} borderRadius={borderRadius.xl} />
            </View>
            <View style={styles.smallRow}>
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} width="31%" height={76} borderRadius={borderRadius.xl} />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    heading: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    linkText: {
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
        fontWeight: typography.fontWeights.semibold,
    },
    largeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    largeCard: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        gap: 6,
    },
    largeCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    largeCardLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    largeValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    largeUnit: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    deltaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    deltaText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold,
    },
    deltaSub: {
        fontSize: 10,
        color: colors.textMuted,
        marginLeft: 2,
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        marginTop: 2,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    smallRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    smallCard: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 4,
    },
    cardIcon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    smallValue: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
    },
    smallUnit: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        fontWeight: typography.fontWeights.medium,
    },
    smallHint: {
        fontSize: 10,
        color: colors.textMuted,
    },
    emptyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,212,255,0.10)',
    },
    emptyTitle: {
        fontSize: typography.fontSizes.sm,
        color: colors.text,
        fontWeight: typography.fontWeights.semibold,
    },
    emptySubtitle: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
});
