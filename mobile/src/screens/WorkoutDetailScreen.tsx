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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors, typography, spacing, elevation, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { PHASE_LABELS, getZoneColor } from '../theme/zoneColors';
import { ScreenContainer } from '../components/ScreenContainer';
import { PremiumBackground } from '../components/ui/PremiumBackground';
import { DashedDivider } from '../components/ui/DashedDivider';
import { CoachDeepDiveSection } from '../components/training/CoachDeepDiveSection';
import { ReliefSheet } from '../components/training/ReliefSheet';
import { EffortCueCard, isEasyEffort } from '../components/training/EffortCue';
import { useStartWorkoutFlow } from '../hooks/useStartWorkoutFlow';
import { useEffortCue } from '../hooks/useEffortCue';
import { useTrainingStore } from '../stores';
import { transformWorkoutToUI } from '../utils/workoutTransform';
import { mainEffortBand } from '../utils/workoutPreview';
import { getTodayStrSaoPaulo } from '../utils/planDate';

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
    useThemeSubscription();
    return (
        <View style={styles.statItem}>
            <Text style={styles.statLabel} numberOfLines={1}>
                {label}
            </Text>
            <Text
                style={styles.statValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {value}
            </Text>
        </View>
    );
}

export function WorkoutDetailScreen({ route, navigation }: any) {
    useThemeSubscription();
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
    const [reliefOpen, setReliefOpen] = useState(false);

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

    /**
     * Pode aliviar? — A FRONTEIRA DA FASE 6, VIRANDO UI.
     *
     * Espelho leve da regra do servidor (amanhã em diante, pendente, treino de
     * plano, não-prova). É só para não oferecer um botão que sempre recusa: quem
     * DECIDE é `isEditableWorkout` no backend e o `WHERE` da função Postgres. Se
     * as duas discordarem, a folha explica o motivo em vez de aplicar.
     *
     * Comparação entre strings YYYY-MM-DD, nunca `Date`: o app roda no fuso do
     * aparelho e o plano é agendado em São Paulo — converter para `Date` aqui
     * deslocaria o dia para quem estiver fora do fuso.
     */
    const canRelieve = useMemo(() => {
        if (!raw?.scheduled_date || raw?.source !== 'plan') return false;
        if (raw?.status !== 'pending' || raw?.is_race_day === true) return false;

        // O `todayStr` era montado do relógio LOCAL, o que contradizia o próprio
        // comentário acima: quem estivesse fora de São Paulo via a fronteira
        // deslocada em um dia. Agora usa a mesma conta do resto do plano.
        return String(raw.scheduled_date) > getTodayStrSaoPaulo();
    }, [raw]);

    /**
     * Fase 6.4 — a orientação de esforço da semana.
     *
     * Só em treino FÁCIL e ainda por correr: num tempo ou intervalado, correr
     * forte É o objetivo, e pedir para segurar ali seria repreender a pessoa por
     * executar bem. O critério é o mesmo do card do dia — ver `isEasyEffort`.
     */
    const cue = useEffortCue();
    const effortBand = useMemo(
        () => mainEffortBand(raw?.instructions_json),
        [raw],
    );
    const showEffortCue =
        cue.active &&
        raw?.status === 'pending' &&
        isEasyEffort(effortBand.zone, raw?.type);

    const handleRelieved = useCallback(() => {
        // O treino mudou no servidor; recarrega esta tela pelo mesmo caminho do
        // deep-link. `invalidatePlanCaches` (dentro da folha) já cuidou das
        // outras telas.
        if (!paramWorkoutId) return;
        void fetchWorkoutDetails(paramWorkoutId).then((w) => w && setRaw(w));
    }, [paramWorkoutId, fetchWorkoutDetails]);

    if (isFetching) {
        return (
            <ScreenContainer>
                <PremiumBackground />
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons name="chevron-back" size={26} color={semanticColors.textPrimary} />
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
                <PremiumBackground />
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons name="chevron-back" size={26} color={semanticColors.textPrimary} />
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
            <PremiumBackground />
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
                    <>
                        <Text style={styles.phaseText}>
                            Fase: {PHASE_LABELS[data.phase]}
                            {data.weekNumber ? ` - Semana ${data.weekNumber}` : ''}
                        </Text>
                        <DashedDivider dash={[5, 5]} style={styles.phaseDivider} />
                    </>
                )}

                {/* Fase 6.4 — a orientação de esforço, IMEDIATAMENTE acima dos
                    blocos: ela fala sobre como ler a faixa que vem logo abaixo,
                    e separada dela perderia o referente. */}
                {showEffortCue && (
                    <View style={styles.effortCueWrap}>
                        <EffortCueCard
                            diagnosis={cue.diagnosis}
                            targetPaceSec={effortBand.paceMax}
                        />
                    </View>
                )}

                {/* Blocks */}
                {data.blocks.map((block) => {
                    const accent = getZoneColor(block.zone) ?? colors.primary;
                    return (
                        <View key={block.id} style={styles.block}>
                            {/* Left zone accent bar (clips to the card radius via overflow) */}
                            <View style={[styles.blockAccent, { backgroundColor: accent }]} />

                            {/* Header */}
                            <View style={styles.blockBody}>
                                <View style={styles.blockHeaderRow}>
                                    <View style={styles.flex}>
                                        <Text style={styles.blockSubtitle}>{block.subtitle}</Text>
                                        <Text style={styles.blockTitle}>{block.title}</Text>
                                    </View>
                                    {(block.type === 'warmup' || block.type === 'cooldown') && (
                                        <Ionicons name="walk-outline" size={26} color={colors.primary} />
                                    )}
                                    {(block.type === 'main' || block.type === 'repeat') && (
                                        <MaterialCommunityIcons name="run" size={26} color={colors.primary} />
                                    )}
                                </View>

                                <DashedDivider style={styles.blockDivider} />

                                {/* Distance/time + pace + description */}
                                <View style={styles.blockMetaRow}>
                                    <Ionicons name="time-outline" size={18} color={semanticColors.textSecondary} />
                                    <Text style={styles.blockDuration}>{block.duration}</Text>
                                    {!!block.pace && (
                                        <>
                                            <MaterialCommunityIcons name="speedometer" size={16} color={colors.primary} style={{ marginLeft: 12 }} />
                                            <Text style={styles.blockPace}>{block.pace}</Text>
                                        </>
                                    )}
                                </View>
                                <Text style={styles.blockDescription}>{block.description}</Text>

                                {/* Recuperação real (intervalados) */}
                                {!!block.recovery && (
                                    <View style={styles.blockRecoveryRow}>
                                        <Ionicons name="refresh-outline" size={16} color={semanticColors.textSecondary} />
                                        <Text style={styles.blockRecoveryText}>{block.recovery}</Text>
                                    </View>
                                )}

                                {/* Per-block coach note (only on enriched plans) */}
                                {!!block.coachNote && (
                                    <>
                                        <DashedDivider style={styles.blockDivider} />
                                        <View style={styles.coachNoteHeader}>
                                            <MaterialCommunityIcons
                                                name="note-text-outline"
                                                size={16}
                                                color={semanticColors.textSecondary}
                                            />
                                            <Text style={styles.coachNoteLabel}>Nota do coach</Text>
                                        </View>
                                        <Text style={styles.coachNoteText}>{block.coachNote}</Text>
                                    </>
                                )}
                            </View>
                        </View>
                    );
                })}

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

                <View style={{ height: showStartButton || canRelieve ? 20 : 40 }} />
            </ScrollView>

            {/* Treino FUTURO: o slot onde não havia botão nenhum ("Iniciar" só
                aparece no dia). É a fronteira da Fase 6 virando affordance —
                editável é exatamente o que se pode aliviar. */}
            {!showStartButton && canRelieve && (
                <View style={[styles.startContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                    <TouchableOpacity
                        style={styles.relieveButton}
                        onPress={() => setReliefOpen(true)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Aliviar este treino"
                        accessibilityHint="Reduz a distância mantendo o ritmo alvo"
                    >
                        <MaterialCommunityIcons
                            name="arrow-collapse-down"
                            size={20}
                            color={colors.primary}
                        />
                        <Text style={styles.relieveText}>Aliviar este treino</Text>
                    </TouchableOpacity>
                </View>
            )}

            {paramWorkoutId && (
                <ReliefSheet
                    visible={reliefOpen}
                    workoutId={paramWorkoutId}
                    onClose={() => setReliefOpen(false)}
                    onApplied={handleRelieved}
                />
            )}

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
                        <MaterialCommunityIcons name="run-fast" size={24} color={semanticColors.textOnAccent} />
                        <Text style={styles.startText}>Iniciar treino</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScreenContainer>
    );
}

export default WorkoutDetailScreen;

const styles = createThemeStyles(() => ({
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
        color: semanticColors.textPrimary,
    },
    headerDate: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        marginTop: 2,
    },
    scroll: {
        flex: 1,
        paddingHorizontal: spacing.md,
    },
    scrollContent: {
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: semanticColors.textSecondary,
        fontSize: typography.fontSizes.md,
    },
    // Stats — centered group with tight, responsive gaps so the 4 stats fit
    // every device (values shrink-to-fit on the smallest screens).
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        columnGap: 20,
        marginBottom: spacing.md,
    },
    statItem: {
        alignItems: 'flex-start',
    },
    statLabel: {
        fontSize: 13,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textSecondary,
        marginBottom: 6,
    },
    statValue: {
        fontSize: 22,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: semanticColors.borderSubtle,
        marginBottom: spacing.lg,
    },
    phaseText: {
        fontSize: 18,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textPrimary,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    phaseDivider: {
        marginBottom: spacing.lg,
    },
    // Fase 6.4 — respiro entre a orientação de esforço e o primeiro bloco.
    effortCueWrap: {
        marginBottom: spacing.lg,
    },
    // Blocks — clean card, left zone accent, no full neon border
    block: {
        backgroundColor: semanticColors.surface1,
        borderRadius: 20,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    blockAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    blockBody: {
        padding: spacing.md,
    },
    blockHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    flex: { flex: 1 },
    blockSubtitle: {
        fontSize: 12,
        fontWeight: typography.fontWeights.medium as any,
        color: semanticColors.textSecondary,
        marginBottom: 4,
    },
    blockTitle: {
        fontSize: 15,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textPrimary,
    },
    blockDivider: {
        marginVertical: spacing.md,
    },
    blockMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: 6,
    },
    blockDuration: {
        fontSize: 15,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textPrimary,
    },
    blockPace: {
        fontSize: 15,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.accent,
        marginLeft: 4,
    },
    blockDescription: {
        fontSize: 13,
        color: semanticColors.textSecondary,
        lineHeight: 18,
    },
    blockRecoveryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
    },
    blockRecoveryText: {
        fontSize: 13,
        fontWeight: typography.fontWeights.medium as any,
        color: semanticColors.textSecondary,
    },
    // Per-block coach note — neutral (white label + gray icon), Figma-faithful
    coachNoteHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    coachNoteLabel: {
        fontSize: 15,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textPrimary,
    },
    coachNoteText: {
        fontSize: 13,
        color: semanticColors.textSecondary,
        lineHeight: 18,
    },
    // Insight
    insightCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        padding: spacing.lg,
        marginTop: spacing.md,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
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
        color: semanticColors.textPrimary,
        letterSpacing: 0.5,
    },
    insightText: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        lineHeight: 20,
    },
    // Start button
    startContainer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        backgroundColor: semanticColors.transparent,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: semanticColors.accent,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 28,
        ...elevation.sm,
    },
    startText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: semanticColors.textOnAccent,
    },
    // Contorno, não preenchido: aliviar é uma ação SECUNDÁRIA. O ciano sólido é
    // do "Iniciar treino", e dar o mesmo peso visual às duas sugeriria que
    // reduzir o volume é o caminho esperado do dia.
    relieveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        backgroundColor: semanticColors.surface2,
    },
    relieveText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold as any,
        color: semanticColors.accent,
    },
}));
