/**
 * WorkoutDetailScreen — dedicated workout detail (replaces the old bottom-sheet
 * modal in CalendarScreen). Clean/minimal/premium layout matching the design:
 * back header + title/date, a stats row (Distância/Tempo/RPE/Zona), the training
 * phase, the workout blocks (each with its technical description AND the new
 * per-block "Nota do coach"), the RunEasy Training Insight, the on-demand
 * "Aprofundar com o coach" deep-dive section, and a fixed "Iniciar treino" CTA.
 *
 * Route params:
 *   - workout: the raw API workout object (already in memory from the calendar)
 *   - showStartButton: whether to render the start CTA (today's plan/manual only)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { PHASE_LABELS, getZoneColor } from '../theme/zoneColors';
import { ScreenContainer } from '../components/ScreenContainer';
import { CoachDeepDiveSection } from '../components/training/CoachDeepDiveSection';
import { useStartWorkoutFlow } from '../hooks/useStartWorkoutFlow';
import { useTrainingStore } from '../stores';
import { transformWorkoutToUI } from '../utils/workoutTransform';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Sex, jan 25" from a "YYYY-MM-DD" scheduled date (local). */
function formatHeaderDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Hoje 25/01" if today, else "25/01" — feeds startRun's dayLabel. */
function buildDayLabel(dateStr?: string | null): string {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = d.getTime() === today.getTime();
    return isToday ? `Hoje ${day}/${month}` : `${day}/${month}`;
}

function StatItem({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.statItem}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{value}</Text>
        </View>
    );
}

