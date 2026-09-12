import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StatusBar,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, fonts, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { API_URL, API_ENDPOINTS } from '../../config/api.config';
import { authedFetch } from '../../services/apiClient';
import * as Storage from '../../utils/storage';
import { useReadinessStore } from '../../stores/readinessStore';
import { ReadinessStateView } from '../../components/readiness/ReadinessStateView';
import {
    deriveReadinessLock,
    describeFloorProgress,
    FLOOR_EXPLANATION,
} from '../../utils/readinessPresentation';
import type { RootStackParamList } from '../../navigation/navigationRef';
import type { FloorProgress, ReadinessAnswers } from '../../types/readiness.types';

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

type ReadinessQuizScreenProps = NativeStackScreenProps<RootStackParamList, 'ReadinessQuiz'>;

/**
 * Por que o quiz NÃO mostra perguntas. `open` = mostra.
 *
 * Havia um único motivo (`'first_workout'`) e, para "já respondeu hoje", um
 * `console.warn` seguido de "busca as perguntas assim mesmo": o corredor
 * respondia de novo, o backend devolvia o veredito antigo e o app o exibia
 * como novo. As respostas iam para o vazio.
 */
type QuizGate =
    | { kind: 'open' }
    | { kind: 'aprendendo'; learning: FloorProgress | null }
    | { kind: 'indisponivel' }
    /** Já respondeu, mas o veredito não veio junto. Com veredito, vai direto para a revisão. */
    | { kind: 'ja_respondeu' };

const NO_CACHE_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};

/** O conjunto de perguntas do dia, ou `null` em qualquer falha. */
async function fetchQuestionSet(): Promise<QuestionSetResponse | null> {
    const userId = await Storage.getItemAsync('user_id');
    const headers = userId ? { ...NO_CACHE_HEADERS, 'x-user-id': userId } : NO_CACHE_HEADERS;

    // Cache-bust além dos headers — o conjunto roda às 03:00 e um proxy que
    // ignore `Cache-Control` entregaria o de ontem.
    const base = `${API_URL}${API_ENDPOINTS.READINESS_QUESTIONS}`;
    const url = `${base}${base.includes('?') ? '&' : '?'}_t=${Date.now()}`;

    try {
        const response = await authedFetch(url, { method: 'GET', headers });
        if (!response.ok) {
            console.error('[ReadinessQuiz] Falha ao buscar perguntas:', response.status);
            return null;
        }
        const data = (await response.json()) as QuestionSetResponse;
        return Array.isArray(data?.questions) ? data : null;
    } catch (error) {
        console.error('[ReadinessQuiz] Erro de rede ao buscar perguntas:', error);
        return null;
    }
}

