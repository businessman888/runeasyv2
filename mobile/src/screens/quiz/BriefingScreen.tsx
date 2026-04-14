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
    Alert,
} from 'react-native';
// CommonActions removed — AppNavigator handles transition via onboarding_completed state
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useAuthStore } from '../../stores/authStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle as SvgCircle } from 'react-native-svg';
import { usePlacement } from 'expo-superwall';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PAYWALL_PLACEMENTS } from '../../services/paywall';
import {
    Archetype,
    getGoalLabel,
    getGoalDescription,
    getGoalGainText,
    formatPace,
} from '../../utils/archetypes';

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
// MAIN COMPONENT
// =============================================
export function BriefingScreen({ navigation, route }: any) {
    const { data } = useOnboardingStore();
    const { saveOnboardingOnly } = useOnboardingStore();
    const isPro = useAuthStore((s) => s.isPro);
    const userId = route?.params?.userId;
    const archetype: Archetype = route?.params?.archetype;
    const { registerPlacement } = usePlacement();
    const insets = useSafeAreaInsets();

    // Disable Android hardware back
    useEffect(() => {
        const backAction = () => true;
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => handler.remove();
    }, []);

    // Trigger onboarding_complete placement on mount (for analytics)
    useEffect(() => {
        if (!isPro) {
            registerPlacement({ placement: PAYWALL_PLACEMENTS.ONBOARDING_COMPLETE }).catch((err: Error) =>
                console.warn('[Paywall] Erro ao registrar onboarding_complete:', err),
            );
        }
    }, []);

    // Data from quiz
    const goal = data.goal || '10k';
    const goalTimeframe = data.goalTimeframe || 3;
    const daysPerWeek = data.daysPerWeek || 4;
    const paceMinutes = data.paceMinutes || '7';
    const paceSeconds = data.paceSeconds || '00';
    const paceDisplay = formatPace(paceMinutes, paceSeconds);
    const durationWeeks = `${(goalTimeframe) * 4} Sem`;
    const frequencyWeekly = `${daysPerWeek}x/Sem`;

    // Archetype data
    const accentColor = archetype?.accentColor || DS.cyan;
    const chartPoints = archetype?.chartPoints || [140, 130, 115, 95, 70, 45, 25, 10];
    const sampleWorkout = archetype?.sampleWorkout || {
        title: 'Rodagem Leve - 5 km',
        duration: '35 min',
        pace: 'Pace 5:30',
        type: 'easy_run',
    };

    const handleShare = async () => {
        try {
            await Share.share({
                message: `🏃 Meu plano de treino "${archetype?.name}" para ${getGoalLabel(goal)} está pronto! RunEasy - Treinamento inteligente de corrida.`,
            });
        } catch { }
    };

    // EXPO_PUBLIC_APP_VARIANT is inlined by Metro at build time; a plain APP_VARIANT
    // lookup is stripped by the bundler in EAS preview/production builds.
    const isDevBuild =
        __DEV__ ||
        process.env.EXPO_PUBLIC_APP_VARIANT === 'preview' ||
        process.env.EXPO_PUBLIC_APP_VARIANT === 'development';

    const handleConfirmAndStart = async () => {
        // If not Pro, show paywall
        if (!isPro) {
            try {
                await registerPlacement({ placement: PAYWALL_PLACEMENTS.VIEW_TRAINING_PLAN });
            } catch (err) {
                console.warn('[Paywall] Erro ao registrar view_training_plan:', err);
            }

            // Re-check subscription status after paywall
            await useAuthStore.getState().syncSubscriptionStatus();
            const nowPro = useAuthStore.getState().isPro;
            if (!nowPro) {
                // In dev/preview builds, bypass paywall so we can test the full flow
                if (isDevBuild) {
                    console.log('[BriefingScreen] DEV/PREVIEW MODE — bypassing paywall, proceeding as Pro');
                } else {
                    return; // User didn't subscribe, stay on screen
                }
            }
        }

        // User is Pro — save onboarding data to backend (NO AI generation)
        try {
            const saved = await saveOnboardingOnly();
            if (!saved) {
                Alert.alert('Erro', 'Não foi possível salvar seus dados. Tente novamente.');
                return;
            }
        } catch (err) {
            console.error('[BriefingScreen] Failed to save onboarding:', err);
            Alert.alert('Erro', 'Não foi possível salvar seus dados. Tente novamente.');
            return;
        }

        // Update local user state — AppNavigator reacts to onboarding_completed
        // and automatically transitions from onboarding stack to main stack.
        // No manual navigation.reset or login needed (those caused double-mount).
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
                                name={(archetype?.icon || 'lightning-bolt-circle') as any}
                                size={40}
                                color={accentColor}
                            />
                            <Text style={[styles.topHeaderTitle, { color: accentColor }]}>
                                {archetype?.name || 'Plano Personalizado'}
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
                            <Text style={{ color: accentColor }}>{archetype?.name}</Text>
                        </Text>
                        <Text style={styles.subtitle}>
                            Com seu pace de{' '}
                            <Text style={styles.goalHighlight}>{paceDisplay} min/km</Text>
                            {' '}e meta de{' '}
                            <Text style={styles.goalHighlight}>{getGoalDescription(goal)}</Text>
                            , estruturamos sua jornada de{' '}
                            <Text style={styles.goalHighlight}>{goalTimeframe} {goalTimeframe === 1 ? 'mês' : 'meses'}</Text>.
                        </Text>
                        <Text style={styles.tagline}>{archetype?.tagline}</Text>
                    </View>

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
                                    {getGoalGainText(goal, goalTimeframe)}
                                </Text>
                                <Text style={styles.chartGainSub}>progressão estimada</Text>
                            </View>
                        </View>

                        <View style={styles.chartCanvasContainer}>
                            <ProgressChart chartPoints={chartPoints} accentColor={accentColor} />
                        </View>

                        <View style={styles.chartLabelsRow}>
                            <Text style={styles.chartLabelLeft}>Estado Atual</Text>
                            <Text style={[styles.chartLabelRight, { color: accentColor }]}>Meta Alcançada</Text>
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
                        6. WORKOUTS SECTION
                        ============================================= */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Seus treinos</Text>
                    </View>

                    {/* Workout #1 — ACTIVE (archetype sample) */}
                    <View style={[styles.workoutCardActive, { borderColor: accentColor + '50', shadowColor: accentColor + '50' }]}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #1</Text>
                            <Text style={[styles.workoutTitle, { color: accentColor }]}>{sampleWorkout.title}</Text>
                            <View style={styles.workoutMetrics}>
                                <View style={styles.wMetricItem}>
                                    <MaterialCommunityIcons name="timer-outline" size={16} color={DS.textSecondary} />
                                    <Text style={styles.wMetricText}>{sampleWorkout.duration}</Text>
                                </View>
                                <View style={styles.wMetricItem}>
                                    <MaterialCommunityIcons name="speedometer" size={16} color={DS.textSecondary} />
                                    <Text style={styles.wMetricText}>{sampleWorkout.pace}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={[styles.runnerCircle, { backgroundColor: accentColor }]}>
                            <MaterialCommunityIcons name="run-fast" size={25} color={DS.bg} />
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
                                {archetype?.coachTip || 'Baseado no seu perfil, criamos um plano otimizado para seus objetivos.'}
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
                                style={[styles.unlockButton, { backgroundColor: accentColor }]}
                                onPress={handleConfirmAndStart}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.unlockButtonText}>Confirmar e Iniciar</Text>
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
                    style={[styles.ctaButton, { backgroundColor: accentColor }]}
                    onPress={handleConfirmAndStart}
                    activeOpacity={0.85}
                >
                    <Text style={styles.ctaButtonText}>CONFIRMAR E INICIAR</Text>
                    <Text style={styles.ctaButtonSub}>Acesso imediato ao seu melhor nível!</Text>
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
    tagline: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.textSecondary,
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

export default BriefingScreen;
