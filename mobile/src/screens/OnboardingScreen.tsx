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
import { useOnboardingStore } from '../stores/onboardingStore';
import { colors, typography, borderRadius } from '../theme';
import Svg, { Path } from 'react-native-svg';

// Import individual question components
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

// Import navigation buttons
import { FixedNavigationButtons } from '../components/FixedNavigationButtons';

const TOTAL_STEPS = 15;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// FORCED COLORS (Figma exact values)
// ============================================
const FORCED_BG = '#0F0F1E';         // Dark background - NEVER transparent
const FORCED_CYAN = '#00D4FF';       // Accent cyan
const FORCED_TEXT = '#EBEBF5';       // Primary text
const FORCED_TEXT_SECONDARY = 'rgba(235, 235, 245, 0.6)'; // Secondary text
const FORCED_GLASS_STROKE = 'rgba(235, 235, 245, 0.1)';   // Progress bar bg

// ============================================
// FLASH ICON COMPONENT
// ============================================
const FlashIcon = () => (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
        <Path
            d="M13 2L4 14H11V22L20 10H13V2Z"
            fill={FORCED_CYAN}
        />
    </Svg>
);

// ============================================
// HEADER COMPONENT (Figma node 389-465)
// ============================================
interface ProgressHeaderProps {
    currentStep: number;
    totalSteps: number;
}

const ProgressHeader: React.FC<ProgressHeaderProps> = ({ currentStep, totalSteps }) => {
    const progressPercent = Math.round((currentStep / totalSteps) * 100);
    const progressWidth = (currentStep / totalSteps) * (SCREEN_WIDTH - 48);

    return (
        <View style={headerStyles.container}>
            {/* Top row: Pontuação + XP Badge */}
            <View style={headerStyles.topRow}>
                <Text style={headerStyles.pontuacaoText}>Pontuação</Text>
                <View style={headerStyles.xpBadge}>
                    <FlashIcon />
                    <Text style={headerStyles.xpText}>50XP</Text>
                </View>
            </View>

            {/* Progress bar */}
            <View style={headerStyles.progressBarContainer}>
                <View style={[headerStyles.progressBarFill, { width: progressWidth }]} />
            </View>

            {/* Progress percentage */}
            <View style={headerStyles.progressTextRow}>
                <Text style={headerStyles.progressLabel}>Progresso:</Text>
                <Text style={headerStyles.progressPercent}>{progressPercent}%</Text>
            </View>
        </View>
    );
};

