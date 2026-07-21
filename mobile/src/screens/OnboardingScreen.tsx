import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    Platform,
    Dimensions,
    TouchableOpacity,
    Keyboard,
    AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    FadeIn,
} from 'react-native-reanimated';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useCoachStore } from '../stores/coachStore';

// Question screens
import { ObjectiveScreen } from './quiz/ObjectiveScreen';
import { LevelScreen } from './quiz/LevelScreen';
import { FrequencyScreen } from './quiz/FrequencyScreen';
import { PaceConfirmScreen } from './quiz/PaceConfirmScreen';
import { LimitationsScreen } from './quiz/LimitationsScreen';
import { BirthDateScreen } from './quiz/BirthDateScreen';
import { WeightScreen } from './quiz/WeightScreen';
import { HeightScreen } from './quiz/HeightScreen';
import { AvailableDaysScreen } from './quiz/AvailableDaysScreen';
import { IntenseDayScreen } from './quiz/IntenseDayScreen';
import { RecentDistanceScreen } from './quiz/RecentDistanceScreen';
import { DistanceTimeScreen } from './quiz/DistanceTimeScreen';
import { StartDateScreen } from './quiz/StartDateScreen';
import { GoalTimeframeScreen } from './quiz/GoalTimeframeScreen';
import { WearableConnectionScreen } from './quiz/WearableConnectionScreen';
import { AudioCoachScreen } from './quiz/AudioCoachScreen';
import { ReferralCodeScreen } from './quiz/ReferralCodeScreen';
import { TestimonialsScreen } from './quiz/TestimonialsScreen';
import { GoalTypeScreen } from './quiz/GoalTypeScreen';
import { RacePickerScreen } from './quiz/RacePickerScreen';
import { ManualRaceDateScreen } from './quiz/ManualRaceDateScreen';

// Interstitial screens
import { GoalAchievableScreen } from './quiz/GoalAchievableScreen';
import { AssessoriaCompareScreen } from './quiz/AssessoriaCompareScreen';
import { TimeCompareScreen } from './quiz/TimeCompareScreen';

import { FixedNavigationButtons } from '../components/FixedNavigationButtons';
import { AnimatedXP } from '../components/AnimatedXP';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Back arrow sits to the left of the progress bar on a single clean row.
const CHEVRON_SIZE = 32;

// ============================================
// FORCED COLORS (Figma exact values)
// ============================================
const FORCED_BG = '#0F0F1E';
const FORCED_BG_DEEP = '#0A0A18';
const FORCED_CYAN = '#00D4FF';
const FORCED_TEXT = '#EBEBF5';
const FORCED_TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)';
const FORCED_GLASS_STROKE = 'rgba(235, 235, 245, 0.1)';

// XP economy
const XP_PER_QUESTION = 5;        // ~15 questions × 5 = 75
const XP_COMPLETION_BONUS = 25;   // total ≈ 100

// Subtle slide-fade for each step (enters from +24px X). Reduce-motion users get
// a plain quick fade instead (see reduceMotion below).
function slideFadeEntering() {
    'worklet';
    return {
        initialValues: { opacity: 0, transform: [{ translateX: 24 }] },
        animations: {
            opacity: withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
            transform: [
                { translateX: withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }) },
            ],
        },
    };
}

// ============================================
// ANIMATED PROGRESS BAR
// ============================================
interface AnimatedProgressBarProps {
    fraction: number; // 0..1
}

const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({ fraction }) => {
    // Percentage-based fill so the track can flex to fill the row (clean, premium,
    // no fixed width to keep in sync with the layout).
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(
            Math.max(0, Math.min(1, fraction)),
            { duration: 500, easing: Easing.out(Easing.cubic) },
        );
    }, [fraction, progress]);

    const fillStyle = useAnimatedStyle(() => ({
        width: `${progress.value * 100}%`,
    }));

    return (
        <View style={progressStyles.track}>
            <Animated.View style={[progressStyles.fill, fillStyle]} />
        </View>
    );
};

const progressStyles = StyleSheet.create({
    track: {
        flex: 1,
        height: 8,
        backgroundColor: FORCED_GLASS_STROKE,
        borderRadius: 999,
        overflow: 'hidden',
    },
    fill: {
        height: 8,
        backgroundColor: FORCED_CYAN,
        borderRadius: 999,
        minWidth: 8,
    },
});

