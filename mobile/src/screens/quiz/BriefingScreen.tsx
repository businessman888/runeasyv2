import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
    BackHandler,
    Animated,
    Dimensions,
    Share,
    Alert,
    ActivityIndicator,
} from 'react-native';
// CommonActions removed — AppNavigator handles transition via onboarding_completed state
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useAuthStore } from '../../stores/authStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { usePurchaseOutcomeStore } from '../../stores/purchaseOutcomeStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle as SvgCircle } from 'react-native-svg';
import { usePlacement, useUser } from 'expo-superwall';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PAYWALL_PLACEMENTS } from '../../services/paywall';
import {
    getArchetypeNarrative,
    getGoalLabel,
    getGoalDescription,
    getGoalGainText,
    formatDeclaredPace,
} from '../../utils/archetypes';
import { formatPaceRangeLabel } from '../../utils/pace';
import type { PlanPreview } from '../../stores/onboardingStore';
import { RaceCountdownBadge } from '../../components/onboarding/RaceCountdownBadge';
import { weeksUntilRace } from '../../utils/raceFormat';
import { semanticColors } from '../../theme/semanticColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================
// Design System — Figma node 180:848
// =============================================
const DS = {
    bg: semanticColors.onboardingIconInk,
    card: semanticColors.surface2,
    cardL2: semanticColors.surface1,
    cyan: semanticColors.accent,
    cyanMuted: semanticColors.accentSubtle,
    text: semanticColors.textPrimary,
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: semanticColors.borderSubtle,
    gold: '#FFC400',
    goldMuted: semanticColors.warningSubtle,
};

// =============================================
// SVG CHART — Ascending line with gradient fill
// =============================================
const CHART_W = SCREEN_WIDTH - 80;
const CHART_H = 160;

const ProgressChart = ({ chartPoints, accentColor }: { chartPoints: number[]; accentColor: string }) => {
    const animVal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
        }).start();
    }, []);

    // Map 8 chart points to SVG coordinates
    const xPositions = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.0];
    const points = chartPoints.map((y, i) => ({
        x: CHART_W * xPositions[i],
        y,
    }));

    // Build SVG path for line
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp1y = points[i - 1].y;
        const cp2x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp2y = points[i].y;
        linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i].x} ${points[i].y}`;
    }

    const fillPath = linePath + ` L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
    const lastPoint = points[points.length - 1];

    return (
        <Svg width={CHART_W} height={CHART_H + 10} style={{ marginTop: 10 }}>
            <Defs>
                <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={accentColor} stopOpacity="0.35" />
                    <Stop offset="1" stopColor={accentColor} stopOpacity="0.02" />
                </SvgLinearGradient>
            </Defs>
            <Path d={fillPath} fill="url(#chartGrad)" />
            <Path d={linePath} stroke={accentColor} strokeWidth={3} fill="none" strokeLinecap="round" />
            <SvgCircle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={accentColor} />
        </Svg>
    );
};

// =============================================
// TREINO #1 — formatação do que veio do backend
// =============================================

/** Rótulo do tipo de treino. Os números NUNCA são montados aqui. */
const WORKOUT_TYPE_LABELS: Record<string, string> = {
    easy_run: 'Rodagem Leve',
    long_run: 'Longão',
    recovery: 'Regenerativo',
    tempo: 'Tempo Run',
    intervals: 'Intervalado',
    progressive: 'Progressivo',
    walk_run: 'Caminhada e Corrida',
};

