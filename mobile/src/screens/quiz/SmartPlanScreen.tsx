import React, { useEffect, useRef } from 'react';
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
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useAuthStore } from '../../stores/authStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlacement } from 'expo-superwall';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PAYWALL_PLACEMENTS } from '../../services/paywall';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================
// Design System — Figma node 180:848
// =============================================
const DS = {
    bg: '#0E0E1F',
    card: '#1C1C2E',
    cardL2: '#15152A',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
    gold: '#FFC400',
    goldMuted: 'rgba(255, 196, 0, 0.5)',
};

// Helper to get goal label
const getGoalLabel = (goal: string): string => {
    const goals: Record<string, string> = {
        '5k': '5km', '10k': '10km', 'half_marathon': '21km',
        'marathon': '42km', 'general_fitness': 'Fitness',
    };
    return goals[goal] || '10km';
};

const getGoalDescription = (goal: string): string => {
    const descriptions: Record<string, string> = {
        '5k': '5km Sub-30', '10k': '10km Sub-50', 'half_marathon': '21km Sub-2h',
        'marathon': '42km Sub-4h', 'general_fitness': 'Fitness Geral',
    };
    return descriptions[goal] || '10km Sub-50';
};

// =============================================
// SVG CHART — Ascending line with gradient fill
// =============================================
const CHART_W = SCREEN_WIDTH - 80; // Inner chart canvas
const CHART_H = 160;

const ProgressChart = () => {
    const animVal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(animVal, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
        }).start();
    }, []);

    // Smooth ascending curve points
    const points = [
        { x: 0, y: 140 },
        { x: CHART_W * 0.15, y: 130 },
        { x: CHART_W * 0.30, y: 115 },
        { x: CHART_W * 0.45, y: 95 },
        { x: CHART_W * 0.60, y: 70 },
        { x: CHART_W * 0.75, y: 45 },
        { x: CHART_W * 0.90, y: 25 },
        { x: CHART_W, y: 10 },
    ];

    // Build SVG path for line
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp1y = points[i - 1].y;
        const cp2x = points[i - 1].x + (points[i].x - points[i - 1].x) * 0.5;
        const cp2y = points[i].y;
        linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i].x} ${points[i].y}`;
    }

    // Build closed path for gradient fill area
    const fillPath = linePath + ` L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

    return (
        <Svg width={CHART_W} height={CHART_H + 10} style={{ marginTop: 10 }}>
            <Defs>
                <SvgLinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={DS.cyan} stopOpacity="0.35" />
                    <Stop offset="1" stopColor={DS.cyan} stopOpacity="0.02" />
                </SvgLinearGradient>
            </Defs>
            {/* Gradient fill under curve */}
            <Path d={fillPath} fill="url(#chartGrad)" />
            {/* Line on top */}
            <Path d={linePath} stroke={DS.cyan} strokeWidth={3} fill="none" strokeLinecap="round" />
            {/* End dot */}
            <SvgCircle cx={CHART_W} cy={10} r={5} fill={DS.cyan} />
        </Svg>
    );
};

