import React, { useRef, useState, useEffect, useCallback } from 'react';
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
    withSequence,
    withDelay,
    Easing,
    runOnJS,
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

// Interstitial screens
import { GoalAchievableScreen } from './quiz/GoalAchievableScreen';
import { AssessoriaCompareScreen } from './quiz/AssessoriaCompareScreen';
import { TimeCompareScreen } from './quiz/TimeCompareScreen';

import { FixedNavigationButtons } from '../components/FixedNavigationButtons';
import { AnimatedXP } from '../components/AnimatedXP';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
const XP_PER_QUESTION = 5;        // 15 questions × 5 = 75
const XP_COMPLETION_BONUS = 25;   // total = 100
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48;

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

export function OnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData, xpEarned, addXP } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const [wearableModalOpen, setWearableModalOpen] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);
    const insets = useSafeAreaInsets();

    const QUIZ_STEPS: QuizStep[] = [
        { key: 'birthDate', Component: BirthDateScreen },                                          // 0
        { key: 'weight', Component: WeightScreen },                                                // 1
        { key: 'height', Component: HeightScreen },                                                // 2
        { key: 'goal', Component: ObjectiveScreen },                                               // 3
        { key: 'experience_level', Component: LevelScreen },                                       // 4
        { key: '__i1_goal_achievable', Component: GoalAchievableScreen, isInterstitial: true },    // 5 (I1)
        { key: 'daysPerWeek', Component: FrequencyScreen },                                        // 6
        { key: '__i2_assessoria_compare', Component: AssessoriaCompareScreen, isInterstitial: true }, // 7 (I2)
        { key: 'availableDays', Component: AvailableDaysScreen, extraPropsKey: 'availableDays' },  // 8
        { key: 'intenseDayIndex', Component: IntenseDayScreen, extraPropsKey: 'intenseDay' },      // 9
        { key: 'recentDistance', Component: RecentDistanceScreen },                                // 10
        { key: 'distanceTime', Component: DistanceTimeScreen, extraPropsKey: 'distanceTime' },     // 11
        { key: '__i3_time_compare', Component: TimeCompareScreen, isInterstitial: true },          // 12 (I3)
        { keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'], key: 'pace', Component: PaceConfirmScreen }, // 13
        { key: 'startDate', Component: StartDateScreen },                                          // 14
        { key: 'limitations', Component: LimitationsScreen },                                      // 15
        { key: 'goalTimeframe', Component: GoalTimeframeScreen },                                  // 16
        { key: 'preferredWearable', Component: WearableConnectionScreen, isWearableStep: true },   // 17
    ];

    const TOTAL_QUESTIONS = QUIZ_STEPS.filter(s => !s.isInterstitial).length; // 15
    const TOTAL_INDICES = QUIZ_STEPS.length;                                  // 18

    const currentStepData = QUIZ_STEPS[currentStep];

    // displayedStep counts only real questions up to (and including) the current one.
    const displayedStep = QUIZ_STEPS.slice(0, currentStep + 1)
        .filter(s => !s.isInterstitial).length;
    const progressFraction = displayedStep / TOTAL_QUESTIONS;

    // Track previous step to know transition direction (forward/back)
    const prevStepRef = useRef(currentStep);
    const direction = currentStep >= prevStepRef.current ? 1 : -1; // 1 = forward, -1 = back

    // Step content fade+slide animation
    const contentOpacity = useSharedValue(1);
    const contentTranslateX = useSharedValue(0);

    useEffect(() => {
        if (prevStepRef.current === currentStep) return;
        const dirSign = direction;
        // Out then in (same Animated.View — content updates while opacity is 0)
        contentOpacity.value = withSequence(
            withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }),
            withDelay(20, withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })),
        );
        contentTranslateX.value = withSequence(
            withTiming(-20 * dirSign, { duration: 160, easing: Easing.in(Easing.cubic) }),
            withTiming(20 * dirSign, { duration: 0 }),
            withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }),
        );
        prevStepRef.current = currentStep;
    }, [currentStep, direction, contentOpacity, contentTranslateX]);

    const contentAnimStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
        transform: [{ translateX: contentTranslateX.value }],
    }));

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
        if (!currentStepData.isInterstitial && !xpCreditedRef.current.has(currentStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(currentStep);
        }

        // Last index → completion bonus + navigate
        if (currentStep === TOTAL_INDICES - 1) {
            if (!xpCreditedRef.current.has(-1)) {
                addXP(XP_COMPLETION_BONUS);
                xpCreditedRef.current.add(-1);
            }
            navigation.navigate('Quiz_PlanLoading', { userId });
            return;
        }

        setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        } else {
            navigation.goBack();
        }
    };

    const handleWearableYes = () => {
        setWearableModalOpen(true);
    };

    const handleWearableNo = () => {
        updateData({ preferredWearable: null });
        if (!xpCreditedRef.current.has(currentStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(currentStep);
        }
        if (!xpCreditedRef.current.has(-1)) {
            addXP(XP_COMPLETION_BONUS);
            xpCreditedRef.current.add(-1);
        }
        navigation.navigate('Quiz_PlanLoading', { userId });
    };

    const handleWearableConnect = () => {
        // User picked a provider in the modal → award XP and advance
        if (!xpCreditedRef.current.has(currentStep)) {
            addXP(XP_PER_QUESTION);
            xpCreditedRef.current.add(currentStep);
        }
        if (!xpCreditedRef.current.has(-1)) {
            addXP(XP_COMPLETION_BONUS);
            xpCreditedRef.current.add(-1);
        }
        navigation.navigate('Quiz_PlanLoading', { userId });
    };

    const handleWearableModalClose = () => {
        setWearableModalOpen(false);
    };

    const handleChange = useCallback((value: any) => {
        if (currentStepData.keys) {
            updateData(value);
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
    const showBackButton = currentStep > 0;
    const continueDisabled = !canContinue();
    const isLastStep = currentStep === TOTAL_INDICES - 1;

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
                    <AnimatedProgressBar fraction={progressFraction} />
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
                <Animated.View style={contentAnimStyle}>
                    {isInterstitial ? (
                        <StepComponent />
                    ) : (
                        <StepComponent
                            {...(currentStepData.keys ? getValue() : { value: getValue() })}
                            onChange={handleChange}
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
    progressTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: PROGRESS_TRACK_WIDTH,
        height: 28,
        gap: 4,
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
