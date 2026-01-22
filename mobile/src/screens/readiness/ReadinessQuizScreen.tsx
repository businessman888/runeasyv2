import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { BASE_API_URL } from '../../config/api.config';
import * as Storage from '../../utils/storage';
import { useReadinessStore } from '../../stores/readinessStore';

// Question structure from backend
interface QuestionOption {
    value: number;
    label: string;
    description?: string;
}

interface Question {
    id: string;
    question: string;
    options: QuestionOption[];
}

interface QuestionSetResponse {
    setNumber: number;
    setName: string;
    questions: Question[];
    totalSets: number;
}

// Fallback questions in case API fails
const FALLBACK_QUESTIONS: Question[] = [
    {
        id: 'sleep',
        question: 'Sua bateria carregou bem durante a noite',
        options: [
            { value: 5, label: '100% Full' },
            { value: 4, label: '75%' },
            { value: 3, label: '50%' },
            { value: 2, label: '25%' },
            { value: 1, label: '0%' },
        ],
    },
    {
        id: 'legs',
        question: 'Algum sinal de alerta nos músculos?',
        options: [
            { value: 5, label: 'Nenhuma dor' },
            { value: 4, label: 'Desconforto leve' },
            { value: 3, label: 'Dor moderada' },
            { value: 2, label: 'Dor significativa' },
            { value: 1, label: 'Muita dor' },
        ],
    },
    {
        id: 'mood',
        question: 'Quão leve você sente o corpo agora?',
        options: [
            { value: 5, label: 'Flutuando' },
            { value: 4, label: 'Leve' },
            { value: 3, label: 'Normal' },
            { value: 2, label: 'Pesado' },
            { value: 1, label: 'Muito pesado' },
        ],
    },
    {
        id: 'stress',
        question: 'Como está o peso das preocupações hoje?',
        options: [
            { value: 5, label: 'Muito leve' },
            { value: 4, label: 'Leve' },
            { value: 3, label: 'Moderado' },
            { value: 2, label: 'Pesado' },
            { value: 1, label: 'Esmagador' },
        ],
    },
    {
        id: 'motivation',
        question: 'Qual sua pressa para iniciar o treino?',
        options: [
            { value: 5, label: 'Máxima' },
            { value: 4, label: 'Alta' },
            { value: 3, label: 'Moderada' },
            { value: 2, label: 'Baixa' },
            { value: 1, label: 'Nenhuma' },
        ],
    },
];

interface ReadinessQuizScreenProps {
    navigation: any;
}

