import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { StepSlider } from '../../components/onboarding/StepSlider';
import { QUIZ } from './_tokens';
import { createThemeStyles, useThemeSubscription } from '../../theme';

// ── Smart recommendation logic ──────────────────────────────────────────
interface FrequencyRecommendation {
    min: number;
    max: number;
    maxAllowed: number; // hard cap for the slider
    text: string;
}

function getRecommendation(goal?: string, level?: string): FrequencyRecommendation {
    // Beginner — always conservative regardless of goal
    if (level === 'beginner') {
        return {
            min: 2, max: 3, maxAllowed: 5,
            text: 'Iniciantes devem correr em dias alternados (ex.: Seg, Qua, Sex) para recuperação muscular e articular (48h).',
        };
    }

    // General fitness — moderate regardless of level
    if (goal === 'general_fitness') {
        return {
            min: 2, max: 3, maxAllowed: 5,
            text: 'Para saúde e bem-estar, 2-3 dias por semana com dias alternados é o ideal para manter a consistência.',
        };
    }

    // Performance (5k / 10k) — intermediate or advanced
    if (goal === '5k' || goal === '10k') {
        return {
            min: 3, max: 4, maxAllowed: 7,
            text: 'Para melhorar seu desempenho em provas curtas, 3-4 dias permitem incluir intervalados e longão sem sobrecarga.',
        };
    }

    // Half marathon / Marathon — intermediate
    if (level === 'intermediate' && (goal === 'half_marathon' || goal === 'marathon')) {
        return {
            min: 4, max: 5, maxAllowed: 7,
            text: 'Para meia/maratona no nível intermediário, 4-5 dias são fundamentais para construir base aeróbica e volume.',
        };
    }

    // Half marathon / Marathon — advanced
    if (level === 'advanced' && (goal === 'half_marathon' || goal === 'marathon')) {
        return {
            min: 5, max: 7, maxAllowed: 7,
            text: 'Corredores avançados de longa distância treinam 5-7 dias por semana, incluindo sessões duplas quando necessário.',
        };
    }

    // Fallback
    return {
        min: 3, max: 4, maxAllowed: 7,
        text: 'Nós recomendamos pelo menos 3 dias para resultados consistentes no primeiro mês.',
    };
}

// ─────────────────────────────────────────────────────────────────────────

interface FrequencyScreenProps {
    value?: number;
    onChange?: (value: number) => void;
    goal?: string;
    experience_level?: string;
    onLockScroll?: () => void;
    onUnlockScroll?: () => void;
}

export function FrequencyScreen({
    value,
    onChange,
    goal,
    experience_level,
    onLockScroll,
    onUnlockScroll,
}: FrequencyScreenProps) {
    useThemeSubscription();
    const recommendation = useMemo(
        () => getRecommendation(goal, experience_level),
        [goal, experience_level],
    );

    // Available days based on the hard cap (2 .. maxAllowed)
    const daysList = useMemo(() => {
        const arr: number[] = [];
        for (let d = 2; d <= recommendation.maxAllowed; d++) arr.push(d);
        return arr;
    }, [recommendation.maxAllowed]);

    // Clamp initial/restored value to the allowed range
    const clampedValue = useMemo(() => {
        const v = value ?? recommendation.min;
        return Math.max(2, Math.min(v, recommendation.maxAllowed));
    }, [value, recommendation]);

    const [selectedDays, setSelectedDays] = useState<number>(clampedValue);

    // Sync from parent value or re-clamp when the recommendation changes
    useEffect(() => {
        const next = value ?? recommendation.min;
        const clamped = Math.max(2, Math.min(next, recommendation.maxAllowed));
        if (clamped !== selectedDays) {
            setSelectedDays(clamped);
            if (clamped !== value && onChange) onChange(clamped);
        }
    }, [value, recommendation.maxAllowed]);

    const handleSelectDay = useCallback((day: number) => {
        setSelectedDays(day);
        onChange?.(day);
    }, [onChange]);

    return (
        <>
            <QuizHeader
                title={<>Quantos dias por semana você pode <Hl>treinar</Hl>?</>}
                subtitle="Escolha a frequência que cabe na sua rotina. Ajustamos o volume do plano a partir dela."
            />

            {/* Compact value readout */}
            <View style={styles.readout}>
                <Text style={styles.value}>{selectedDays}</Text>
                <Text style={styles.unit}>dias / semana</Text>
            </View>

            <View style={styles.sliderWrap}>
                <StepSlider
                    values={daysList}
                    value={selectedDays}
                    onChange={handleSelectDay}
                    onLockScroll={onLockScroll}
                    onUnlockScroll={onUnlockScroll}
                />
            </View>

            {/* Smart recommendation card */}
            <View style={styles.tipCard}>
                <Ionicons
                    name="bulb-outline"
                    size={20}
                    color={QUIZ.color.cyan}
                    style={styles.tipIcon}
                />
                <View style={styles.tipTextWrap}>
                    <Text style={styles.tipHighlight}>
                        Recomendado: {recommendation.min}-{recommendation.max} dias
                    </Text>
                    <Text style={styles.tipText}>{recommendation.text}</Text>
                </View>
            </View>
        </>
    );
}

const styles = createThemeStyles(() => ({
    readout: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
    },
    value: {
        fontFamily: QUIZ.title.fontFamily,
        fontSize: 40,
        color: QUIZ.color.cyan,
        lineHeight: 46,
    },
    unit: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: QUIZ.subtitle.fontSize,
        color: QUIZ.color.textDim,
    },
    sliderWrap: {
        marginBottom: 28,
    },
    tipCard: {
        flexDirection: 'row',
        backgroundColor: QUIZ.color.card,
        borderRadius: QUIZ.card.radius,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: QUIZ.color.stroke,
        padding: 14,
        alignItems: 'flex-start',
    },
    tipIcon: {
        marginRight: 10,
        marginTop: 1,
    },
    tipTextWrap: {
        flex: 1,
    },
    tipHighlight: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: 14,
        color: QUIZ.color.cyan,
        marginBottom: 3,
    },
    tipText: {
        fontFamily: QUIZ.optionSubtitle.fontFamily,
        fontSize: 13,
        color: QUIZ.color.textDim,
        lineHeight: 18,
    },
}));

export default FrequencyScreen;