function formatDurationLabel(seconds: number): string {
    return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Traduz a prévia do backend para o que o card exibe. Três estados do MESMO
 * card (consistência visual), cada um distinguível por texto+ícone e não só por
 * cor:
 *  - `run`      → distância real + faixa de pace real (segundos/km → m:ss)
 *  - `walk_run` → duração + "No seu ritmo"; NÃO existe pace e nada é inventado
 *  - neutro     → sem prévia (falha de rede): nenhum número, só a promessa
 */
function describeFirstWorkout(preview: PlanPreview | null): {
    title: string;
    duration: string | null;
    paceLabel: string | null;
    paceIcon: 'speedometer' | 'walk';
    note: string | null;
} {
    if (!preview) {
        return {
            title: 'Seu primeiro treino',
            duration: null,
            paceLabel: null,
            paceIcon: 'speedometer',
            note: 'Calculado a partir do seu perfil assim que você confirmar.',
        };
    }

    const w = preview.week1FirstWorkout;
    const typeLabel = WORKOUT_TYPE_LABELS[w.type] ?? 'Treino';

    if (preview.mode === 'walk_run') {
        const s = w.structure;
        return {
            title: typeLabel,
            duration: formatDurationLabel(w.durationSeconds),
            // Sem VDOT não há pace-alvo — e a tela não inventa um.
            paceLabel: 'No seu ritmo',
            paceIcon: 'walk',
            note: s
                ? `${s.reps}× correr ${s.runSeconds}s / caminhar ${Math.round(s.walkSeconds / 60)} min`
                : null,
        };
    }

    const range = formatPaceRangeLabel(
        w.paceRangeSeconds?.min,
        w.paceRangeSeconds?.max,
    );
    return {
        title: w.distanceKm != null ? `${typeLabel} — ${w.distanceKm} km` : typeLabel,
        duration: formatDurationLabel(w.durationSeconds),
        paceLabel: range ? `Pace ${range}` : null,
        paceIcon: 'speedometer',
        note: null,
    };
}

// =============================================
// MAIN COMPONENT
// =============================================
export function BriefingScreen({ navigation, route }: any) {
    const { data } = useOnboardingStore();
    const { saveOnboardingOnly } = useOnboardingStore();
    const isPro = useSubscriptionStore((s) => s.isProUser);
    const userId = route?.params?.userId;
    // Prévia determinística vinda do backend (motores puros, sem IA). `null`
    // quando o endpoint falhou → narrativa neutra, sem número inventado.
    const preview: PlanPreview | null = route?.params?.preview ?? null;
    const archetype = getArchetypeNarrative(preview?.archetypeKey);
    // Observabilidade do disparo (Superwall suporta esses callbacks nativamente).
    // Em modo MANUAL, distinguir "apresentou" de "pulou por Holdout/status" é o
    // que permite diagnosticar em runtime sem inferir pelo comportamento visual.
    const { registerPlacement } = usePlacement({
        onPresent: (info) =>
            console.log('[Paywall onboarding_complete] onPresent:', info?.name),
        onSkip: (reason) =>
            console.log('[Paywall onboarding_complete] onSkip:', reason?.type),
        onError: (error) =>
            console.warn('[Paywall onboarding_complete] onError:', error),
        onDismiss: (_info, result) =>
            console.log('[Paywall onboarding_complete] onDismiss:', result?.type),
    });
    // Modo MANUAL de subscription status: precisamos resolver o status (não deixar
    // UNKNOWN) antes do register, senão o Superwall segura o paywall. Espelha o
    // fluxo que funciona (useProFeature.presentPaywall).
    const { setSubscriptionStatus } = useUser();
    const insets = useSafeAreaInsets();

    // Guarda contra duplo disparo (double-tap). O ref é síncrono: bloqueia o
    // segundo toque ANTES do re-render, coisa que só `setState` não garante
    // (é assíncrono). O state espelhado (`isSubmitting`) existe só para o
    // feedback visual do botão (loading/disabled). Ver [[project_freerun_flood_incident]].
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Disable Android hardware back
    useEffect(() => {
        const backAction = () => true;
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => handler.remove();
    }, []);

    // NOTE: the paywall is presented once, on confirm (handleConfirmAndStart),
    // not on mount — showing the archetype reveal first, then a single
    // referral-aware paywall. (Previously a second paywall fired here on mount.)

    // Data from quiz
    const goal = data.goal || '10k';
    const goalTimeframe = data.goalTimeframe || 3;
    const daysPerWeek = data.daysPerWeek || 4;
    // Pace DECLARADO no onboarding. `null` quando não existe (fluxo "nunca
    // corri" limpa esses campos) — antes, o `|| '7'` fabricava "7:00 min/km" e a
    // tela afirmava um pace para quem nunca tinha corrido.
    const paceDisplay = formatDeclaredPace(data.paceMinutes, data.paceSeconds);
    const isRaceGoal = data.goal_type === 'race' && !!data.race_date;
    const raceWeeks = isRaceGoal ? weeksUntilRace(data.race_date as string) : 0;
    const durationWeeks = isRaceGoal ? `${raceWeeks} Sem` : `${(goalTimeframe) * 4} Sem`;
    const frequencyWeekly = `${daysPerWeek}x/Sem`;

    // Narrativa do arquétipo (só embalagem: nome, cor, curva, dica).
    const accentColor = archetype.accentColor;
    const chartPoints = archetype.chartPoints;
    const firstWorkout = describeFirstWorkout(preview);

    // Tom da projeção: otimista (gráfico "Meta Alcançada" + ganho estimado) ou
    // conservador. O critério MUDA conforme o tipo de meta:
    //
    //  • DISTÂNCIA — `feasible`. Está correto: quem escolheu 10 km num prazo
    //    impossível deve mesmo ver o tom conservador, e ali há alavanca (a Fase C
    //    força ajustar prazo ou meta).
    //  • PROVA — `raceRiskWarning`, o limiar dedicado e bem mais tolerante.
    //    Usar `feasible` aqui era pessimismo sem motivo: no espaço plausível,
    //    ~48% das provas são `feasible: false` com risco perfeitamente aceitável
    //    (a data é fixa, não há alavanca), e escondíamos a projeção justamente
    //    na tela onde o usuário decide assinar.
    //
    // Fail-open nos dois ramos: sem prévia (falha de rede) → tom otimista.
    const goalFeasible = isRaceGoal
        ? !(preview?.viability.raceRiskWarning ?? false)
        : (preview?.viability.feasible ?? true);

    const handleShare = async () => {
        try {
            await Share.share({
                message: `🏃 Meu plano de treino "${archetype.name}" para ${getGoalLabel(goal)} está pronto! RunEasy - Treinamento inteligente de corrida.`,
            });
        } catch { }
    };

    // Libera a guarda para permitir nova tentativa após uma falha real.
    const releaseSubmitGuard = () => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
    };

    const handleConfirmAndStart = async () => {
        // Escopo 1 — Guarda de idempotência. Se já há um disparo em andamento,
        // retorna cedo: cada toque repetido do usuário vira no-op. O ref é
        // checado/setado de forma síncrona, então mesmo toques que aconteçam
        // antes do próximo render são bloqueados.
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        // Escopo 3 — Feedback visual imediato: setado ANTES de qualquer await,
        // para que o botão entre em loading/disabled instantaneamente e o
        // usuário não tenha motivo pra tocar de novo.
        setIsSubmitting(true);

        // If not Pro, present the (single) onboarding paywall. The referral
        // discount paywall (REFERRAL_ACTIVATED) was disabled for Apple Guideline
        // 3.1.1 compliance — a discount can't be unlocked by a proprietary code.
        // Backend attribution (POST /referral/apply) stays intact. If they close
        // it (Free path), we still save onboarding and let them in — they'll see
        // UpgradeProCard in gated sections.
        if (!isPro) {
            try {
                // Resolve o subscription status ANTES do register. No modo MANUAL,
                // um status UNKNOWN faz o Superwall segurar o paywall e liberar o
                // usuário direto. Aqui estamos no ramo !isPro → INACTIVE (Free),
                // que faz o paywall ser apresentado. Espelha useProFeature.ts.
                await setSubscriptionStatus({ status: 'INACTIVE' });

                await registerPlacement({
                    placement: PAYWALL_PLACEMENTS.ONBOARDING_COMPLETE,
                });
            } catch (err) {
                console.warn('[Paywall] Erro ao registrar placement onboarding:', err);
            }

            // Pull fresh status — webhook may have flipped them to Pro mid-call
            await useSubscriptionStore.getState().fetchSubscription();

            // Distinguish "closed the paywall to stay Free" from "the purchase
            // actually failed". Only the latter blocks + alerts; closing just
            // proceeds into the app as Free.
            const stillFree = !useSubscriptionStore.getState().isProUser;
            const outcome = usePurchaseOutcomeStore.getState().lastOutcome;
            usePurchaseOutcomeStore.getState().reset();
            if (stillFree && outcome === 'failed') {
                Alert.alert(
                    'Pagamento não concluído',
                    'Não conseguimos concluir sua assinatura. Você pode tentar novamente ou seguir no plano gratuito.',
                );
                releaseSubmitGuard();
                return;
            }
        }

        // Save onboarding regardless of plan.
        // - Pro: HomeScreen will trigger AI generation on first focus.
        // - Free: backend skips AI generation (gated by subscription_plan check).
        try {
            const saved = await saveOnboardingOnly();
            if (!saved) {
                Alert.alert('Erro', 'Não foi possível salvar seus dados. Tente novamente.');
                releaseSubmitGuard();
                return;
            }
        } catch (err) {
            console.error('[BriefingScreen] Failed to save onboarding:', err);
            Alert.alert('Erro', 'Não foi possível salvar seus dados. Tente novamente.');
            releaseSubmitGuard();
            return;
        }

        // Sucesso: NÃO liberamos a guarda. A tela sai de cena (AppNavigator
        // troca a stack de onboarding pela principal ao ver onboarding_completed),
        // então o botão deve permanecer em loading/disabled até a transição.

        // Update local user state — AppNavigator reacts to onboarding_completed
        // and automatically transitions from onboarding stack to main stack.
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
            useAuthStore.getState().setUser({
                ...currentUser,
                onboarding_completed: true,
            });
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
            >
                <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
                    {/* =============================================
                        1. HEADER — Archetype icon + name
                        ============================================= */}
                    <View style={styles.topHeader}>
                        <View style={styles.topHeaderLeft}>
                            <MaterialCommunityIcons
                                name={archetype.icon as any}
                                size={40}
                                color={accentColor}
                            />
                            <Text style={[styles.topHeaderTitle, { color: accentColor }]}>
                                {archetype.name}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <MaterialCommunityIcons name="share-variant-outline" size={24} color={DS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* =============================================
                        2. TITLE SECTION — Archetype-driven
                        ============================================= */}
                    <View style={styles.titleSection}>
                        <Text style={styles.title}>
                            Coach RunEasy:{'\n'}
                            <Text style={{ color: accentColor }}>{archetype.name}</Text>
                        </Text>
                        {/* A cláusula de pace só aparece quando existe pace declarado. */}
                        {isRaceGoal ? (
                            <Text style={styles.subtitle}>
                                {paceDisplay ? (
                                    <>
                                        Com seu pace de{' '}
                                        <Text style={styles.goalHighlight}>{paceDisplay} min/km</Text>
                                        {' '}e a{' '}
                                    </>
                                ) : (
                                    <>Com a{' '}</>
                                )}
                                sua prova em{' '}
                                <Text style={styles.goalHighlight}>{raceWeeks} {raceWeeks === 1 ? 'semana' : 'semanas'}</Text>
                                , montamos uma periodização ancorada no dia da prova.
                            </Text>
                        ) : (
                            <Text style={styles.subtitle}>
                                {paceDisplay ? (
                                    <>
                                        Com seu pace de{' '}
                                        <Text style={styles.goalHighlight}>{paceDisplay} min/km</Text>
                                        {' '}e meta de{' '}
                                    </>
                                ) : (
                                    <>Com sua meta de{' '}</>
                                )}
                                <Text style={styles.goalHighlight}>{getGoalDescription(goal)}</Text>
                                , estruturamos sua jornada de{' '}
                                <Text style={styles.goalHighlight}>{goalTimeframe} {goalTimeframe === 1 ? 'mês' : 'meses'}</Text>.
                            </Text>
                        )}
                        <Text style={styles.tagline}>{archetype.tagline}</Text>
                    </View>

                    {isRaceGoal && (
                        <RaceCountdownBadge
                            raceName={data.race_name}
                            raceDate={data.race_date as string}
                            raceDistance={data.race_distance}
                        />
                    )}

                    {/* =============================================
                        3. METRICS CARD
                        ============================================= */}
                    <View style={styles.metricsCard}>
                        <View style={styles.metricCol}>
                            <Text style={styles.metricLabel}>Objetivo</Text>
                            <Text style={styles.metricValue}>{getGoalLabel(goal)}</Text>
                        </View>
                        <View style={styles.metricDivider} />
                        <View style={styles.metricCol}>
                            <Text style={styles.metricLabel}>Duração</Text>
                            <Text style={styles.metricValue}>{durationWeeks}</Text>
                        </View>
                        <View style={styles.metricDivider} />
                        <View style={styles.metricCol}>
                            <Text style={styles.metricLabel}>Freq.</Text>
                            <Text style={styles.metricValue}>{frequencyWeekly}</Text>
                        </View>
                    </View>

                    {/* =============================================
                        4. CHART CARD — Archetype-driven curve
                        ============================================= */}
                    <View style={styles.chartCard}>
                        <View style={styles.chartHeader}>
                            <View>
                                <Text style={styles.chartMetaLabel}>Meta</Text>
                                <Text style={styles.chartMetaValue}>{getGoalLabel(goal)}</Text>
                            </View>
                            <View style={styles.chartGainContainer}>
                                <Text style={[styles.chartGainValue, { color: accentColor }]}>
                                    {goalFeasible ? getGoalGainText(goal, goalTimeframe) : 'Base sólida'}
                                </Text>
                                <Text style={styles.chartGainSub}>
                                    {goalFeasible ? 'progressão estimada' : 'foco desta jornada'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.chartCanvasContainer}>
                            <ProgressChart chartPoints={chartPoints} accentColor={accentColor} />
                        </View>

                        <View style={styles.chartLabelsRow}>
                            <Text style={styles.chartLabelLeft}>Estado Atual</Text>
                            <Text style={[styles.chartLabelRight, { color: accentColor }]}>
                                {goalFeasible ? 'Meta Alcançada' : 'Base Construída'}
                            </Text>
                        </View>

                        {/* Tom honesto quando a meta não cabe no prazo — mesma
                            linguagem do FeasibilityModal informativo (Fase C):
                            orientação, não erro. */}
                        {!goalFeasible && (
                            <Text style={styles.chartHonestNote}>
                                Sua meta pede mais tempo do que o prazo escolhido. Este plano
                                constrói sua base com segurança — é daqui que você chega lá.
                            </Text>
                        )}
                    </View>

                    {/* =============================================
                        5. BADGE — Boas-Vindas
                        ============================================= */}
                    <View style={styles.badgeCard}>
                        <View style={styles.badgeIconCircle}>
                            <MaterialCommunityIcons name="trophy" size={28} color={DS.gold} />
                        </View>
                        <View style={styles.badgeTextContainer}>
                            <Text style={styles.badgeTitle}>Badge de Boas-Vindas</Text>
                            <Text style={styles.badgeSubtitle}>CONQUISTADO</Text>
                        </View>
                        <View style={styles.badgeCheckCircle}>
                            <MaterialCommunityIcons name="check" size={18} color={DS.bg} />
                        </View>
                    </View>

                    {/* =============================================
                        6. WORKOUTS SECTION
                        ============================================= */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Seus treinos</Text>
                    </View>

                    {/* Workout #1 — número REAL vindo do motor determinístico.
                        Três estados no mesmo card: corrida (distância+pace),
                        caminhada/corrida (duração+"No seu ritmo") e neutro
                        (sem prévia → sem número algum). */}
                    <View style={[styles.workoutCardActive, { borderColor: accentColor + '50', shadowColor: accentColor + '50' }]}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #1</Text>
                            <Text style={[styles.workoutTitle, { color: accentColor }]}>{firstWorkout.title}</Text>

                            {(firstWorkout.duration || firstWorkout.paceLabel) && (
                                <View style={styles.workoutMetrics}>
                                    {!!firstWorkout.duration && (
                                        <View style={styles.wMetricItem}>
                                            <MaterialCommunityIcons name="timer-outline" size={16} color={DS.textSecondary} />
                                            <Text style={styles.wMetricText}>{firstWorkout.duration}</Text>
                                        </View>
                                    )}
                                    {!!firstWorkout.paceLabel && (
                                        <View style={styles.wMetricItem}>
                                            <MaterialCommunityIcons name={firstWorkout.paceIcon} size={16} color={DS.textSecondary} />
                                            <Text style={styles.wMetricText}>{firstWorkout.paceLabel}</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {!!firstWorkout.note && (
                                <Text style={styles.workoutNote}>{firstWorkout.note}</Text>
                            )}
                        </View>
                        <View style={[styles.runnerCircle, { backgroundColor: accentColor }]}>
                            <MaterialCommunityIcons
                                name={preview?.mode === 'walk_run' ? 'walk' : 'run-fast'}
                                size={25}
                                color={DS.bg}
                            />
                        </View>
                    </View>

                    {/* Workout #2 — LOCKED */}
                    <View style={styles.workoutCardLocked}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #2</Text>
                            <View style={styles.skeletonBar} />
                            <View style={styles.workoutMetrics}>
                                <View style={styles.skeletonSmall} />
                                <View style={styles.skeletonSmall} />
                            </View>
                        </View>
                        <View style={styles.lockIconContainer}>
                            <MaterialCommunityIcons name="lock" size={30} color={DS.textSecondary} />
                        </View>
                    </View>

                    {/* Workout #3 — LOCKED */}
                    <View style={styles.workoutCardLocked}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #3</Text>
                            <View style={styles.skeletonBar} />
                            <View style={styles.workoutMetrics}>
                                <View style={styles.skeletonSmall} />
                                <View style={styles.skeletonSmall} />
                            </View>
                        </View>
                        <View style={styles.lockIconContainer}>
                            <MaterialCommunityIcons name="lock" size={30} color={DS.textSecondary} />
                        </View>
                    </View>

                    {/* =============================================
                        7. COACH TIP CARD — Archetype insight
                        ============================================= */}
                    <View style={[styles.aiTipCard, { shadowColor: accentColor }]}>
                        <View style={styles.aiTipIconCol}>
                            <MaterialCommunityIcons name="lightbulb-on" size={32} color={accentColor} />
                        </View>
                        <View style={styles.aiTipTextCol}>
                            <Text style={[styles.aiTipTitle, { color: accentColor }]}>Dica do Coach</Text>
                            <Text style={styles.aiTipBody}>
                                {archetype.coachTip}
                                {/* A limitação COMPÕE com qualquer arquétipo em vez de
                                    substituí-lo — quem nunca correu e tem limitação
                                    mantém o protocolo certo, com o aviso por cima. */}
                                {preview?.hasLimitation
                                    ? ' Como você relatou uma limitação física, a progressão entra ainda mais conservadora e priorizamos baixo impacto.'
                                    : ''}
                            </Text>
                        </View>
                    </View>

                    {/* =============================================
                        8. PAYWALL SECTION
                        ============================================= */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Cronograma Completo</Text>
                        <View style={styles.weeksBadge}>
                            <Text style={styles.weeksBadgeText}>{durationWeeks.replace(' Sem', ' Semanas')}</Text>
                        </View>
                    </View>

                    <View style={styles.paywallCard}>
                        <View style={[styles.paywallLockCircle, { shadowColor: accentColor }]}>
                            <MaterialCommunityIcons name="lock" size={40} color={accentColor} />
                        </View>

                        <Text style={styles.paywallTitle}>Plano Completo Bloqueado</Text>
                        <Text style={styles.paywallSubtitle}>
                            Desbloqueie seus{' '}
                            <Text style={{ color: accentColor, fontWeight: '700' }}>treinos personalizados por IA, </Text>
                            feedback{'\n'}inteligente e recursos completos.
                        </Text>

                        <View style={styles.paywallButtonArea}>
                            <TouchableOpacity
                                style={[styles.unlockButton, { backgroundColor: accentColor }, isSubmitting && styles.buttonDisabled]}
                                onPress={handleConfirmAndStart}
                                disabled={isSubmitting}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="Confirmar e iniciar"
                                accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                            >
                                {isSubmitting ? (
                                    <>
                                        <ActivityIndicator size="small" color={DS.bg} />
                                        <Text style={styles.unlockButtonText}>Preparando seu plano...</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.unlockButtonText}>Confirmar e Iniciar</Text>
                                        <MaterialCommunityIcons name="arrow-right" size={22} color={DS.bg} />
                                    </>
                                )}
                            </TouchableOpacity>
                            <Text style={styles.trialText}>
                                7 dias grátis depois R$ 29,90/mês. Cancele quando{'\n'}quiser.
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* =============================================
                9. STICKY FOOTER CTA
                ============================================= */}
            <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity
                    style={[styles.ctaButton, { backgroundColor: accentColor }, isSubmitting && styles.buttonDisabled]}
                    onPress={handleConfirmAndStart}
                    disabled={isSubmitting}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Confirmar e iniciar"
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                >
                    {isSubmitting ? (
                        <View style={styles.ctaLoadingRow}>
                            <ActivityIndicator size="small" color={DS.bg} />
                            <Text style={styles.ctaButtonText}>Preparando seu plano...</Text>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.ctaButtonText}>CONFIRMAR E INICIAR</Text>
                            <Text style={styles.ctaButtonSub}>Acesso imediato ao seu melhor nível!</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

// =============================================
// STYLES — Based on SmartPlanScreen (Figma 180:848)
// =============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 16,
    },

    // — 1. Top Header —
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingHorizontal: 4,
    },
    topHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    topHeaderTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: DS.cyan,
    },

    // — 2. Title Section —
    titleSection: {
        marginBottom: 20,
        paddingHorizontal: 10,
    },
    title: {
        fontSize: 28,
        fontWeight: '600',
        color: DS.text,
        lineHeight: 36,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        lineHeight: 24,
    },
    goalHighlight: {
        color: DS.cyan,
    },
    tagline: {
        fontSize: 14,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        fontStyle: 'italic',
        marginTop: 8,
    },

    // — 3. Metrics Card —
    metricsCard: {
        flexDirection: 'row',
        backgroundColor: DS.card,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    metricCol: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
    },
    metricLabel: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 15,
        fontWeight: '600',
        color: DS.text,
    },
    metricDivider: {
        width: 0.5,
        height: 40,
        backgroundColor: DS.glassBorder,
    },

    // — 4. Chart Card —
    chartCard: {
        backgroundColor: DS.card,
        borderRadius: 20,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: DS.glassBorder,
        shadowColor: '#000',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 4,
    },
    chartMetaLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: semanticColors.textSecondary,
    },
    chartMetaValue: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
    },
    chartGainContainer: {
        alignItems: 'flex-end',
    },
    chartGainValue: {
        fontSize: 20,
        fontWeight: '700',
        color: DS.cyan,
    },
    chartGainSub: {
        fontSize: 14,
        fontWeight: '400',
        color: semanticColors.textSecondary,
    },
    chartCanvasContainer: {
        alignItems: 'center',
        marginVertical: 4,
    },
    chartLabelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 6,
    },
    chartLabelLeft: {
        fontSize: 14,
        fontWeight: '500',
        color: semanticColors.textSecondary,
    },
    chartLabelRight: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.cyan,
    },
    chartHonestNote: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        lineHeight: 19,
        paddingHorizontal: 8,
        paddingTop: 10,
    },

    // — 5. Badge Card —
    badgeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.cardL2,
        borderRadius: 20,
        padding: 18,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: DS.gold,
        shadowColor: DS.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 3,
    },
    badgeIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: DS.goldMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeTextContainer: {
        flex: 1,
        marginLeft: 14,
    },
    badgeTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: DS.text,
    },
    badgeSubtitle: {
        fontSize: 12,
        fontWeight: '400',
        color: DS.gold,
        marginTop: 2,
    },
    badgeCheckCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: DS.gold,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // — 6. Section Headers —
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DS.text,
    },
    todayBadge: {
        backgroundColor: DS.cyanMuted,
        borderRadius: 5,
        paddingVertical: 2,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: DS.cyanMuted,
    },
    todayBadgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: DS.cyan,
    },

    // — Workout Card ACTIVE —
    workoutCardActive: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.cardL2,
        borderRadius: 15,
        padding: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: DS.cyanMuted,
        shadowColor: DS.cyanMuted,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 3,
    },
    workoutContent: {
        flex: 1,
    },
    workoutLabel: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        marginBottom: 8,
    },
    workoutTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: DS.cyan,
        marginBottom: 14,
    },
    workoutMetrics: {
        flexDirection: 'row',
        gap: 20,
    },
    wMetricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    wMetricText: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
    },
    workoutNote: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        lineHeight: 18,
        marginTop: 10,
    },
    runnerCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: DS.cyan,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: DS.cyanMuted,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 3,
    },

    // — Workout Card LOCKED —
    workoutCardLocked: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.cardL2,
        borderRadius: 15,
        padding: 16,
        marginBottom: 15,
        opacity: 0.35,
    },
    skeletonBar: {
        width: 178,
        height: 22,
        borderRadius: 20,
        backgroundColor: DS.card,
        marginBottom: 12,
    },
    skeletonSmall: {
        width: 75,
        height: 18,
        borderRadius: 20,
        backgroundColor: DS.card,
    },
    lockIconContainer: {
        width: 50,
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // — 7. AI Tip Card —
    aiTipCard: {
        flexDirection: 'row',
        backgroundColor: DS.card,
        borderRadius: 20,
        padding: 18,
        marginBottom: 24,
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    aiTipIconCol: {
        width: 50,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 2,
    },
    aiTipTextCol: {
        flex: 1,
    },
    aiTipTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: DS.cyan,
        marginBottom: 6,
    },
    aiTipBody: {
        fontSize: 11,
        fontWeight: '400',
        color: DS.text,
        lineHeight: 16,
    },

    // — 8. Paywall Section —
    weeksBadge: {
        backgroundColor: DS.glassBorder,
        borderRadius: 5,
        paddingVertical: 2,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: DS.glassBorder,
    },
    weeksBadgeText: {
        fontSize: 13,
        fontWeight: '600',
        color: semanticColors.textSecondary,
    },
    paywallCard: {
        backgroundColor: DS.cardL2,
        borderRadius: 15,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DS.glassBorder,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    paywallLockCircle: {
        width: 77,
        height: 77,
        borderRadius: 38,
        backgroundColor: semanticColors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 4,
    },
    paywallTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: DS.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    paywallSubtitle: {
        fontSize: 15,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    paywallButtonArea: {
        width: '100%',
        backgroundColor: semanticColors.canvas,
        borderRadius: 20,
        paddingTop: 20,
        paddingBottom: 16,
        paddingHorizontal: 18,
        alignItems: 'center',
    },
    unlockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DS.cyan,
        borderRadius: 30,
        paddingVertical: 16,
        width: '100%',
        gap: 10,
        marginBottom: 10,
    },
    unlockButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: semanticColors.textOnAccent,
    },
    trialText: {
        fontSize: 11,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        textAlign: 'center',
        lineHeight: 16,
    },

    // — 9. Sticky Footer — paddingBottom applied dynamically via insets
    stickyFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 22,
        paddingTop: 16,
        backgroundColor: semanticColors.canvas,
    },
    ctaButton: {
        backgroundColor: DS.cyan,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
    },
    ctaButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: semanticColors.textOnAccent,
    },
    ctaLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    ctaButtonSub: {
        fontSize: 11,
        fontWeight: '400',
        color: semanticColors.textOnAccent,
        marginTop: 2,
    },
});

export default BriefingScreen;