const headerStyles = StyleSheet.create({
    container: {
        width: '100%',
        alignItems: 'center',
        gap: 9,
        paddingHorizontal: 12,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        height: 43,
    },
    pontuacaoText: {
        fontFamily: 'Poppins-Regular',
        fontSize: 14,
        color: FORCED_TEXT,
    },
    xpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0A0A14',
        borderWidth: 2,
        borderColor: FORCED_CYAN,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 6,
        // Subtle glow
        shadowColor: FORCED_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    xpText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 14,
        fontWeight: '600',
        color: FORCED_CYAN,
    },
    progressBarContainer: {
        width: SCREEN_WIDTH - 48,
        height: 4,
        backgroundColor: FORCED_GLASS_STROKE,
        borderRadius: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: 4,
        backgroundColor: FORCED_CYAN,
        borderRadius: 20,
    },
    progressTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: SCREEN_WIDTH - 48,
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

// ============================================
// MAIN ONBOARDING SCREEN
// ============================================

export function OnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);
    const insets = useSafeAreaInsets();

    // Define all quiz steps — 14 total (0-13)
    const QUIZ_STEPS: any[] = [
        { key: 'birthDate', Component: BirthDateScreen, title: 'Qual a sua data de nascimento?' },           // 0
        { key: 'weight', Component: WeightScreen, title: 'Qual é o seu peso atual?' },                        // 1
        { key: 'height', Component: HeightScreen, title: 'Qual é a sua altura?' },                            // 2
        { key: 'goal', Component: ObjectiveScreen, title: 'Qual é o seu objetivo?' },                         // 3
        { key: 'experience_level', Component: LevelScreen, title: 'Qual é o seu nível?' },                    // 4
        { key: 'daysPerWeek', Component: FrequencyScreen, title: 'Quantos dias por semana?' },                // 5
        { key: 'availableDays', Component: AvailableDaysScreen, title: 'Quais dias você tem disponíveis?', extraProps: { maxDays: data.daysPerWeek || 3 } }, // 6
        { key: 'intenseDayIndex', Component: IntenseDayScreen, title: 'Qual dia para treino intenso?', extraProps: { availableDays: data.availableDays || [] } }, // 7
        { key: 'recentDistance', Component: RecentDistanceScreen, title: 'Maior distância recente?' },        // 8
        { key: 'distanceTime', Component: DistanceTimeScreen, title: 'Em quanto tempo?', extraProps: { distance: data.recentDistance || 5 } }, // 9
        { keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'], Component: PaceConfirmScreen, title: 'Qual é o seu Pace?' }, // 10
        { key: 'startDate', Component: StartDateScreen, title: 'Quando quer começar?' },                      // 11
        { key: 'limitations', Component: LimitationsScreen, title: 'Alguma limitação física?' },              // 12
        { key: 'goalTimeframe', Component: GoalTimeframeScreen, title: 'Quando deseja atingir sua meta?' },   // 13
        { key: 'preferredWearable', Component: WearableConnectionScreen, title: 'Conectar dispositivo', isWearableStep: true }, // 14
    ];

    const currentStepData = QUIZ_STEPS[currentStep];

    // Scroll to top when step changes
    useEffect(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, [currentStep]);

    // Check if current step has valid data
    const canContinue = () => {
        switch (currentStep) {
            case 0: return !!data.birthDate;                                                                    // birthDate
            case 1: return !!data.weight && data.weight > 0;                                                    // weight
            case 2: return !!data.height && data.height > 0;                                                    // height
            case 3: return !!data.goal;                                                                         // goal
            case 4: return !!data.experience_level;                                                             // level
            case 5: return typeof data.daysPerWeek === 'number' && data.daysPerWeek >= 2 && data.daysPerWeek <= 7; // frequency
            case 6: return Array.isArray(data.availableDays) && data.availableDays.length > 0;                  // availableDays
            case 7: return data.intenseDayIndex !== null && data.intenseDayIndex !== undefined;                 // intenseDayIndex
            case 8: return !!data.recentDistance;                                                               // recentDistance
            case 9: return !!data.distanceTime && (data.distanceTime.hours > 0 || data.distanceTime.minutes > 0 || data.distanceTime.seconds > 0); // distanceTime
            case 10: return data.dontKnowPace === true || (!!data.paceMinutes && !!data.paceSeconds);           // pace
            case 11: return !!data.startDate;                                                                   // startDate
            case 12: return data.limitations && typeof data.limitations.hasLimitation === 'boolean';            // limitations
            case 13: return typeof data.goalTimeframe === 'number' && data.goalTimeframe > 0;                   // goalTimeframe
            case 14: return true;                                                                              // wearable (optional)
            default: return false;
        }
    };

    const handleContinue = () => {
        // Calculate pace before continuing from distance time screen (step 9)
        if (currentStep === 9 && data.distanceTime && data.recentDistance) {
            const { hours, minutes, seconds } = data.distanceTime;
            const totalMinutes = (hours * 60) + minutes + (seconds / 60);
            let pacePerKm = totalMinutes / data.recentDistance;

            // Validate: clamp unrealistic pace values
            // > 15 min/km is slower than walking → assume beginner default
            // < 2 min/km is faster than world record → clamp to realistic minimum
            if (pacePerKm > 15) {
                console.warn(`[Pace] Calculated ${pacePerKm.toFixed(2)} min/km is unrealistic, defaulting to 7.0`);
                pacePerKm = 7.0;
            } else if (pacePerKm < 2) {
                console.warn(`[Pace] Calculated ${pacePerKm.toFixed(2)} min/km is impossibly fast, clamping to 3.0`);
                pacePerKm = 3.0;
            }

            console.log(`[Pace] Time: ${hours}h ${minutes}m ${seconds}s = ${totalMinutes.toFixed(2)} min total`);
            console.log(`[Pace] Distance: ${data.recentDistance} km → Pace: ${pacePerKm.toFixed(2)} min/km`);
            updateData({ calculatedPace: pacePerKm });

            // Pre-fill PaceConfirmScreen (step 10) with formatted MM:SS from calculatedPace
            const wholeMinutes = Math.floor(pacePerKm);
            const remainderSeconds = Math.round((pacePerKm - wholeMinutes) * 60);
            updateData({
                paceMinutes: String(wholeMinutes).padStart(2, '0'),
                paceSeconds: String(remainderSeconds).padStart(2, '0'),
                dontKnowPace: false,
            });
        }

        // If on last step, navigate to PlanLoadingScreen
        if (currentStep === TOTAL_STEPS - 1) {
            navigation.navigate('Quiz_PlanLoading', { userId });
            return;
        }

        // Otherwise, move to next step
        setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        } else {
            navigation.goBack();
        }
    };

    // Handle onChange — memoized to prevent reference instability
    const handleChange = useCallback((value: any) => {
        if (currentStepData.keys) {
            updateData(value);
        } else if (currentStepData.key) {
            updateData({ [currentStepData.key]: value });
        }
    }, [currentStepData]);

    // Get value(s) for current step — multi-key returns individual props
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

    // Determine button states
    const isWearableStep = !!(currentStepData as any).isWearableStep;
    const showBackButton = currentStep > 0;
    const continueDisabled = !canContinue();
    const isLastStep = currentStep === TOTAL_STEPS - 1;

    // Wearable step navigation callbacks
    const handleWearableConnect = () => {
        navigation.navigate('Quiz_PlanLoading', { userId });
    };

    const handleWearableSkip = () => {
        navigation.navigate('Quiz_PlanLoading', { userId });
    };

    // Render the current step's component
    const StepComponent = currentStepData.Component;
    const extraProps = (currentStepData as any).extraProps || {};

    // Extra props for wearable step
    const wearableProps = isWearableStep
        ? { onConnect: handleWearableConnect, onSkip: handleWearableSkip }
        : {};

    // Reserved height at the bottom of the ScrollView so the fixed buttons
    // never overlap the last item of each step. Mirrors the physical footer:
    //   FixedNavigationButtons: 55 (button) + 12*2 (inner padding) = 79
    //   + buttonContainer paddingTop (8) + bottomInset applied below.
    const FOOTER_RESERVED_HEIGHT = 100;
    const bottomInset = Math.max(insets.bottom, 12);
    const topInset = Math.max(
        insets.top,
        Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12,
    );

    return (
        <View style={styles.container}>
            {/* Force light-content status bar with dark background */}
            <StatusBar
                barStyle="light-content"
                translucent
                backgroundColor="transparent"
            />

            {/* HEADER — top inset applied manually so it works under
                Android Edge-to-Edge (newArchEnabled) where SafeAreaView padding
                is bypassed by absolute children. */}
            <View style={[styles.headerContainer, { paddingTop: topInset + 8 }]}>
                <ProgressHeader
                    currentStep={currentStep + 1}
                    totalSteps={TOTAL_STEPS}
                />
            </View>

            {/* Scrollable Content Area */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: FOOTER_RESERVED_HEIGHT + bottomInset },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <StepComponent
                    {...(currentStepData.keys ? getValue() : { value: getValue() })}
                    onChange={handleChange}
                    {...extraProps}
                    {...wearableProps}
                />
            </ScrollView>

            {/* Fixed Navigation Buttons — bottom inset applied directly so the
                buttons never escape under the Android gesture bar / iOS home
                indicator. Hidden on wearable step (has its own buttons). */}
            {!isWearableStep && (
                <View style={[styles.buttonContainer, { paddingBottom: bottomInset }]}>
                    <FixedNavigationButtons
                        onBack={handleBack}
                        onContinue={handleContinue}
                        showBack={showBackButton}
                        continueDisabled={continueDisabled}
                        isLastStep={isLastStep}
                    />
                </View>
            )}
        </View>
    );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        // FORCED DARK BACKGROUND - Never transparent!
        backgroundColor: FORCED_BG,
    },
    headerContainer: {
        paddingHorizontal: 12,
        paddingBottom: 16,
        backgroundColor: FORCED_BG,
    },
    scrollView: {
        flex: 1,
        backgroundColor: FORCED_BG,
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
        // Hairline top border so scrolling content has a visual boundary
        // behind the fixed footer area.
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: FORCED_GLASS_STROKE,
    },
});
