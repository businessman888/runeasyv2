import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    Platform,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
    FadeIn,
} from 'react-native-reanimated';
import { useOnboardingStore } from '../stores/onboardingStore';

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
import { ReferralCodeScreen } from './quiz/ReferralCodeScreen';
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
import { TouchableOpacity } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Back chevron lives to the left of the progress bar; its footprint is always
// reserved so the bar width stays constant between steps.
const CHEVRON_SIZE = 44;
const PROGRESS_ROW_GAP = 8;

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
// Inner content width is SCREEN_WIDTH - 48; the chevron + gap eat into it so the
// bar is a bit shorter than before, per the new back-button placement.
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48 - CHEVRON_SIZE - PROGRESS_ROW_GAP;

// ============================================
// ANIMATED PROGRESS BAR
// ============================================
interface AnimatedProgressBarProps {
    fraction: number; // 0..1
}

const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({ fraction }) => {
    const widthSv = useSharedValue(0);
    const shimmerX = useSharedValue(-PROGRESS_TRACK_WIDTH);

    useEffect(() => {
        widthSv.value = withTiming(
            Math.max(0, Math.min(1, fraction)) * PROGRESS_TRACK_WIDTH,
            { duration: 600, easing: Easing.out(Easing.cubic) },
        );
    }, [fraction, widthSv]);

    useEffect(() => {
        // Shimmer loops left → right indefinitely
        const loop = () => {
            shimmerX.value = -PROGRESS_TRACK_WIDTH;
            shimmerX.value = withTiming(
                PROGRESS_TRACK_WIDTH,
                { duration: 2200, easing: Easing.inOut(Easing.cubic) },
                (finished) => {
                    if (finished) runOnJS(loop)();
                },
            );
        };
        loop();
    }, [shimmerX]);

    const fillStyle = useAnimatedStyle(() => ({ width: widthSv.value }));
    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmerX.value }],
    }));

    return (
        <View style={progressStyles.track}>
            <Animated.View style={[progressStyles.fill, fillStyle]}>
                <Animated.View style={[progressStyles.shimmer, shimmerStyle]} />
            </Animated.View>
        </View>
    );
};

const progressStyles = StyleSheet.create({
    track: {
        width: PROGRESS_TRACK_WIDTH,
        height: 4,
        backgroundColor: FORCED_GLASS_STROKE,
        borderRadius: 20,
        overflow: 'hidden',
    },
    fill: {
        height: 4,
        backgroundColor: FORCED_CYAN,
        borderRadius: 20,
        overflow: 'hidden',
    },
    shimmer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 60,
        backgroundColor: 'rgba(255,255,255,0.4)',
        opacity: 0.5,
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
    extraPropsKey?: string;
}

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
    { key: 'preferredWearable', Component: WearableConnectionScreen, isWearableStep: true },
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
    const scrollViewRef = useRef<ScrollView>(null);
    const insets = useSafeAreaInsets();

    const isRaceGoal = data.goal_type === 'race';

    const activeSteps = useMemo(() => {
        return ALL_QUIZ_STEPS.filter((step) => {
            if (step.key === 'goal' && isRaceGoal) return false;           // distance objective
            if (step.key === 'racePicker' && !isRaceGoal) return false;    // race picker
            if (step.key === 'manualRaceDate' && !(isRaceGoal && data.use_manual_race_date)) return false;
            if (step.key === 'goalTimeframe' && isRaceGoal) return false;  // horizon = race date
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
            case 'referralCode': return true; // optional — user can always skip
            default: return false;
        }
    };

    // Track XP credited per step index, so back-and-forth doesn't double-pay
    const xpCreditedRef = useRef<Set<number>>(new Set());

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

        // Last index → completion bonus + navigate
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
        // Advance to the referral-code step (the new last index). Completion
        // bonus is now awarded only when the user clicks Continue on that step.
        setCurrentStep(safeStep + 1);
    };

    const handleWearableConnect = () => {
        // User picked a provider in the modal → award per-question XP and
        // advance to the referral-code step. Completion bonus + navigation to
        // Quiz_PlanLoading happen from handleContinue at the final step.
        if (!xpCreditedRef.current.has(safeStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(safeStep);
        }
        setCurrentStep(safeStep + 1);
    };

    const handleWearableModalClose = () => {
        setWearableModalOpen(false);
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
                <View style={headerStyles.container}>
                    <View style={headerStyles.topRow}>
                        <Text style={headerStyles.pontuacaoText}>Pontuação</Text>
                        <AnimatedXP value={xpEarned} />
                    </View>
                    <View style={headerStyles.progressRow}>
                        <TouchableOpacity
                            style={headerStyles.backChevron}
                            onPress={handleBack}
                            disabled={!showBackButton}
                            hitSlop={8}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="Voltar"
                        >
                            <Ionicons
                                name="chevron-back"
                                size={24}
                                color={showBackButton ? FORCED_TEXT : 'transparent'}
                            />
                        </TouchableOpacity>
                        <AnimatedProgressBar fraction={progressFraction} />
                    </View>
                    <View style={headerStyles.progressTextRow}>
                        <Text style={headerStyles.progressLabel}>Progresso:</Text>
                        <Text style={headerStyles.progressPercent}>
                            {Math.round(progressFraction * 100)}%
                        </Text>
                    </View>
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
            >
                {/*
                    Key change forces remount on step transition. Reanimated's
                    `entering` runs only on mount, so the new step fades in cleanly
                    from opacity 0 — no blink-to-empty-then-back like withSequence.
                */}
                <Animated.View
                    key={`step-${currentStep}`}
                    entering={FadeIn.duration(260).easing(Easing.out(Easing.cubic))}
                >
                    {isInterstitial ? (
                        <StepComponent />
                    ) : (
                        <StepComponent
                            {...(currentStepData.keys ? getValue() : { value: getValue() })}
                            onChange={handleChange}
                            onAdvance={handleContinue}
                            {...extraProps}
                            {...wearableProps}
                        />
                    )}
                </Animated.View>
            </ScrollView>

            <View style={[styles.buttonContainer, { paddingBottom: bottomInset }]}>
                {isWearableStep ? (
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
    container: { width: '100%', alignItems: 'center', gap: 9, paddingHorizontal: 12 },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        height: 43,
    },
    pontuacaoText: { fontFamily: 'Poppins-Regular', fontSize: 14, color: FORCED_TEXT },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        gap: PROGRESS_ROW_GAP,
    },
    backChevron: {
        width: CHEVRON_SIZE,
        height: CHEVRON_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -10, // optically align the chevron glyph to the edge
    },
    progressTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        height: 28,
        gap: 4,
        paddingLeft: CHEVRON_SIZE + PROGRESS_ROW_GAP, // align under the bar start
    },
    progressLabel: {
        fontFamily: 'Poppins-Regular',
        fontSize: 11,
        color: FORCED_TEXT_SECONDARY,
    },
    progressPercent: {
        fontFamily: 'Inter-Bold',
        fontSize: 11,
        fontWeight: '700',
        color: FORCED_CYAN,
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
