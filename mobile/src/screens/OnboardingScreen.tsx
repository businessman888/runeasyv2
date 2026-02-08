import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    Platform,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../stores/onboardingStore';
import { colors, typography, borderRadius } from '../theme';
import Svg, { Path } from 'react-native-svg';

// Import individual question components
import { ObjectiveScreen } from './quiz/ObjectiveScreen';
import { LevelScreen } from './quiz/LevelScreen';
import { FrequencyScreen } from './quiz/FrequencyScreen';
import { PaceScreen } from './quiz/PaceScreen';
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

// Import navigation buttons
import { FixedNavigationButtons } from '../components/FixedNavigationButtons';

const TOTAL_STEPS = 14;
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

    // Define all quiz steps with their component and data key(s)
    // 14 total steps (0-13)
    const QUIZ_STEPS = [
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
        { keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'], Component: PaceScreen, title: 'Qual é o seu Pace?' }, // 10
        { key: 'startDate', Component: StartDateScreen, title: 'Quando quer começar?' },                      // 11
        { key: 'limitations', Component: LimitationsScreen, title: 'Alguma limitação física?' },              // 12
        { key: 'goalTimeframe', Component: GoalTimeframeScreen, title: 'Quando deseja atingir sua meta?' },   // 13
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
            case 10: return data.dontKnowPace === true || (data.paceMinutes && data.paceSeconds);               // pace
            case 11: return !!data.startDate;                                                                   // startDate
            case 12: return true;                                                                               // limitations (optional)
            case 13: return typeof data.goalTimeframe === 'number' && data.goalTimeframe > 0;                   // goalTimeframe
            default: return false;
        }
    };

    const handleContinue = () => {
        // Calculate pace before continuing from distance time screen (step 9)
        if (currentStep === 9 && data.distanceTime && data.recentDistance) {
            const { hours, minutes, seconds } = data.distanceTime;
            const totalMinutes = hours * 60 + minutes + seconds / 60;
            const pacePerKm = totalMinutes / data.recentDistance;
            updateData({ calculatedPace: pacePerKm });
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

    // Handle onChange - supports both single key and multiple keys
    const handleChange = (value: any) => {
        if (currentStepData.keys) {
            updateData(value);
        } else if (currentStepData.key) {
            // startDate is already a string (YYYY-MM-DD), no conversion needed
            updateData({ [currentStepData.key]: value });
        }
    };

    // Get value(s) for current step
    const getValue = () => {
        if (currentStepData.keys) {
            return currentStepData.keys.reduce((acc: any, key: string) => ({
                ...acc,
                [key]: data[key as keyof typeof data],
            }), {});
        } else if (currentStepData.key) {
            // Return value as-is, startDate is already a string (YYYY-MM-DD)
            return data[currentStepData.key as keyof typeof data];
        }
        return undefined;
    };

    // Determine button states
    const showBackButton = currentStep > 0;
    const continueDisabled = !canContinue();
    const isLastStep = currentStep === TOTAL_STEPS - 1;

    // Render the current step's component
    const StepComponent = currentStepData.Component;
    const extraProps = (currentStepData as any).extraProps || {};

    // Calculate Android status bar padding
    const androidStatusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 16 : 0;

    return (
        <View style={styles.container}>
            {/* Force light-content status bar with dark background */}
            <StatusBar
                barStyle="light-content"
                translucent
                backgroundColor="transparent"
            />

            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                {/* HEADER with XP and Progress Bar (Figma node 389-465) */}
                <View style={[
                    styles.headerContainer,
                    Platform.OS === 'android' && { paddingTop: androidStatusBarHeight }
                ]}>
                    <ProgressHeader
                        currentStep={currentStep + 1}
                        totalSteps={TOTAL_STEPS}
                    />
                </View>

                {/* Scrollable Content Area */}
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <StepComponent
                        value={getValue()}
                        onChange={handleChange}
                        {...(currentStepData.keys ? getValue() : {})}
                        {...extraProps}
                    />
                </ScrollView>

                {/* Fixed Navigation Buttons (Figma node 428-464) */}
                <View style={styles.buttonContainer}>
                    <FixedNavigationButtons
                        onBack={handleBack}
                        onContinue={handleContinue}
                        showBack={showBackButton}
                        continueDisabled={continueDisabled}
                        isLastStep={isLastStep}
                    />
                </View>
            </SafeAreaView>
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
    safeArea: {
        flex: 1,
        backgroundColor: FORCED_BG,
    },
    headerContainer: {
        paddingHorizontal: 12,
        paddingTop: Platform.OS === 'ios' ? 8 : 0,
        paddingBottom: 16,
        backgroundColor: FORCED_BG,
    },
    scrollView: {
        flex: 1,
        backgroundColor: FORCED_BG,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 120, // Space for fixed buttons
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: FORCED_BG,
        paddingBottom: Platform.OS === 'ios' ? 0 : 16,
        paddingHorizontal: 12,
    },
});