// ============================================
// QUIZ STEPS
// ============================================
interface QuizStep {
    key: string;
    keys?: string[];
    Component: React.ComponentType<any>;
    isInterstitial?: boolean;
    isWearableStep?: boolean;
    isCoachStep?: boolean;
    extraPropsKey?: string;
}

// Depoimentos ocultos do onboarding (não renderizados). Manter false até reabilitar.
// A construção da TestimonialsScreen é preservada; apenas removemos a step do array ativo.
const SHOW_TESTIMONIALS = false;

// Step de código de indicação (referral) oculta para conformidade com a Guideline
// 3.1.1 da Apple: a variante de paywall com desconto por código foi desativada, e
// a tela promovia um benefício. Mesmo padrão dos depoimentos — o componente e o
// endpoint de atribuição (POST /referral/apply) permanecem intactos no código;
// apenas removemos a step do fluxo ativo. Reativar (Fase 2, via Offer Codes da
// Apple) é só voltar para true.
const SHOW_REFERRAL = false;

// Full step catalogue. The active subset is computed per-render from the user's
// goal_type / use_manual_race_date (see activeSteps below). Everything up to and
// including 'goal_type' is common to both paths, so currentStep stays valid when
// the user toggles their goal type.
const ALL_QUIZ_STEPS: QuizStep[] = [
    { key: 'birthDate', Component: BirthDateScreen },
    { key: 'weight', Component: WeightScreen },
    { key: 'height', Component: HeightScreen },
    { key: 'goal_type', Component: GoalTypeScreen },                                          // NEW — meta principal
    { key: 'goal', Component: ObjectiveScreen },                                              // distance path only
    { key: 'racePicker', Component: RacePickerScreen },                                       // race path only
    { key: 'manualRaceDate', Component: ManualRaceDateScreen },                               // race + manual only
    { key: 'experience_level', Component: LevelScreen },
    { key: '__i1_goal_achievable', Component: GoalAchievableScreen, isInterstitial: true },
    { key: 'daysPerWeek', Component: FrequencyScreen },
    { key: '__i2_assessoria_compare', Component: AssessoriaCompareScreen, isInterstitial: true },
    { key: 'availableDays', Component: AvailableDaysScreen, extraPropsKey: 'availableDays' },
    { key: 'intenseDayIndex', Component: IntenseDayScreen, extraPropsKey: 'intenseDay' },
    { key: 'recentDistance', Component: RecentDistanceScreen },
    { key: 'distanceTime', Component: DistanceTimeScreen, extraPropsKey: 'distanceTime' },
    { key: '__i3_time_compare', Component: TimeCompareScreen, isInterstitial: true },
    { keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'], key: 'pace', Component: PaceConfirmScreen },
    { key: 'startDate', Component: StartDateScreen },
    { key: 'limitations', Component: LimitationsScreen },
    { key: 'goalTimeframe', Component: GoalTimeframeScreen },                                 // skipped on race path
    { key: 'audioCoach', Component: AudioCoachScreen, isCoachStep: true },                    // opt-in do coach de áudio (antes do device)
    { key: 'preferredWearable', Component: WearableConnectionScreen, isWearableStep: true },
    { key: '__i_testimonials', Component: TestimonialsScreen, isInterstitial: true },
    {
        keys: ['referralCode', 'referralInfluencerId'],
        key: 'referralCode',
        Component: ReferralCodeScreen,
    },
];

export function OnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData, xpEarned, addXP } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const [wearableModalOpen, setWearableModalOpen] = useState(false);
    const [reduceMotion, setReduceMotion] = useState(false);
    // Lets a child (e.g. the height ruler) lock the parent scroll while dragging,
    // so vertical pans don't fight the ScrollView and feel "stuck".
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const scrollViewRef = useRef<ScrollView>(null);
    const insets = useSafeAreaInsets();

    const isRaceGoal = data.goal_type === 'race';

    const activeSteps = useMemo(() => {
        return ALL_QUIZ_STEPS.filter((step) => {
            if (step.key === 'goal' && isRaceGoal) return false;           // distance objective
            if (step.key === 'racePicker' && !isRaceGoal) return false;    // race picker
            if (step.key === 'manualRaceDate' && !(isRaceGoal && data.use_manual_race_date)) return false;
            if (step.key === 'goalTimeframe' && isRaceGoal) return false;  // horizon = race date
            if (step.key === '__i_testimonials' && !SHOW_TESTIMONIALS) return false; // depoimentos ocultos
            if (step.key === 'referralCode' && !SHOW_REFERRAL) return false; // referral oculto (Apple 3.1.1)
            return true;
        });
    }, [isRaceGoal, data.use_manual_race_date]);

    const TOTAL_QUESTIONS = activeSteps.filter(s => !s.isInterstitial).length;
    const TOTAL_INDICES = activeSteps.length;

    // Clamp currentStep in case the active list shrank under us.
    const safeStep = Math.min(currentStep, TOTAL_INDICES - 1);
    const currentStepData = activeSteps[safeStep];

    // displayedStep counts only real questions up to (and including) the current one.
    const displayedStep = activeSteps.slice(0, safeStep + 1)
        .filter(s => !s.isInterstitial).length;
    const progressFraction = displayedStep / TOTAL_QUESTIONS;

    useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => sub.remove();
    }, []);

    useEffect(() => {
        // Dismiss the keyboard between steps so a lingering input focus (e.g. the
        // race search field) doesn't swallow the first tap on the next step.
        Keyboard.dismiss();
        setScrollEnabled(true);
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, [currentStep]);

    const canContinue = (): boolean => {
        if (currentStepData.isInterstitial) return true;
        switch (currentStepData.key) {
            case 'birthDate': return !!data.birthDate;
            case 'weight': return !!data.weight && data.weight > 0;
            case 'height': return !!data.height && data.height > 0;
            case 'goal': return !!data.goal;
            case 'goal_type': return !!data.goal_type;
            case 'racePicker': return !!data.race_id || !!data.race_date;
            case 'manualRaceDate': return !!data.race_date && !!data.race_distance;
            case 'experience_level': return !!data.experience_level;
            case 'daysPerWeek':
                return typeof data.daysPerWeek === 'number'
                    && data.daysPerWeek >= 2
                    && data.daysPerWeek <= 7;
            case 'availableDays':
                return Array.isArray(data.availableDays) && data.availableDays.length > 0;
            case 'intenseDayIndex':
                return data.intenseDayIndex !== null && data.intenseDayIndex !== undefined;
            case 'recentDistance': return !!data.recentDistance;
            case 'distanceTime':
                return !!data.distanceTime
                    && (data.distanceTime.hours > 0
                        || data.distanceTime.minutes > 0
                        || data.distanceTime.seconds > 0);
            case 'pace':
                return data.dontKnowPace === true
                    || (!!data.paceMinutes && !!data.paceSeconds);
            case 'startDate': return !!data.startDate;
            case 'limitations':
                return !!data.limitations
                    && typeof data.limitations.hasLimitation === 'boolean';
            case 'goalTimeframe':
                return typeof data.goalTimeframe === 'number' && data.goalTimeframe > 0;
            case 'preferredWearable': return true;
            case 'audioCoach': return true; // footer é Ativar/Agora não (não usa Continuar)
            case 'referralCode': return true; // optional — user can always skip
            default: return false;
        }
    };

    // Track XP credited per step index, so back-and-forth doesn't double-pay
    const xpCreditedRef = useRef<Set<number>>(new Set());

    // Advance to the next step, or finish the quiz when this is the last active
    // step. Centralizes the "am I the last step?" logic so it stays correct as
    // the active list shrinks — hiding later steps (referral, testimonials) can
    // make a non-Continue step (e.g. the wearable Yes/No step) the last one,
    // which would otherwise run off the end and never reach Quiz_PlanLoading.
    const advanceOrFinish = () => {
        if (safeStep === TOTAL_INDICES - 1) {
            if (!xpCreditedRef.current.has(-1)) {
                addXP(XP_COMPLETION_BONUS);
                xpCreditedRef.current.add(-1);
            }
            navigation.navigate('Quiz_PlanLoading', { userId });
            return;
        }
        setCurrentStep(safeStep + 1);
    };

    const handleContinue = () => {
        // Pace calculation when leaving DistanceTime (key-based — interstitials shifted indices)
        if (currentStepData.key === 'distanceTime' && data.distanceTime && data.recentDistance) {
            const { hours, minutes, seconds } = data.distanceTime;
            const totalMinutes = hours * 60 + minutes + seconds / 60;
            let pacePerKm = totalMinutes / data.recentDistance;

            if (pacePerKm > 15) {
                console.warn(`[Pace] ${pacePerKm.toFixed(2)} min/km is unrealistic, defaulting to 7.0`);
                pacePerKm = 7.0;
            } else if (pacePerKm < 2) {
                console.warn(`[Pace] ${pacePerKm.toFixed(2)} min/km is impossibly fast, clamping to 3.0`);
                pacePerKm = 3.0;
            }

            updateData({ calculatedPace: pacePerKm });
            const wholeMinutes = Math.floor(pacePerKm);
            const remainderSeconds = Math.round((pacePerKm - wholeMinutes) * 60);
            updateData({
                paceMinutes: String(wholeMinutes).padStart(2, '0'),
                paceSeconds: String(remainderSeconds).padStart(2, '0'),
                dontKnowPace: false,
            });
        }

        // Award XP for completing this question (idempotent per index)
        if (!currentStepData.isInterstitial && !xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }

        // Advance, or finish the quiz if this is the last active step.
        advanceOrFinish();
    };

    const handleBack = () => {
        if (safeStep > 0) {
            setCurrentStep(safeStep - 1);
        } else {
            navigation.goBack();
        }
    };

    const handleWearableYes = () => {
        setWearableModalOpen(true);
    };

    const handleWearableNo = () => {
        updateData({ preferredWearable: null });
        if (!xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }
        // Advance, or finish the quiz if the wearable step is the last active one
        // (it can be now that referral/testimonials are hidden — this step uses
        // its own Yes/No buttons, not the Continue button).
        advanceOrFinish();
    };

    const handleWearableConnect = () => {
        // User picked a provider in the modal → award per-question XP and advance.
        // If the wearable step is the last active one (referral hidden), finish
        // the quiz here (this step uses Yes/No buttons, not the Continue button).
        if (!xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }
        advanceOrFinish();
    };

    const handleWearableModalClose = () => {
        setWearableModalOpen(false);
    };

    // Coach de áudio — espelha o padrão da wearable (footer próprio + XP + advance).
    // Só liga a PREFERÊNCIA (mesmo estado do card no Profile). Não verifica TTS, não
    // concede Pro (entitlement é checado no disparo do áudio, não aqui).
    const handleCoachYes = () => {
        useCoachStore.getState().setEnabled(true);
        if (!xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }
        advanceOrFinish();
    };

    const handleCoachNo = () => {
        // "Agora não": avança e deixa a preferência no default OFF (sem modal, sem
        // insistência). Dá pra ligar depois pelo Profile normalmente.
        if (!xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }
        advanceOrFinish();
    };

    const handleChange = useCallback((value: any) => {
        if (currentStepData.keys) {
            updateData(value);
        } else if (currentStepData.key === 'goal_type' && value === 'distance') {
            // Switching back to a distance goal clears any race selection so a
            // stale race_id doesn't leak into the distance plan.
            updateData({
                goal_type: 'distance',
                race_id: null,
                race_date: null,
                race_name: null,
                race_distance: null,
                use_manual_race_date: false,
            });
        } else if (currentStepData.key) {
            updateData({ [currentStepData.key]: value });
        }
    }, [currentStepData, updateData]);

    const getValue = () => {
        if (currentStepData.keys) {
            const result: any = {};
            for (const k of currentStepData.keys) {
                result[k] = data[k as keyof typeof data];
            }
            return result;
        } else if (currentStepData.key) {
            return data[currentStepData.key as keyof typeof data];
        }
        return undefined;
    };

    const getExtraProps = (): Record<string, any> => {
        switch (currentStepData.extraPropsKey) {
            case 'availableDays':
                return { maxDays: data.daysPerWeek || 3 };
            case 'intenseDay':
                return { availableDays: data.availableDays || [] };
            case 'distanceTime':
                return {
                    distance: data.recentDistance || 5,
                    recentDistance: data.recentDistance || 5,
                };
            default:
                return {};
        }
    };

    const isWearableStep = !!currentStepData.isWearableStep;
    const isCoachStep = !!currentStepData.isCoachStep;
    const isInterstitial = !!currentStepData.isInterstitial;
    const showBackButton = safeStep > 0;
    const continueDisabled = !canContinue();
    const isLastStep = safeStep === TOTAL_INDICES - 1;

    const StepComponent = currentStepData.Component;
    const extraProps = getExtraProps();

    const wearableProps = isWearableStep
        ? {
            openModal: wearableModalOpen,
            onModalClose: handleWearableModalClose,
            onConnect: handleWearableConnect,
        }
        : {};

    const FOOTER_RESERVED_HEIGHT = 100;
    const bottomInset = Math.max(insets.bottom, 12);
    const topInset = Math.max(
        insets.top,
        Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12,
    );

    return (
        <View style={styles.container}>
            <StatusBar
                barStyle="light-content"
                translucent
                backgroundColor="transparent"
            />

            {/* Vertical premium gradient — base */}
            <LinearGradient
                colors={[FORCED_BG, FORCED_BG_DEEP, FORCED_BG]}
                locations={[0, 0.5, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
            />
            {/* Subtle radial-feel cyan glow at the top */}
            <LinearGradient
                colors={['rgba(0,212,255,0.07)', 'transparent']}
                locations={[0, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.topGlow}
                pointerEvents="none"
            />

            <View style={[styles.headerContainer, { paddingTop: topInset + 8 }]}>
                <View style={headerStyles.row}>
                    <TouchableOpacity
                        style={headerStyles.backChevron}
                        onPress={handleBack}
                        disabled={!showBackButton}
                        hitSlop={12}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Ionicons
                            name="arrow-back"
                            size={24}
                            color={showBackButton ? FORCED_TEXT : 'transparent'}
                        />
                    </TouchableOpacity>
                    <AnimatedProgressBar fraction={progressFraction} />
                    <AnimatedXP value={xpEarned} />
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: FOOTER_RESERVED_HEIGHT + bottomInset },
                ]}
                showsVerticalScrollIndicator={false}
                scrollEnabled={scrollEnabled}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
            >
                {/*
                    Key change forces remount on step transition. Reanimated's
                    `entering` runs only on mount, so the new step fades in cleanly
                    from opacity 0 — no blink-to-empty-then-back like withSequence.
                */}
                <Animated.View
                    key={`step-${currentStep}`}
                    entering={reduceMotion ? FadeIn.duration(150) : slideFadeEntering}
                >
                    {isInterstitial ? (
                        <StepComponent />
                    ) : (
                        <StepComponent
                            {...(currentStepData.keys ? getValue() : { value: getValue() })}
                            onChange={handleChange}
                            onAdvance={handleContinue}
                            onLockScroll={() => setScrollEnabled(false)}
                            onUnlockScroll={() => setScrollEnabled(true)}
                            {...extraProps}
                            {...wearableProps}
                        />
                    )}
                </Animated.View>
            </ScrollView>

            <View style={[styles.buttonContainer, { paddingBottom: bottomInset }]}>
                {isCoachStep ? (
                    <FixedNavigationButtons
                        variant="primarySecondary"
                        onYes={handleCoachYes}
                        onNo={handleCoachNo}
                        yesLabel="Ativar / habilitar coach"
                        noLabel="Agora não"
                    />
                ) : isWearableStep ? (
                    <FixedNavigationButtons
                        variant="yesNo"
                        onYes={handleWearableYes}
                        onNo={handleWearableNo}
                    />
                ) : (
                    <FixedNavigationButtons
                        onBack={handleBack}
                        onContinue={handleContinue}
                        showBack={showBackButton}
                        continueDisabled={continueDisabled}
                        isLastStep={isLastStep}
                    />
                )}
            </View>
        </View>
    );
}

const headerStyles = StyleSheet.create({
    // Single clean row: [← back] [progress bar (flex)] [XP pill]
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        gap: 12,
        paddingHorizontal: 4,
    },
    backChevron: {
        width: CHEVRON_SIZE,
        height: CHEVRON_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -6, // optically align the arrow glyph to the edge
    },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: FORCED_BG,
    },
    topGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 280,
    },
    headerContainer: {
        paddingHorizontal: 12,
        paddingBottom: 16,
        backgroundColor: 'transparent',
    },
    scrollView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: FORCED_BG,
        paddingHorizontal: 12,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: FORCED_GLASS_STROKE,
    },
});
