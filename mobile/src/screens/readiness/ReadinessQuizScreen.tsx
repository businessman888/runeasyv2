import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { BASE_API_URL, API_URL, API_ENDPOINTS } from '../../config/api.config';
import { authedFetch } from '../../services/apiClient';
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

interface ReadinessQuizScreenProps {
    navigation: any;
}

export function ReadinessQuizScreen({ navigation }: ReadinessQuizScreenProps) {
    useThemeSubscription();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    // Initialize with empty array to verify fetch works.
    const [questions, setQuestions] = useState<Question[]>([]);
    const [questionSetNumber, setQuestionSetNumber] = useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    // Defensive lock-out — the readiness check-in is only unlocked after the
    // user completes their first workout. Used to be enforced exclusively by
    // EvolutionScreen (now removed from the tab bar). Keeping it here ensures
    // deep links and other entry points can't bypass the gate either.
    const [lockReason, setLockReason] = useState<'first_workout' | null>(null);
    const insets = useSafeAreaInsets();

    // Fetch questions from backend EVERY time screen is focused (not just on mount)
    useFocusEffect(
        useCallback(() => {
            let isMounted = true;

            const fetchQuestionsData = async (headers: Record<string, string>) => {
                console.log('[ReadinessQuiz] 📥 Step 2: Fetching questions...');
                // Use API_URL + API_ENDPOINTS to ensure correct path without double /api
                // endpoint already contains /api prefix
                const url = `${API_URL}${API_ENDPOINTS.READINESS_QUESTIONS}`;
                console.log('[ReadinessQuiz] 🌐 URL:', url);

                try {
                    const response = await authedFetch(url, {
                        method: 'GET',
                        headers,
                    });

                    console.log('[ReadinessQuiz] 📡 Questions Response status:', response.status);

                    if (response.ok && isMounted) {
                        const data: QuestionSetResponse = await response.json();
                        console.log(`[ReadinessQuiz] ✅ Success! Received Set #${data.setNumber}: "${data.setName}"`);
                        console.log(`[ReadinessQuiz] Questions count:`, data.questions?.length);
                        setQuestions(data.questions);
                        setQuestionSetNumber(data.setNumber);
                    } else {
                        const errorText = await response.text();
                        console.error('[ReadinessQuiz] ❌ Failed to fetch questions. Body:', errorText);
                    }
                } catch (error) {
                    console.error('[ReadinessQuiz] 💥 Network Error fetching questions:', error);
                }
            };

            const initializeScreen = async () => {
                console.log('[ReadinessQuiz] 🚀 Screen focused. Starting initialization sequence...');

                try {
                    if (isMounted) {
                        setIsLoading(true);
                        setQuestions([]); // Force empty state
                        setQuestionSetNumber(undefined);
                        setAnswers({});
                        setLockReason(null);
                    }

                    // 1. Limpeza de Cache (Solicitada)
                    console.log('[ReadinessQuiz] 🧹 Step 0: Clearing local cache...');
                    try {
                        await Storage.deleteItemAsync('readiness_questions');
                        console.log('[ReadinessQuiz] Cache cleared.');
                    } catch (e) {
                        console.warn('[ReadinessQuiz] Failed to clear cache (non-fatal):', e);
                    }

                    // Prepare headers
                    const userId = await Storage.getItemAsync('user_id');
                    console.log('[ReadinessQuiz] 👤 User ID:', userId);

                    const headers: Record<string, string> = {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                    };
                    if (userId) {
                        headers['x-user-id'] = userId;
                    }

                    // 2. Verificar Status (Solicitado: Sequence Check)
                    console.log('[ReadinessQuiz] 🔍 Step 1: Checking readiness status...');
                    const statusUrl = `${API_URL}${API_ENDPOINTS.READINESS_STATUS}`;
                    const statusRes = await authedFetch(statusUrl, { method: 'GET', headers });

                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        console.log(
                            '[ReadinessQuiz] 📊 Status received. CompletedToday?',
                            statusData.hasCompletedToday,
                            'FirstWorkout?',
                            statusData.hasCompletedFirstWorkout,
                        );

                        // GATE: must have completed first workout to access the quiz.
                        // This protects deep links and any future entry point.
                        if (!statusData.hasCompletedFirstWorkout) {
                            console.warn('[ReadinessQuiz] 🔒 Locked — no completed workouts yet.');
                            if (isMounted) setLockReason('first_workout');
                            return; // do NOT fetch questions
                        }

                        // "Garanta que o fetchQuestions() seja chamado explicitamente dentro do bloco if (!hasCompleted)"
                        if (!statusData.hasCompletedToday) {
                            console.log('[ReadinessQuiz] ▶️ User has NOT completed today. Proceeding to fetch questions...');
                            await fetchQuestionsData(headers);
                        } else {
                            console.warn('[ReadinessQuiz] ⚠️ User ALREADY completed check-in today.');
                            // Still fetching to avoid broken screen if user navigates here, but logging warning
                            console.log('[ReadinessQuiz] ▶️ Fetching questions anyway for review mode...');
                            await fetchQuestionsData(headers);
                        }
                    } else {
                        console.error('[ReadinessQuiz] ❌ Status check failed:', statusRes.status);
                        // Fallback: try to fetch questions anyway
                        await fetchQuestionsData(headers);
                    }

                } catch (error) {
                    console.error('[ReadinessQuiz] 💥 Critical initialization error:', error);
                } finally {
                    if (isMounted) {
                        setIsLoading(false);
                    }
                }
            };

            initializeScreen();

            return () => {
                console.log('[ReadinessQuiz] Screen blurred/unmounted. Cleanup.');
                isMounted = false;
            };
        }, [])
    );

    const currentQuestion = questions[currentStep];
    const totalSteps = questions.length;
    const progress = totalSteps > 0 ? (currentStep + 1) / totalSteps : 0;
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
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: semanticColors.textSecondary, marginTop: 16 }}>Carregando perguntas...</Text>
            </View>
        );
    }

    // Gate: user hasn't completed first workout yet
    if (lockReason === 'first_workout') {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <View style={styles.lockedContainer}>
                    <View style={styles.lockedIconWrap}>
                        <Ionicons name="footsteps-outline" size={36} color={colors.primary} />
                    </View>
                    <Text style={styles.lockedHeading}>Complete seu primeiro treino</Text>
                    <Text style={styles.lockedBody}>
                        O check-in diário e o score de prontidão são liberados
                        assim que você concluir sua primeira corrida. Vamos lá!
                    </Text>
                    <TouchableOpacity
                        style={styles.lockedCta}
                        onPress={() => navigation.navigate('Home')}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar para a Home"
                    >
                        <Text style={styles.lockedCtaText}>Voltar para a Home</Text>
                        <Ionicons name="arrow-forward" size={16} color={semanticColors.textOnAccent} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!currentQuestion || questions.length === 0) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20, justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <Ionicons name="cloud-offline-outline" size={48} color={colors.error} />
                <Text style={{ color: semanticColors.textPrimary, marginTop: 16, fontSize: 16, fontWeight: '600' }}>Erro ao carregar perguntas</Text>
                <Text style={{ color: semanticColors.textSecondary, marginTop: 8, textAlign: 'center', maxWidth: 300 }}>
                    Verifique sua conexão e tente novamente.
                </Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                        // Forcing navigation listener to trigger via simple state update or re-nav
                        setIsLoading(true);
                        // Re-trigger fetch logic (simplified for retry button, ideally calls fetchQuestions directly)
                        navigation.replace('ReadinessQuiz');
                    }}
                >
                    <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />

            {/* Top bar — back + step counter */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                    style={styles.backBtn}
                >
                    <Ionicons name="chevron-back" size={22} color={semanticColors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.topBarTitle}>Prontidão diária</Text>
                <Text style={styles.topBarCounter}>
                    {currentStep + 1}/{totalSteps}
                </Text>
            </View>

            {/* Progress bar — full width, clean */}
            <View style={styles.progressBar}>
                <View
                    style={[styles.progressFill, { width: `${progress * 100}%` }]}
                />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Question — no wrapping card, breathes naturally on the canvas */}
                <Text style={styles.question}>{currentQuestion.question}</Text>

                {/* Options — list-style, clean, Linear/Apple Health vibe */}
                <View style={styles.optionList}>
                    {currentQuestion.options.map((option) => {
                        const isSelected = selectedValue === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                style={[
                                    styles.option,
                                    isSelected && styles.optionSelected,
                                ]}
                                onPress={() => handleSelectOption(option.value)}
                                activeOpacity={0.85}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: isSelected }}
                                accessibilityLabel={option.label}
                            >
                                <View style={styles.optionTextWrap}>
                                    <Text
                                        style={[
                                            styles.optionLabel,
                                            isSelected && styles.optionLabelSelected,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                    {option.description ? (
                                        <Text
                                            style={[
                                                styles.optionDescription,
                                                isSelected && styles.optionDescriptionSelected,
                                            ]}
                                        >
                                            {option.description}
                                        </Text>
                                    ) : null}
                                </View>
                                <View
                                    style={[
                                        styles.radio,
                                        isSelected && styles.radioSelected,
                                    ]}
                                >
                                    {isSelected && (
                                        <Ionicons name="checkmark" size={14} color={semanticColors.textOnAccent} />
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Sticky bottom continue button */}
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity
                    style={[
                        styles.continueBtn,
                        !selectedValue && styles.continueBtnDisabled,
                    ]}
                    onPress={handleContinue}
                    disabled={!selectedValue}
                    accessibilityRole="button"
                    accessibilityLabel="Continuar"
                    accessibilityState={{ disabled: !selectedValue }}
                >
                    <Text
                        style={[
                            styles.continueBtnText,
                            !selectedValue && styles.continueBtnTextDisabled,
                        ]}
                    >
                        {currentStep === totalSteps - 1 ? 'Finalizar' : 'Continuar'}
                    </Text>
                    <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={selectedValue ? semanticColors.textOnAccent : semanticColors.textTertiary}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    // ---------- top bar
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.base,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.glass,
    },
    topBarTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    topBarCounter: {
        width: 44,
        textAlign: 'right',
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
        fontWeight: '700',
    },
    // ---------- progress
    progressBar: {
        marginHorizontal: spacing.base,
        height: 3,
        borderRadius: 2,
        backgroundColor: semanticColors.glass,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: colors.primary,
    },
    // ---------- content
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.base,
        paddingTop: spacing['2xl'],
        paddingBottom: spacing['2xl'],
    },
    question: {
        fontSize: 28,
        fontWeight: '700',
        color: semanticColors.textPrimary,
        letterSpacing: -0.5,
        lineHeight: 36,
        marginBottom: spacing.xl,
    },
    // ---------- options (Linear/Apple Health style)
    optionList: {
        gap: spacing.sm,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        paddingVertical: spacing.base,
        paddingHorizontal: spacing.lg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        minHeight: 56,
    },
    optionSelected: {
        borderColor: colors.primary,
        backgroundColor: semanticColors.accentSubtle,
    },
    optionTextWrap: {
        flex: 1,
        gap: 2,
    },
    optionLabel: {
        fontSize: typography.fontSizes.lg,
        fontWeight: '600',
        color: colors.text,
        letterSpacing: -0.2,
    },
    optionLabelSelected: {
        color: colors.primary,
    },
    optionDescription: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    optionDescriptionSelected: {
        color: semanticColors.accent,
    },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: semanticColors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.md,
    },
    radioSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    // ---------- sticky bottom bar
    bottomBar: {
        paddingHorizontal: spacing.base,
        paddingTop: spacing.md,
        backgroundColor: semanticColors.canvas,
        borderTopWidth: 1,
        borderTopColor: semanticColors.borderSubtle,
    },
    continueBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 28,
    },
    continueBtnDisabled: {
        backgroundColor: semanticColors.glass,
    },
    continueBtnText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '700',
        color: semanticColors.textOnAccent,
        letterSpacing: 0.2,
    },
    continueBtnTextDisabled: {
        color: semanticColors.textTertiary,
    },
    retryButton: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 24,
        marginTop: 24,
    },
    retryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: semanticColors.textOnAccent,
    },
    lockedContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing['2xl'],
        gap: spacing.lg,
    },
    lockedIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.accentSubtle,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    lockedHeading: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: '700',
        color: semanticColors.textPrimary,
        textAlign: 'center',
    },
    lockedBody: {
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 320,
    },
    lockedCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 28,
        marginTop: spacing.sm,
    },
    lockedCtaText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '700',
        color: semanticColors.textOnAccent,
    },
}));

export default ReadinessQuizScreen;