// =============================================
// MAIN COMPONENT
// =============================================
export function SmartPlanScreen({ navigation, route }: any) {
    const { data, generatedPlan: storePlan } = useOnboardingStore();
    const isPro = useAuthStore((s) => s.isPro);
    const userId = route?.params?.userId;
    const { registerPlacement } = usePlacement();
    const insets = useSafeAreaInsets();

    // Disable Android hardware back
    useEffect(() => {
        const backAction = () => true;
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => handler.remove();
    }, []);

    // ── Trigger: onboarding_complete ──
    // Registra o placement quando o usuário chega nesta tela (fim do quiz)
    useEffect(() => {
        if (!isPro) {
            console.log('[Paywall] Registrando placement: onboarding_complete');
            registerPlacement({ placement: PAYWALL_PLACEMENTS.ONBOARDING_COMPLETE }).catch((err) =>
                console.warn('[Paywall] Erro ao registrar onboarding_complete:', err),
            );
        }
    }, []);

    // Plan data
    const planData = route?.params?.planData || storePlan;
    const goal = data.goal || '10k';
    const planHeader = planData?.planHeader;
    const nextWorkout = planData?.nextWorkout;

    const objectiveShort = planHeader?.objectiveShort || getGoalLabel(goal);
    const durationWeeks = planHeader?.durationWeeks || `${data.targetWeeks || 12} Sem`;
    const frequencyWeekly = planHeader?.frequencyWeekly || `${data.daysPerWeek || 4}x/Sem`;

    const workoutTitle = nextWorkout?.title || 'Rodagem Leve - 5 km';
    const workoutDuration = nextWorkout?.duration || '35 min';
    const workoutPace = nextWorkout?.paceEstimate || 'Pace 5:30';

    const handleShare = async () => {
        try {
            await Share.share({
                message: `🏃 Meu plano de treino para ${getGoalLabel(goal)} está pronto! RunEasy - Treinamento inteligente de corrida.`,
            });
        } catch { }
    };

    // EXPO_PUBLIC_APP_VARIANT is inlined by the Metro bundler at build time.
    // Plain APP_VARIANT is NOT — process.env lookups without the EXPO_PUBLIC_ prefix
    // are stripped in production/preview EAS builds, which is why the previous
    // bypass silently failed and the "Desbloquear Tudo" button did nothing.
    const isDevBuild =
        __DEV__ ||
        process.env.EXPO_PUBLIC_APP_VARIANT === 'preview' ||
        process.env.EXPO_PUBLIC_APP_VARIANT === 'development';

    const handleUnlockAll = async () => {
        console.log('[SmartPlan] Desbloquear tudo pressed');

        // ── Trigger: view_training_plan ──
        // Se o usuário não for Pro, exibe paywall antes de desbloquear
        if (!isPro) {
            try {
                console.log('[Paywall] Registrando placement: view_training_plan');
                await registerPlacement({ placement: PAYWALL_PLACEMENTS.VIEW_TRAINING_PLAN });
            } catch (err) {
                console.warn('[Paywall] Erro ao registrar view_training_plan:', err);
            }

            // Após o paywall, re-verifica se agora é Pro
            await useAuthStore.getState().syncSubscriptionStatus();
            const nowPro = useAuthStore.getState().isPro;
            if (!nowPro) {
                if (isDevBuild) {
                    console.log('[SmartPlan] DEV/PREVIEW MODE — bypassing paywall, proceeding');
                } else {
                    console.log('[SmartPlan] Usuário não converteu — mantendo na tela');
                    return;
                }
            }
        }

        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
            useAuthStore.getState().setUser({
                ...currentUser,
                onboarding_completed: true,
            });
        }

        setTimeout(() => {
            try {
                navigation.dispatch(
                    CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] })
                );
            } catch { }
        }, 300);

        if (userId) {
            useAuthStore.getState().login(userId).catch(() => { });
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
                        1. HEADER — Flash icon + Title + Share
                        ============================================= */}
                    <View style={styles.topHeader}>
                        <View style={styles.topHeaderLeft}>
                            <MaterialCommunityIcons name="lightning-bolt-circle" size={40} color={DS.cyan} />
                            <Text style={styles.topHeaderTitle}>
                                Planejamento para os {getGoalLabel(goal)}!
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <MaterialCommunityIcons name="share-variant-outline" size={24} color={DS.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* =============================================
                        2. TITLE SECTION
                        ============================================= */}
                    <View style={styles.titleSection}>
                        <Text style={styles.title}>
                            Seu Plano inteligente{'\n'}Está Pronto!
                        </Text>
                        <Text style={styles.subtitle}>
                            Personalizado para sua meta de{'\n'}
                            <Text style={styles.goalHighlight}>{getGoalDescription(goal)}</Text>
                            {' '}com base na sua{'\n'}performance.
                        </Text>
                    </View>

                    {/* =============================================
                        3. METRICS CARD — Single horizontal container
                        ============================================= */}
                    <View style={styles.metricsCard}>
                        <View style={styles.metricCol}>
                            <Text style={styles.metricLabel}>Objetivo</Text>
                            <Text style={styles.metricValue}>{objectiveShort}</Text>
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
                        4. CHART CARD — Animated ascending graph
                        ============================================= */}
                    <View style={styles.chartCard}>
                        {/* Chart Header */}
                        <View style={styles.chartHeader}>
                            <View>
                                <Text style={styles.chartMetaLabel}>Meta</Text>
                                <Text style={styles.chartMetaValue}>{getGoalLabel(goal)}</Text>
                            </View>
                            <View style={styles.chartGainContainer}>
                                <Text style={styles.chartGainValue}>+21KM</Text>
                                <Text style={styles.chartGainSub}>em 3 meses</Text>
                            </View>
                        </View>

                        {/* SVG Chart */}
                        <View style={styles.chartCanvasContainer}>
                            <ProgressChart />
                        </View>

                        {/* Chart labels */}
                        <View style={styles.chartLabelsRow}>
                            <Text style={styles.chartLabelLeft}>Estado Atual</Text>
                            <Text style={styles.chartLabelRight}>Meta Alcançada</Text>
                        </View>
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
                        6. WORKOUTS SECTION — "Seus treinos"
                        ============================================= */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Seus treinos</Text>
                    </View>

                    {/* Workout #1 — ACTIVE */}
                    <View style={styles.workoutCardActive}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #1</Text>
                            <Text style={styles.workoutTitle}>{workoutTitle}</Text>
                            <View style={styles.workoutMetrics}>
                                <View style={styles.wMetricItem}>
                                    <MaterialCommunityIcons name="timer-outline" size={16} color={DS.textSecondary} />
                                    <Text style={styles.wMetricText}>{workoutDuration}</Text>
                                </View>
                                <View style={styles.wMetricItem}>
                                    <MaterialCommunityIcons name="speedometer" size={16} color={DS.textSecondary} />
                                    <Text style={styles.wMetricText}>{workoutPace}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.runnerCircle}>
                            <MaterialCommunityIcons name="run-fast" size={25} color={DS.bg} />
                        </View>
                    </View>

                    {/* Workout #2 — LOCKED */}
                    <View style={styles.workoutCardLocked}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #2</Text>
                            {/* Skeleton placeholder bars */}
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
                        7. AI TIP CARD
                        ============================================= */}
                    <View style={styles.aiTipCard}>
                        <View style={styles.aiTipIconCol}>
                            <MaterialCommunityIcons name="lightbulb-on" size={32} color={DS.cyan} />
                        </View>
                        <View style={styles.aiTipTextCol}>
                            <Text style={styles.aiTipTitle}>Dica do treinador IA</Text>
                            <Text style={styles.aiTipBody}>
                                Baseado em seu pace atual, sua meta de {getGoalLabel(goal)}, seu nível considerado e avaliado, consideramos um primeiro treino com mais cadência, por isso a escolha da Rodagem leve.
                            </Text>
                        </View>
                    </View>

                    {/* =============================================
                        8. PAYWALL SECTION — "Cronograma Completo"
                        ============================================= */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Cronograma Completo</Text>
                        <View style={styles.weeksBadge}>
                            <Text style={styles.weeksBadgeText}>{durationWeeks.replace(' Sem', ' Semanas')}</Text>
                        </View>
                    </View>

                    <View style={styles.paywallCard}>
                        {/* Lock icon circle */}
                        <View style={styles.paywallLockCircle}>
                            <MaterialCommunityIcons name="lock" size={40} color={DS.cyan} />
                        </View>

                        {/* Text section */}
                        <Text style={styles.paywallTitle}>Plano Completo Bloqueado</Text>
                        <Text style={styles.paywallSubtitle}>
                            Desbloqueie seus{' '}
                            <Text style={{ color: DS.cyan, fontWeight: '700' }}>30 treinos, </Text>
                            feedback{'\n'}de IA e recursos completos.
                        </Text>

                        {/* Unlock button inside paywall card */}
                        <View style={styles.paywallButtonArea}>
                            <TouchableOpacity
                                style={styles.unlockButton}
                                onPress={handleUnlockAll}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.unlockButtonText}>Desbloquear Tudo</Text>
                                <MaterialCommunityIcons name="arrow-right" size={22} color={DS.bg} />
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
                    style={styles.ctaButton}
                    onPress={handleUnlockAll}
                    activeOpacity={0.85}
                >
                    <Text style={styles.ctaButtonText}>ATIVAR MEU PLANO AGORA</Text>
                    <Text style={styles.ctaButtonSub}>Acesso imediato ao seu melhor nível!</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// =============================================
