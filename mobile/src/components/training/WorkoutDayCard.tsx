import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { typography, spacing, borderRadius } from '../../theme';
import { paceValueToSecondsPerKm, formatPaceLabel } from '../../utils/pace';

/**
 * Single workout/activity card for a given day, shared by Calendar and Home.
 *
 * Extracted verbatim (visual + badges) from the Calendar day-detail card so
 * both screens render the exact same card. Shows intensity, source (plan /
 * manual / free) and status badges, and a "Ver detalhes / Ver resumo" CTA.
 */

export interface DayWorkout {
    id: string;
    type: string;
    distance_km: number | null;
    source?: 'plan' | 'manual' | 'free' | null;
    status?: 'pending' | 'completed' | 'skipped' | 'missed' | null;
    objective?: string | null;
    instructions_json?: Array<{ pace_min?: number | null }> | null;
}

interface WorkoutDayCardProps {
    workout: DayWorkout;
    onPress: (workout: DayWorkout) => void;
}

const TYPE_LABELS: Record<string, string> = {
    easy_run: 'Rodagem Leve',
    long_run: 'Longão',
    intervals: 'Intervalados',
    tempo: 'Tempo Run',
    recovery: 'Recuperação',
    free_run: 'Corrida Livre',
};

const formatKm = (km: number | null | undefined): string => {
    if (typeof km !== 'number' || !isFinite(km)) return '0';
    return Number(km.toFixed(2)).toString();
};

function WorkoutDayCardInner({ workout: w, onPress }: WorkoutDayCardProps) {
    const handlePress = useCallback(() => onPress(w), [onPress, w]);

    const distanceLabel = formatKm(w.distance_km);
    const titleText = `${TYPE_LABELS[w.type] || w.type} - ${distanceLabel}km`;
    const intensityText =
        w.type === 'intervals' || w.type === 'tempo' ? 'ALTA INTENSIDADE' : 'MODERADO';
    const src = w.source ?? 'plan';

    const statusBadge = (() => {
        if (w.status === 'completed') return { color: '#32CD32', label: 'Concluído' };
        if (w.status === 'missed') return { color: '#FF4444', label: 'Não realizado' };
        if (w.status === 'skipped') return { color: 'rgba(235,235,245,0.4)', label: 'Ignorado' };
        return { color: '#FFC107', label: 'Pendente' };
    })();

    // pace_min do 1º bloco (aquecimento) em segundos/km (novo) ou decimal (legado);
    // o util normaliza e formata como "m:ss".
    const paceSecs = paceValueToSecondsPerKm(w.instructions_json?.[0]?.pace_min);
    const paceText = paceSecs != null ? `${formatPaceLabel(paceSecs)} /km` : '6:00 /km';

    return (
        <View style={styles.workoutDetailCard}>
            {/* Card Top Section */}
            <View style={styles.cardTopSection}>
                <View style={styles.workoutDetailHeader}>
                    <View style={styles.intensityBadge}>
                        <Text style={styles.intensityText}>{intensityText}</Text>
                    </View>
                    {src === 'plan' ? (
                        <View style={[styles.sourceBadge, { borderColor: '#00D4FF' }]}>
                            <Ionicons name="flash" size={12} color="#00D4FF" />
                            <Text style={[styles.sourceBadgeText, { color: '#00D4FF' }]}>PLANO</Text>
                        </View>
                    ) : src === 'manual' ? (
                        <View style={[styles.sourceBadge, { borderColor: '#A78BFA' }]}>
                            <Ionicons name="create-outline" size={12} color="#A78BFA" />
                            <Text style={[styles.sourceBadgeText, { color: '#A78BFA' }]}>MANUAL</Text>
                        </View>
                    ) : (
                        <View style={[styles.sourceBadge, { borderColor: '#32CD32' }]}>
                            <MaterialCommunityIcons name="run" size={12} color="#32CD32" />
                            <Text style={[styles.sourceBadgeText, { color: '#32CD32' }]}>LIVRE</Text>
                        </View>
                    )}
                    <View style={styles.pendingBadge}>
                        <View style={[styles.pendingDot, { backgroundColor: statusBadge.color }]} />
                        <Text style={styles.pendingText}>{statusBadge.label}</Text>
                    </View>
                </View>

                <View style={styles.workoutDetailBody}>
                    <View style={styles.workoutInfo}>
                        <Text style={styles.workoutTitle}>{titleText}</Text>
                        <Text style={styles.workoutDescription}>
                            {w.objective || (src === 'free' ? 'Corrida livre registrada' : 'Treino do dia')}
                        </Text>
                        <View style={styles.workoutMetrics}>
                            <View style={styles.metricItem}>
                                <MaterialCommunityIcons name="timer-outline" size={20} color="#00D4FF" />
                                <Text style={styles.metricText}>
                                    {Math.round((w.distance_km || 0) * 6)} min
                                </Text>
                            </View>
                            <View style={styles.metricItem}>
                                <MaterialCommunityIcons name="speedometer" size={20} color="#00D4FF" />
                                <Text style={styles.metricText}>{paceText}</Text>
                            </View>
                        </View>
                    </View>
                    <Image
                        source={{
                            uri: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=100&h=100&fit=crop',
                        }}
                        style={styles.workoutImage}
                    />
                </View>
            </View>

            {/* View Details Button - Bottom Section of Card */}
            <TouchableOpacity
                style={styles.viewDetailsButton}
                onPress={handlePress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                    w.status === 'completed' ? 'Ver resumo do treino' : 'Ver detalhes do treino'
                }
            >
                <Text style={styles.viewDetailsText}>
                    {w.status === 'completed' ? 'Ver resumo do treino' : 'Ver detalhes do treino'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    workoutDetailCard: {
        marginBottom: spacing.lg,
        borderRadius: 24,
        overflow: 'hidden',
    },
    cardTopSection: {
        backgroundColor: '#1C1C2E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
    },
    workoutDetailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    intensityBadge: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#00D4FF',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    intensityText: {
        fontSize: 11,
        fontWeight: typography.fontWeights.bold,
        color: '#00D4FF',
        letterSpacing: 0.5,
    },
    sourceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    sourceBadgeText: {
        fontSize: 10,
        fontWeight: typography.fontWeights.bold,
        letterSpacing: 0.5,
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pendingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFC107',
    },
    pendingText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    workoutDetailBody: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    workoutImage: {
        width: 72,
        height: 72,
        borderRadius: 36,
    },
    workoutInfo: {
        flex: 1,
    },
    workoutTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    workoutDescription: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: spacing.sm,
    },
    workoutMetrics: {
        flexDirection: 'row',
        gap: spacing.lg,
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metricText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    viewDetailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
        backgroundColor: '#0E0E1F',
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    viewDetailsText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.semibold,
        color: '#FFFFFF',
    },
});

export const WorkoutDayCard = memo(WorkoutDayCardInner);
