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

// Import individual question components
import { ObjectiveScreen } from './quiz/ObjectiveScreen';
import { LevelScreen } from './quiz/LevelScreen';
import { FrequencyScreen } from './quiz/FrequencyScreen';
import { PaceScreen } from './quiz/PaceScreen';
import { TimeframeScreen } from './quiz/TimeframeScreen';
import { LimitationsScreen } from './quiz/LimitationsScreen';

const TOTAL_STEPS = 6;

export function QuizOnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);

    // Define all quiz steps with their component and data key(s)
    const QUIZ_STEPS = [
        {
            key: 'goal',
            Component: ObjectiveScreen,
            title: 'Qual é o seu objetivo?',
        },
        {
            key: 'experience_level',
            Component: LevelScreen,
            title: 'Qual é o seu nível?',
        },
        {
            key: 'daysPerWeek',
            Component: FrequencyScreen,
            title: 'Quantos dias por semana?',
        },
        {
            keys: ['hasInjury', 'injuryDetails'],
            Component: PaceScreen,
            title: 'Limitações físicas?',
        },
        {
            keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'],
            Component: TimeframeScreen,
            title: 'Qual é o seu Pace?',
        },
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
            case 0: // Objective
                return !!data.goal;

            case 1: // Level
                return !!data.experience_level;

            case 2: // Frequency
                return typeof data.daysPerWeek === 'number' && data.daysPerWeek >= 2 && data.daysPerWeek <= 7;

            case 3: // Pace (Injury) - optional
                return true;

            case 4: // Timeframe (Pace)
                // Valid if dontKnowPace is true OR both minutes and seconds are filled
                return data.dontKnowPace === true || (data.paceMinutes && data.paceSeconds);

            case 5: // Limitations - optional
                return true;

            default:
                return false;
        }
    };

    const handleContinue = () => {
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
            // Single key
            updateData({ [currentStepData.key]: value });
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