// STYLES — Figma node 180:848
// =============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: DS.bg,
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
        color: DS.textSecondary,
        lineHeight: 24,
    },
    goalHighlight: {
        color: DS.cyan,
    },

    // — 3. Metrics Card (single horizontal bar) —
    metricsCard: {
        flexDirection: 'row',
        backgroundColor: DS.card,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        // Figma shadow
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
        color: DS.textSecondary,
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
        color: DS.textSecondary,
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
        color: DS.textSecondary,
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
        color: DS.textSecondary,
    },
    chartLabelRight: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.cyan,
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
        // Figma gold glow
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
        // Glow
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
        color: DS.textSecondary,
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
        color: DS.textSecondary,
    },
    runnerCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: DS.cyan,
        alignItems: 'center',
        justifyContent: 'center',
        // Glow
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
        // Cyan glow
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
        color: DS.textSecondary,
    },
    paywallCard: {
        backgroundColor: DS.cardL2,
        borderRadius: 15,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: DS.glassBorder,
        marginBottom: 20,
        // Shadow
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
        backgroundColor: DS.bg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        // Cyan glow
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
        color: DS.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    paywallButtonArea: {
        width: '100%',
        backgroundColor: DS.bg,
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
        color: DS.bg,
    },
    trialText: {
        fontSize: 11,
        fontWeight: '500',
        color: DS.textSecondary,
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
        backgroundColor: DS.bg,
    },
    ctaButton: {
        backgroundColor: DS.cyan,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        // Cyan glow
        shadowColor: '#33cfff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 4,
    },
    ctaButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: DS.bg,
    },
    ctaButtonSub: {
        fontSize: 11,
        fontWeight: '400',
        color: DS.bg,
        marginTop: 2,
    },
});

export default SmartPlanScreen;