export function ReadinessQuizScreen({ navigation }: ReadinessQuizScreenProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [questions, setQuestions] = useState<Question[]>(FALLBACK_QUESTIONS);
    const [questionSetNumber, setQuestionSetNumber] = useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const insets = useSafeAreaInsets();

    // Fetch questions from backend EVERY time screen is focused (not just on mount)
    useFocusEffect(
        useCallback(() => {
            let isMounted = true;

            const fetchQuestions = async () => {
                try {
                    // Reset state when screen is focused
                    setIsLoading(true);
                    setCurrentStep(0);
                    setAnswers({});

                    const userId = await Storage.getItemAsync('user_id');
                    console.log('[ReadinessQuiz] Fetching questions for user:', userId);

                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                    };
                    if (userId) {
                        headers['x-user-id'] = userId;
                    }

                    const response = await fetch(`${BASE_API_URL}/readiness/questions`, {
                        method: 'GET',
                        headers,
                    });

                    if (response.ok && isMounted) {
                        const data: QuestionSetResponse = await response.json();
                        console.log(`[ReadinessQuiz] Received Set #${data.setNumber}: "${data.setName}"`);
                        setQuestions(data.questions);
                        setQuestionSetNumber(data.setNumber);
                    } else {
                        console.warn('[ReadinessQuiz] Failed to fetch questions, using fallback. Status:', response.status);
                    }
                } catch (error) {
                    console.error('[ReadinessQuiz] Error fetching questions:', error);
                } finally {
                    if (isMounted) {
                        setIsLoading(false);
                    }
                }
            };

            fetchQuestions();

            return () => {
                isMounted = false;
            };
        }, [])
    );

    const currentQuestion = questions[currentStep];
    const totalSteps = questions.length;
    const progress = (currentStep + 1) / totalSteps;
    const selectedValue = currentQuestion ? answers[currentQuestion.id] : undefined;

    // Get store actions
    const { setAnswer, setSetNumber } = useReadinessStore();

    const handleSelectOption = (value: number) => {
        if (!currentQuestion) return;
        setAnswers(prev => ({
            ...prev,
            [currentQuestion.id]: value,
        }));
        // Also save to store for persistence
        setAnswer(currentQuestion.id as any, value);
    };

    const handleContinue = () => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            // Save questionSetNumber to store before navigating
            if (questionSetNumber) {
                setSetNumber(questionSetNumber);
            }
            // Navigate to result screen (the store already has the answers)
            navigation.navigate('ReadinessResult');
        }
    };

    // Show loading state while fetching questions
    if (isLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20, justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor="#0E0E1F" />
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16 }}>Carregando perguntas...</Text>
            </View>
        );
    }

    if (!currentQuestion) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20, justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" backgroundColor="#0E0E1F" />
                <Text style={{ color: colors.error }}>Erro ao carregar perguntas</Text>
            </View>
        );
    }

    return (
        <View style={{ paddingTop: insets.top + 20, backgroundColor: '#0E0E1F', flex: 1 }}>
            <StatusBar barStyle="light-content" backgroundColor="#0E0E1F" />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Prontidão diária</Text>
                    <Text style={styles.stepIndicator}>{currentStep + 1}/{totalSteps}</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                </View>

                {/* Question Card */}
                <View style={styles.questionCard}>
                    <Text style={{
                        fontSize: 26,
                        fontWeight: '700',
                        color: colors.white,
                        textAlign: 'center',
                        marginTop: 40,
                        marginBottom: 32,
                        lineHeight: 34,
                    }}>
                        {currentQuestion.question}
                    </Text>

                    {/* Options with inline gap and padding */}
                    <View style={{ gap: 20, paddingHorizontal: 20 }}>
                        {currentQuestion.options.map((option) => {
                            const isSelected = selectedValue === option.value;
                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.optionCard,
                                        { minHeight: 56, paddingVertical: 16 },
                                        isSelected && styles.optionCardSelected,
                                    ]}
                                    onPress={() => handleSelectOption(option.value)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[
                                        styles.optionLabel,
                                        isSelected && styles.optionLabelSelected,
                                    ]}>
                                        {option.label}
                                    </Text>
                                    <View style={[
                                        styles.radioOuter,
                                        isSelected && styles.radioOuterSelected,
                                    ]}>
                                        {isSelected && <View style={styles.radioInner} />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Continue Button - with bottom padding for navbar */}
                <View style={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 20, marginTop: 24 }}>
                    <TouchableOpacity
                        style={[
                            styles.continueButton,
                            !selectedValue && { backgroundColor: '#1A1A2E', opacity: 0.7 },
                        ]}
                        onPress={handleContinue}
                        disabled={!selectedValue}
                    >
                        <Text style={[
                            styles.continueButtonText,
                            !selectedValue && { color: 'rgba(255,255,255,0.4)' },
                        ]}>Continuar</Text>
                        <Ionicons
                            name="arrow-forward"
                            size={20}
                            color={selectedValue ? '#0E0E1F' : 'rgba(255,255,255,0.3)'}
                        />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    headerTitle: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: '600',
    },
    stepIndicator: {
        fontSize: typography.fontSizes.md,
        color: colors.primary,
        fontWeight: '700',
    },
    progressBarContainer: {
        marginBottom: spacing.xl,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
        ...Platform.select({
            web: {
                backgroundImage: 'linear-gradient(90deg, #00D4FF, #00FFFF)',
            },
            default: {
                backgroundColor: colors.primary,
            },
        }),
    },
    questionCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        padding: 24,
        paddingTop: 32,
        marginBottom: 24,
    },
    question: {
        fontSize: 26,
        fontWeight: '700',
        color: colors.white,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 36,
    },
    optionsContainer: {
        gap: 16,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1A1A2E',
        paddingVertical: 18,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        marginVertical: 4,
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.12)',
    },
    optionLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.85)',
    },
    optionLabelSelected: {
        color: colors.primary,
        fontWeight: '600',
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    radioInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0E0E1F',
    },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 32,
        gap: 10,
        marginTop: 16,
    },
    continueButtonDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    continueButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '700',
        color: '#0E0E1F',
    },
    continueButtonTextDisabled: {
        color: 'rgba(255, 255, 255, 0.4)',
    },
});

export default ReadinessQuizScreen;