export function WorkoutDetailScreen({ route, navigation }: any) {
    const insets = useSafeAreaInsets();
    const { startRun } = useStartWorkoutFlow();
    const fetchWorkoutDetails = useTrainingStore((s) => s.fetchWorkoutDetails);

    // Two entry points: the calendar passes the full `workout` object; a
    // notification deep-link passes only `workoutId` → fetch it on mount.
    const paramWorkout = route?.params?.workout ?? null;
    const paramWorkoutId: string | undefined =
        route?.params?.workout?.id ?? route?.params?.workoutId;
    const showStartButton: boolean = !!route?.params?.showStartButton;

    const [raw, setRaw] = useState<any | null>(paramWorkout);
    const [isFetching, setIsFetching] = useState(!paramWorkout && !!paramWorkoutId);

    useEffect(() => {
        if (raw || !paramWorkoutId) return;
        let cancelled = false;
        setIsFetching(true);
        fetchWorkoutDetails(paramWorkoutId)
            .then((w) => {
                if (!cancelled) setRaw(w);
            })
            .finally(() => {
                if (!cancelled) setIsFetching(false);
            });
        return () => {
            cancelled = true;
        };
    }, [paramWorkoutId, raw, fetchWorkoutDetails]);

    const data = useMemo(() => (raw ? transformWorkoutToUI(raw) : null), [raw]);
    const metadata = raw?.metadata ?? null;

    if (isFetching) {
        return (
            <ScreenContainer>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons name="chevron-back" size={26} color={colors.primary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.emptyState}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </ScreenContainer>
        );
    }

    if (!data) {
        return (
            <ScreenContainer>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons name="chevron-back" size={26} color={colors.primary} />
                    </TouchableOpacity>
                </View>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Treino não encontrado.</Text>
                </View>
            </ScreenContainer>
        );
    }

    const rpeValue = metadata?.perceived_effort ?? data.rpe.replace('RPE ', '');
    const zoneValue = data.zone ?? '—';

    const handleStart = () => {
        const src = raw?.source as 'plan' | 'manual' | 'free' | undefined;
        const mode = src === 'manual' ? 'manual' : 'planned';
        const dayLabel = buildDayLabel(raw?.scheduled_date);
        navigation.goBack();
        startRun({
            workoutId: raw?.id ?? data.id,
            dayLabel,
            title: raw?.title ?? data.title ?? 'Meu Treino',
            workoutBlocks: raw?.instructions_json ?? [],
            mode,
            targetPaceSeconds: src === 'manual' ? raw?.target_pace_seconds : undefined,
            targetDistanceKm: src === 'manual' ? raw?.distance_km : undefined,
        });
    };

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Ionicons name="chevron-back" size={26} color={colors.primary} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {data.title}
                    </Text>
                    {!!raw?.scheduled_date && (
                        <Text style={styles.headerDate}>{formatHeaderDate(raw.scheduled_date)}</Text>
                    )}
                </View>
                {/* Spacer to keep title centered against the back button */}
                <View style={styles.backButton} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Stats row */}
                <View style={styles.statsRow}>
                    <StatItem label="Distância" value={data.distance} />
                    <StatItem label="Tempo" value={data.duration} />
                    <StatItem label="RPE" value={rpeValue} />
                    <StatItem label="Zona" value={String(zoneValue)} />
                </View>
                <View style={styles.divider} />

                {/* Phase */}
                {data.phase && (
                    <Text style={styles.phaseText}>
                        Fase: {PHASE_LABELS[data.phase]}
                        {data.weekNumber ? ` - Semana ${data.weekNumber}` : ''}
                    </Text>
                )}

                {/* Blocks */}
                {data.blocks.map((block) => (
                    <View
                        key={block.id}
                        style={[styles.block, block.type === 'main' && styles.blockMain]}
                    >
                        {block.zone && getZoneColor(block.zone) && (
                            <View
                                style={[styles.blockZoneStrip, { backgroundColor: getZoneColor(block.zone)! }]}
                            />
                        )}

                        <View style={styles.blockHeader}>
                            <View style={styles.flex}>
                                <Text
                                    style={[styles.blockSubtitle, block.type === 'main' && styles.blockSubtitleMain]}
                                >
                                    {block.subtitle}
                                </Text>
                                <Text style={styles.blockTitle}>{block.title}</Text>
                            </View>
                            {block.type === 'warmup' && (
                                <MaterialCommunityIcons name="walk" size={28} color={colors.primary} />
                            )}
                            {block.type === 'main' && (
                                <MaterialCommunityIcons name="run-fast" size={28} color={colors.primary} />
                            )}
                            {block.type === 'cooldown' && (
                                <MaterialCommunityIcons name="yoga" size={28} color={colors.primary} />
                            )}
                        </View>

                        <View style={styles.blockContent}>
                            <View style={styles.blockMetaRow}>
                                <View style={styles.blockDurationWithIcon}>
                                    <Ionicons name="time-outline" size={18} color="rgba(235,235,245,0.6)" />
                                    <Text style={styles.blockDuration}>{block.duration}</Text>
                                </View>
                                {block.type === 'main' && block.pace ? (
                                    <Text style={styles.blockPace}>{block.pace}</Text>
                                ) : null}
                            </View>
                            <Text style={styles.blockDescription}>{block.description}</Text>

                            {/* Per-block coach note (only on enriched plans) */}
                            {!!block.coachNote && (
                                <View style={styles.coachNote}>
                                    <View style={styles.coachNoteHeader}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                                        <Text style={styles.coachNoteLabel}>Nota do coach</Text>
                                    </View>
                                    <Text style={styles.coachNoteText}>{block.coachNote}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                ))}

                {/* Training Insight (unchanged) */}
                <View style={styles.insightCard}>
                    <View style={styles.insightHeader}>
                        <Ionicons name="bulb" size={20} color="#FFD700" />
                        <Text style={styles.insightTitle}>RUNEASY TRAINING INSIGHT</Text>
                    </View>
                    <Text style={styles.insightText}>{data.insight}</Text>
                </View>

                {/* Deep-dive coach briefing (Pro) */}
                <CoachDeepDiveSection workoutId={raw?.id} />

                <View style={{ height: showStartButton ? 20 : 40 }} />
            </ScrollView>

            {/* Fixed Start button */}
            {showStartButton && (
                <View style={[styles.startContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={handleStart}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Iniciar treino"
                    >
                        <MaterialCommunityIcons name="run-fast" size={24} color="#0E0E1F" />
                        <Text style={styles.startText}>Iniciar treino</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScreenContainer>
    );
}

export default WorkoutDetailScreen;

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleWrap: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    headerDate: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.5)',
        marginTop: 2,
    },
    scroll: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    scrollContent: {
        paddingTop: spacing.md,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: 'rgba(235, 235, 245, 0.6)',
        fontSize: typography.fontSizes.md,
    },
    // Stats
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    statItem: {
        flex: 1,
    },
    statLabel: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.5)',
        marginBottom: 4,
    },
    statValue: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(235, 235, 245, 0.08)',
        marginBottom: spacing.lg,
    },
    phaseText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#EBEBF5',
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    // Blocks
    block: {
        backgroundColor: '#15152A',
        borderRadius: 16,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    blockMain: {
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    blockZoneStrip: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
    },
    blockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    flex: { flex: 1 },
    blockSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.5)',
        marginBottom: 4,
    },
    blockSubtitleMain: {
        color: colors.primary,
        fontWeight: typography.fontWeights.bold as any,
    },
    blockTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockContent: {
        padding: spacing.md,
    },
    blockMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    blockDurationWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    blockDuration: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockPace: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.primary,
    },
    blockDescription: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    // Per-block coach note
    coachNote: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 212, 255, 0.12)',
    },
    coachNoteHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    coachNoteLabel: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.primary,
        letterSpacing: 0.3,
    },
    coachNoteText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.8)',
        lineHeight: 20,
    },
    // Insight
    insightCard: {
        backgroundColor: 'rgba(0, 127, 153, 0.3)',
        borderRadius: 16,
        padding: spacing.lg,
        marginTop: spacing.md,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    insightTitle: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.primary,
        letterSpacing: 0.5,
    },
    insightText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.8)',
        lineHeight: 20,
    },
    // Start button
    startContainer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        backgroundColor: '#0A0A18',
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 28,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 3,
    },
    startText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#0E0E1F',
    },
});
