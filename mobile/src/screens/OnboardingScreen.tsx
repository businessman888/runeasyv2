import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useOnboardingStore, onboardingQuestions } from '../stores/onboardingStore';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

const API_URL = BASE_API_URL;

export function OnboardingScreen({ navigation, route }: any) {
    const { userId } = route.params || {};
    const { currentStep, data, updateData, nextStep, prevStep, reset } = useOnboardingStore();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const currentQuestion = onboardingQuestions[currentStep];
    const isLastStep = currentStep === onboardingQuestions.length - 1;
    const progress = (currentStep + 1) / onboardingQuestions.length;

    const handleNext = async () => {
        if (isLastStep) {
            await submitOnboarding();
        } else {
            nextStep();
        }
    };

    const submitOnboarding = async () => {
        try {
            setIsSubmitting(true);

            const response = await fetch(`${API_URL}/training/onboarding`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
                body: JSON.stringify({
                    goal: data.goal,
                    level: data.experience_level,
                    days_per_week: data.daysPerWeek || 3,
                    current_pace_5k: data.currentPace5k,
                    target_weeks: data.targetWeeks || 8,
                    limitations: data.limitations,
                    preferred_days: data.preferredDays || [],
                }),
            });

            if (response.ok) {
                const result = await response.json();

                // Store userId
                await Storage.setItemAsync('user_id', userId);

                // Reset onboarding state
                reset();

                // Navigate to main app
                navigation.replace('Main', {
                    planId: result.plan_id,
                    workoutsCount: result.workouts_count,
                });
            } else {
                console.error('Onboarding failed');
            }
        } catch (error) {
            console.error('Submit error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const canProceed = () => {
        const { id } = currentQuestion;
        const value = data[id as keyof typeof data];

        if (currentQuestion.optional) return true;

        return value !== undefined && value !== '' && value !== null;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={styles.progressText}>
                        {currentStep + 1} de {onboardingQuestions.length}
                    </Text>
                </View>

                {/* Question Content */}
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.title}>{currentQuestion.title}</Text>
                    <Text style={styles.subtitle}>{currentQuestion.subtitle}</Text>

                    {/* Render question based on type */}
                    {currentQuestion.type === 'select' && (
                        <SelectOptions
                            options={currentQuestion.options || []}
                            value={data[currentQuestion.id as keyof typeof data]}
                            onChange={(value) => updateData({ [currentQuestion.id]: value })}
                        />
                    )}

                    {currentQuestion.type === 'slider' && (
                        <SliderInput
                            value={data[currentQuestion.id as keyof typeof data] as number || currentQuestion.min}
                            min={currentQuestion.min!}
                            max={currentQuestion.max!}
                            unit={currentQuestion.unit!}
                            onChange={(value) => updateData({ [currentQuestion.id]: value })}
                        />
                    )}

                    {currentQuestion.type === 'pace' && (
                        <PaceInput
                            value={data[currentQuestion.id as keyof typeof data] as number | null}
                            onChange={(value) => updateData({ [currentQuestion.id]: value })}
                        />
                    )}

                    {currentQuestion.type === 'text' && (
                        <TextInput
                            style={styles.textInput}
                            placeholder={currentQuestion.placeholder}
                            placeholderTextColor={colors.textMuted}
                            value={data[currentQuestion.id as keyof typeof data] as string || ''}
                            onChangeText={(value) => updateData({ [currentQuestion.id]: value || null })}
                            multiline
                            numberOfLines={3}
                        />
                    )}
                </ScrollView>

                {/* Navigation Buttons */}
                <View style={styles.footer}>
                    {currentStep > 0 && (
                        <TouchableOpacity style={styles.backButton} onPress={prevStep}>
                            <Text style={styles.backButtonText}>Voltar</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.nextButton,
                            !canProceed() && styles.buttonDisabled
                        ]}
                        onPress={handleNext}
                        disabled={!canProceed() || isSubmitting}
                    >
                        <Text style={styles.nextButtonText}>
                            {isSubmitting ? 'Criando plano...' : isLastStep ? 'Criar meu plano' : 'Continuar'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// Select Options Component
function SelectOptions({ options, value, onChange }: {
    options: Array<{ value: any; label: string; description?: string; icon?: string }>;
    value: any;
    onChange: (value: any) => void;
}) {
    return (
        <View style={styles.optionsContainer}>
            {options.map((option) => (
                <TouchableOpacity
                    key={option.value}
                    style={[
                        styles.optionCard,
                        value === option.value && styles.optionCardSelected,
                    ]}
                    onPress={() => onChange(option.value)}
                >
                    {option.icon && <Text style={styles.optionIcon}>{option.icon}</Text>}
                    <View style={styles.optionTextContainer}>
                        <Text style={[
                            styles.optionLabel,
                            value === option.value && styles.optionLabelSelected,
                        ]}>
                            {option.label}
                        </Text>
                        {option.description && (
                            <Text style={styles.optionDescription}>{option.description}</Text>
                        )}
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// Slider Input Component
function SliderInput({ value, min, max, unit, onChange }: {
    value: number;
    min: number;
    max: number;
    unit: string;
    onChange: (value: number) => void;
}) {
    return (
        <View style={styles.sliderContainer}>
            <Text style={styles.sliderValue}>{value} {unit}</Text>
            <View style={styles.sliderButtons}>
                {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((num) => (
                    <TouchableOpacity
                        key={num}
                        style={[
                            styles.sliderButton,
                            value === num && styles.sliderButtonSelected,
                        ]}
                        onPress={() => onChange(num)}
                    >
                        <Text style={[
                            styles.sliderButtonText,
                            value === num && styles.sliderButtonTextSelected,
                        ]}>
                            {num}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

// Pace Input Component
function PaceInput({ value, onChange }: {
    value: number | null;
    onChange: (value: number | null) => void;
}) {
    const [minutes, setMinutes] = React.useState(value ? Math.floor(value) : 6);
    const [seconds, setSeconds] = React.useState(value ? Math.round((value % 1) * 60) : 0);

    React.useEffect(() => {
        if (minutes && seconds !== undefined) {
            onChange(minutes + seconds / 60);
        }
    }, [minutes, seconds]);

    return (
        <View style={styles.paceContainer}>
            <View style={styles.paceInputGroup}>
                <TextInput
                    style={styles.paceInput}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={String(minutes)}
                    onChangeText={(text) => setMinutes(parseInt(text) || 0)}
                />
                <Text style={styles.paceLabel}>min</Text>
            </View>
            <Text style={styles.paceSeparator}>:</Text>
            <View style={styles.paceInputGroup}>
                <TextInput
                    style={styles.paceInput}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={String(seconds).padStart(2, '0')}
                    onChangeText={(text) => setSeconds(Math.min(59, parseInt(text) || 0))}
                />
                <Text style={styles.paceLabel}>seg</Text>
            </View>
            <Text style={styles.paceUnit}>/km</Text>

            <TouchableOpacity
                style={styles.skipButton}
                onPress={() => onChange(null)}
            >
                <Text style={styles.skipButtonText}>Não sei meu pace</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.white,
    },
    keyboardView: {
        flex: 1,
    },
    progressContainer: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
    },
    progressBar: {
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 2,
    },
    progressText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        marginTop: spacing.xs,
        textAlign: 'right',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: spacing.lg,
        paddingTop: spacing.xl,
    },
    title: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: typography.fontSizes.md,
        color: colors.textSecondary,
        marginBottom: spacing.xl,
    },
    optionsContainer: {
        gap: spacing.md,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: `${colors.primary}10`,
    },
    optionIcon: {
        fontSize: 32,
        marginRight: spacing.md,
    },
    optionTextContainer: {
        flex: 1,
    },
    optionLabel: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
    },
    optionLabelSelected: {
        color: colors.primary,
    },
    optionDescription: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        marginTop: 2,
    },
    sliderContainer: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
    },
    sliderValue: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
        marginBottom: spacing.lg,
    },
    sliderButtons: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    sliderButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sliderButtonSelected: {
        backgroundColor: colors.primary,
    },
    sliderButtonText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
    },
    sliderButtonTextSelected: {
        color: colors.white,
    },
    paceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        paddingVertical: spacing.xl,
        gap: spacing.sm,
    },
    paceInputGroup: {
        alignItems: 'center',
    },
    paceInput: {
        width: 60,
        height: 60,
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        textAlign: 'center',
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        color: colors.text,
    },
    paceLabel: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
    paceSeparator: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        marginBottom: spacing.lg,
    },
    paceUnit: {
        fontSize: typography.fontSizes.xl,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
        marginLeft: spacing.sm,
    },
    skipButton: {
        width: '100%',
        marginTop: spacing.md,
        paddingVertical: spacing.sm,
    },
    skipButtonText: {
        fontSize: typography.fontSizes.md,
        color: colors.primary,
        textAlign: 'center',
    },
    textInput: {
        backgroundColor: colors.background,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        fontSize: typography.fontSizes.md,
        color: colors.text,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    footer: {
        flexDirection: 'row',
        padding: spacing.lg,
        gap: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    backButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    backButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
    },
    nextButton: {
        flex: 2,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.lg,
        backgroundColor: colors.primary,
    },
    buttonDisabled: {
        backgroundColor: colors.border,
    },
    nextButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.white,
    },
});
