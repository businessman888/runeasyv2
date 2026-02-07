import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    ScrollView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../stores/onboardingStore';
import { QuizProgressBar } from '../components/QuizProgressBar';
import { FixedNavigationButtons } from '../components/FixedNavigationButtons';
import { colors } from '../theme';

// Import individual question components (original)
import { ObjectiveScreen } from './quiz/ObjectiveScreen';
import { LevelScreen } from './quiz/LevelScreen';
import { FrequencyScreen } from './quiz/FrequencyScreen';
import { PaceScreen } from './quiz/PaceScreen';
import { TimeframeScreen } from './quiz/TimeframeScreen';
import { LimitationsScreen } from './quiz/LimitationsScreen';

// Import new quiz components
import { BirthDateScreen } from './quiz/BirthDateScreen';
import { WeightScreen } from './quiz/WeightScreen';
import { HeightScreen } from './quiz/HeightScreen';
import { AvailableDaysScreen } from './quiz/AvailableDaysScreen';
import { IntenseDayScreen } from './quiz/IntenseDayScreen';
import { RecentDistanceScreen } from './quiz/RecentDistanceScreen';
import { DistanceTimeScreen } from './quiz/DistanceTimeScreen';
import { StartDateScreen } from './quiz/StartDateScreen';

const TOTAL_STEPS = 14;

export function QuizOnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);

    // Define all quiz steps with their component and data key(s)
    // ORDER: BirthDate -> Weight -> Height -> Objective -> Level -> Frequency -> 
    //        AvailableDays -> IntenseDay -> Pace -> RecentDistance -> DistanceTime -> 
    //        Timeframe -> StartDate -> Limitations
    const QUIZ_STEPS = [
        // Step 1: Birth Date
        {
            key: 'birthDate',
            Component: BirthDateScreen,
            title: 'Qual a sua data de nascimento?',
        },
        // Step 2: Weight
        {
            key: 'weight',
            Component: WeightScreen,
            title: 'Qual é o seu peso atual?',
        },
        // Step 3: Height
        {
            key: 'height',
            Component: HeightScreen,
            title: 'Qual é a sua altura?',
        },
        // Step 4: Objective
        {
            key: 'goal',
            Component: ObjectiveScreen,
            title: 'Qual é o seu objetivo?',
        },
        // Step 5: Level
        {
            key: 'experience_level',
            Component: LevelScreen,
            title: 'Qual é o seu nível?',
        },
        // Step 6: Frequency
        {
            key: 'daysPerWeek',
            Component: FrequencyScreen,
            title: 'Quantos dias por semana?',
        },
        // Step 7: Available Days
        {
            key: 'availableDays',
            Component: AvailableDaysScreen,
            title: 'Quais dias você tem disponíveis?',
        },
        // Step 8: Intense Day
        {
            key: 'intenseDayIndex',
            Component: IntenseDayScreen,
            title: 'Qual dia para treino intenso?',
            extraProps: { availableDays: data.availableDays || [] },
        },
        // Step 9: Injury/Pace
        {
            keys: ['hasInjury', 'injuryDetails'],
            Component: PaceScreen,
            title: 'Limitações físicas?',
        },
        // Step 10: Recent Distance
        {
            key: 'recentDistance',
            Component: RecentDistanceScreen,
            title: 'Maior distância recente?',
        },
        // Step 11: Distance Time
        {
            key: 'distanceTime',
            Component: DistanceTimeScreen,
            title: 'Em quanto tempo?',
            extraProps: { distance: data.recentDistance || 5 },
        },
        // Step 12: Timeframe (Pace Input)
        {
            keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'],
            Component: TimeframeScreen,
            title: 'Qual é o seu Pace?',
        },
        // Step 13: Start Date
        {
            key: 'startDate',
            Component: StartDateScreen,
            title: 'Quando quer começar?',
        },
        // Step 14: Limitations
        {
            key: 'limitations',
            Component: LimitationsScreen,
            title: 'Alguma limitação física?',
        },
    ];

    const currentStepData = QUIZ_STEPS[currentStep];

    // Scroll to top when step changes
    useEffect(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, [currentStep]);

    // Check if current step has valid data
    const canContinue = () => {
        switch (currentStep) {
            case 0: // Birth Date
                return !!data.birthDate;

            case 1: // Weight
                return !!data.weight && data.weight > 0;

            case 2: // Height
                return !!data.height && data.height > 0;

            case 3: // Objective
                return !!data.goal;

            case 4: // Level
                return !!data.experience_level;

            case 5: // Frequency
                return typeof data.daysPerWeek === 'number' && data.daysPerWeek >= 2 && data.daysPerWeek <= 7;

            case 6: // Available Days
                return Array.isArray(data.availableDays) && data.availableDays.length > 0;

            case 7: // Intense Day
                return data.intenseDayIndex !== null && data.intenseDayIndex !== undefined;

            case 8: // Pace (Injury) - optional
                return true;

            case 9: // Recent Distance
                return !!data.recentDistance;

            case 10: // Distance Time
                return !!data.distanceTime && (
                    data.distanceTime.hours > 0 ||
                    data.distanceTime.minutes > 0 ||
                    data.distanceTime.seconds > 0
                );

            case 11: // Timeframe (Pace)
                return data.dontKnowPace === true || (data.paceMinutes && data.paceSeconds);

            case 12: // Start Date
                return !!data.startDate;

            case 13: // Limitations - optional
                return true;

            default:
                return false;
        }
    };

    const handleContinue = () => {
        // Calculate pace before continuing from distance time screen
        if (currentStep === 10 && data.distanceTime && data.recentDistance) {
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
            // Multiple keys - value is an object
            updateData(value);
        } else if (currentStepData.key) {
            // Single key - check if startDate needs conversion
            if (currentStepData.key === 'startDate' && value instanceof Date) {
                updateData({ [currentStepData.key]: value.toISOString() });
            } else {
                updateData({ [currentStepData.key]: value });
            }
        }
    };

    // Get value(s) for current step
    const getValue = () => {
        if (currentStepData.keys) {
            // Return object with all keys for this step
            return currentStepData.keys.reduce((acc: any, key: string) => ({
                ...acc,
                [key]: data[key as keyof typeof data],
            }), {});
        } else if (currentStepData.key) {
            const value = data[currentStepData.key as keyof typeof data];
            // Convert ISO string back to Date for StartDateScreen
            if (currentStepData.key === 'startDate' && typeof value === 'string') {
                return new Date(value);
            }
            return value;
        }
        return undefined;
    };

    // Determine button states
    const showBackButton = currentStep > 0;
    const continueDisabled = !canContinue();
    const isLastStep = currentStep === TOTAL_STEPS - 1;

    // Render the current step's component
    const StepComponent = currentStepData.Component;

    // Get extra props for current step
    const extraProps = (currentStepData as any).extraProps || {};

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Fixed Progress Bar */}
                <View style={styles.progressBarContainer}>
                    <QuizProgressBar currentStep={currentStep + 1} totalSteps={TOTAL_STEPS} />
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

                {/* Fixed Navigation Buttons */}
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


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    safeArea: {
        flex: 1,
    },
    progressBarContainer: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 0 : 20,
        paddingBottom: 16,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 100, // Space for fixed buttons
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background,
        paddingBottom: Platform.OS === 'ios' ? 0 : 12,
    },
});