export function ReadinessQuizScreen({ navigation }: ReadinessQuizScreenProps) {
    useThemeSubscription();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [questions, setQuestions] = useState<Question[]>([]);
    const [questionSetNumber, setQuestionSetNumber] = useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [gate, setGate] = useState<QuizGate>({ kind: 'open' });
    const insets = useSafeAreaInsets();

    const setAnswer = useReadinessStore((s) => s.setAnswer);
    const setSetNumber = useReadinessStore((s) => s.setSetNumber);
    const resetQuiz = useReadinessStore((s) => s.resetQuiz);
    const fetchReadinessStatus = useReadinessStore((s) => s.fetchReadinessStatus);

    /**
     * Descarte de resposta atrasada por SESSÃO — padrão herdado da cópia órfã
     * (DESENHO-readiness-estado-ja-respondeu.md §4a).
     *
     * O `isMounted` que existia aqui não protege foco → desfoco → foco rápido:
     * duas inicializações em voo, e a mais lenta aplicava por último. Cada foco
     * ganha um id; o cleanup o invalida; só a sessão corrente escreve estado.
     */
    const sessionRef = useRef(0);

    const leave = useCallback(() => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Main', { initialTab: 'Wellness' });
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            const session = ++sessionRef.current;
            const isCurrent = () => sessionRef.current === session;

            const initialize = async () => {
                setIsLoading(true);
                setQuestions([]);
                setQuestionSetNumber(undefined);
                setAnswers({});
                setCurrentStep(0);
                setGate({ kind: 'open' });

                // A sessão anterior do quiz não pode vazar para esta — ver
                // `resetQuiz` no store.
                resetQuiz();

                try {
                    await Storage.deleteItemAsync('readiness_questions');
                } catch {
                    // cache local; não-fatal
                }

                // O STATUS VEM ANTES DAS PERGUNTAS, e lido do store fresco — não
                // do closure (§1.3-1.4 do desenho preservado).
                await fetchReadinessStatus();
                if (!isCurrent()) return;
                const status = useReadinessStore.getState().readinessStatus;

                // Precedência estrita: quem já respondeu hoje nem chega às
                // perguntas (§1.5).
                if (status?.hasCompletedToday) {
                    if (status.todayVerdict) {
                        // `replace`: o "voltar" da revisão cai na Wellness, não aqui.
                        navigation.replace('ReadinessResult', { mode: 'review' });
                        return;
                    }
                    setGate({ kind: 'ja_respondeu' });
                    return;
                }

                const lock = deriveReadinessLock(status);
                if (lock.kind === 'indisponivel') {
                    // Antes: "busca as perguntas assim mesmo". Responder sem saber
                    // a elegibilidade podia terminar numa recusa depois da última
                    // pergunta.
                    setGate({ kind: 'indisponivel' });
                    return;
                }
                if (lock.kind === 'aprendendo') {
                    setGate({ kind: 'aprendendo', learning: lock.learning });
                    return;
                }

                const set = await fetchQuestionSet();
                if (!isCurrent() || !set) return;
                setQuestions(set.questions);
                setQuestionSetNumber(set.setNumber);
            };

            initialize()
                .catch((error) => {
                    console.error('[ReadinessQuiz] Erro na inicialização:', error);
                })
                .finally(() => {
                    if (isCurrent()) setIsLoading(false);
                });

            return () => {
                sessionRef.current += 1;
            };
        }, [navigation, resetQuiz, fetchReadinessStatus]),
    );

    const currentQuestion = questions[currentStep];
    const totalSteps = questions.length;
    const progress = totalSteps > 0 ? (currentStep + 1) / totalSteps : 0;
    const selectedValue = currentQuestion ? answers[currentQuestion.id] : undefined;

    const handleSelectOption = (value: number) => {
        if (!currentQuestion) return;
        setAnswers(prev => ({
            ...prev,
            [currentQuestion.id]: value,
        }));
        // Also save to store for persistence
        setAnswer(currentQuestion.id as keyof ReadinessAnswers, value);
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
            navigation.navigate('ReadinessResult', { mode: 'submit' });
        }
    };

    // Show loading state while fetching questions
    if (isLoading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20, justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Carregando perguntas...</Text>
            </View>
        );
    }

    if (gate.kind === 'aprendendo') {
        return (
            <ReadinessStateView
                visual="padlock"
                title="Calibrando sua prontidão"
                body={describeFloorProgress(gate.learning)}
                note={FLOOR_EXPLANATION}
                primaryAction={{ label: 'Voltar', onPress: leave }}
            />
        );
    }

    if (gate.kind === 'indisponivel') {
        return (
            <ReadinessStateView
                visual="warning"
                tone="warning"
                title="Não consegui verificar seu histórico"
                body="Pode ser a conexão. Tente de novo em instantes."
                primaryAction={{ label: 'Tentar de novo', onPress: () => navigation.replace('ReadinessQuiz') }}
                secondaryAction={{ label: 'Voltar', onPress: leave }}
            />
        );
    }

    if (gate.kind === 'ja_respondeu') {
        // O desenho preservado §2, com a CTA voltando de onde o corredor veio.
        return (
            <ReadinessStateView
                visual="check"
                title="Prontidão Concluída!"
                body="Você já realizou seu check-in de prontidão hoje."
                note="Próximo check-in disponível amanhã após as 03:00 AM"
                primaryAction={{ label: 'Voltar', onPress: leave }}
            />
        );
    }

    if (!currentQuestion || questions.length === 0) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + 20, justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <Ionicons name="cloud-offline-outline" size={48} color={colors.error} />
                <Text style={styles.errorTitle}>Erro ao carregar perguntas</Text>
                <Text style={styles.errorBody}>
                    Verifique sua conexão e tente novamente.
                </Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                        setIsLoading(true);
                        navigation.replace('ReadinessQuiz');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar novamente"
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
    loadingText: {
        fontFamily: fonts.regular,
        color: semanticColors.textSecondary,
        marginTop: 16,
    },
    errorTitle: {
        fontFamily: fonts.semibold,
        color: semanticColors.textPrimary,
        marginTop: 16,
        fontSize: 16,
    },
    errorBody: {
        fontFamily: fonts.regular,
        color: semanticColors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
        maxWidth: 300,
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
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
        letterSpacing: 0.3,
    },
    topBarCounter: {
        width: 44,
        textAlign: 'right',
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.sm,
        color: colors.primary,
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
        fontFamily: fonts.bold,
        fontSize: 28,
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
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
        letterSpacing: -0.2,
    },
    optionLabelSelected: {
        color: colors.primary,
    },
    optionDescription: {
        fontFamily: fonts.regular,
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
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
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
        fontFamily: fonts.semibold,
        fontSize: 16,
        color: semanticColors.textOnAccent,
    },
}));

export default ReadinessQuizScreen;
