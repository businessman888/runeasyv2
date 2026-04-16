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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../stores/onboardingStore';
import { colors, typography, borderRadius, shadows } from '../theme';
import Svg, { Path } from 'react-native-svg';

// Import individual question components (original)
import { ObjectiveScreen } from './quiz/ObjectiveScreen';
import { LevelScreen } from './quiz/LevelScreen';
import { FrequencyScreen } from './quiz/FrequencyScreen';
import { PaceConfirmScreen } from './quiz/PaceConfirmScreen';
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

// Import navigation buttons
import { FixedNavigationButtons } from '../components/FixedNavigationButtons';

const TOTAL_STEPS = 14;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// FORCED COLORS (Figma exact values)
// ============================================
const FORCED_BG = '#0F0F1E';         // Dark background - NEVER transparent
const FORCED_CARD = '#15152A';       // Card/nav background
const FORCED_CARD_ALT = '#1C1C2E';   // Alternate card (Back button)
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
        backgroundColor: '#0A0A14',  // Darker for more contrast
        borderWidth: 2,              // Thicker border for visibility
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
// MAIN QUIZ ONBOARDING SCREEN
// ============================================

export function QuizOnboardingScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [currentStep, setCurrentStep] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);
    const insets = useSafeAreaInsets();

    // Define all quiz steps with their component and data key(s)
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
            extraProps: { goal: data.goal, experience_level: data.experience_level },
        },
        // Step 7: Available Days
        {
            key: 'availableDays',
            Component: AvailableDaysScreen,
            title: 'Quais dias você tem disponíveis?',
            extraProps: { maxDays: data.daysPerWeek || 3 },
        },
        // Step 8: Intense Day
        {
            key: 'intenseDayIndex',
            Component: IntenseDayScreen,
            title: 'Qual dia para treino intenso?',
            extraProps: { availableDays: data.availableDays || [] },
        },
        // Step 9: Pace
        {
            keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'],
            Component: PaceConfirmScreen,
            title: 'Qual é o seu Pace?',
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
        // Step 12: Pace Confirm
        {
            keys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'],
            Component: PaceConfirmScreen,
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

            case 6: // Available Days — must match exact daysPerWeek count
                return Array.isArray(data.availableDays) && data.availableDays.length === (data.daysPerWeek || 3);

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
            const totalMinutes = (hours * 60) + minutes + (seconds / 60);
            let pacePerKm = totalMinutes / data.recentDistance;

            // Validate: clamp unrealistic pace values
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

            // Pre-fill PaceConfirmScreen with formatted MM:SS
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

            // ── Dependency sync: daysPerWeek → availableDays / intenseDayIndex ──
            // When user changes frequency to a value lower than current selected
            // days, reset downstream selections to avoid stale state.
            if (currentStepData.key === 'daysPerWeek') {
                const newFreq = value as number;
                const currentDays = data.availableDays || [];
                if (currentDays.length > newFreq) {
                    updateData({ availableDays: [], intenseDayIndex: null });
                }
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

    // Height reserved at the bottom of the ScrollView so the fixed buttons never
    // overlap the last content of each step. Matches the physical footer height:
    //   FixedNavigationButtons: 55px button + 12px top/bottom padding = 79px
    //   + buttonContainer paddingTop (12) + paddingBottom applied via insets.
    const FOOTER_RESERVED_HEIGHT = 100;
    const bottomInset = Math.max(insets.bottom, 12);
    const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12);

    return (
        <View style={styles.container}>
            {/* Force light-content status bar with dark background */}
            <StatusBar
                barStyle="light-content"
                translucent
                backgroundColor="transparent"
            />

            {/* HEADER with XP and Progress Bar — top inset applied manually */}
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
                    value={getValue()}
                    onChange={handleChange}
                    {...(currentStepData.keys ? getValue() : {})}
                    {...extraProps}
                />
            </ScrollView>

            {/* Fixed Navigation Buttons — bottom inset applied manually so they
                never escape under the Android gesture bar / iOS home indicator. */}
            <View style={[styles.buttonContainer, { paddingBottom: bottomInset }]}>
                <FixedNavigationButtons
                    onBack={handleBack}
                    onContinue={handleContinue}
                    showBack={showBackButton}
                    continueDisabled={continueDisabled}
                    isLastStep={isLastStep}
                />
            </View>
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
        // Subtle top border so content scrolling behind the fixed area has a
        // visual boundary and doesn't look cut mid-line.
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: FORCED_GLASS_STROKE,
    },
});
