import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { RECENT_FREQUENCY_ICONS } from './_icons';

// Captura recência + hábito de uma vez: "não corri" sinaliza que a distância
// recente é histórica (o motor de volume da Fase B desconta), e a frequência é
// o melhor preditor isolado de condicionamento atual.
const OPTIONS = [
    { value: 'never', label: 'Não corri', description: 'Nas últimas 4 semanas' },
    { value: '1x', label: '1x por semana', description: 'Esporádico' },
    { value: '2x', label: '2x por semana', description: 'Regular' },
    { value: '3x', label: '3x por semana', description: 'Consistente' },
    { value: '4x_plus', label: '4x ou mais', description: 'Alta frequência' },
];

interface RecentFrequencyScreenProps {
    value?: string | null;
    onChange?: (value: string) => void;
}

export function RecentFrequencyScreen({ value, onChange }: RecentFrequencyScreenProps) {
    const [selected, setSelected] = useState<string | null>(value ?? null);

    useEffect(() => {
        if (value !== undefined) {
            setSelected(value);
        }
    }, [value]);

    const handleSelect = (v: string) => {
        setSelected(v);
        onChange?.(v);
    };

    return (
        <>
            <QuizHeader
                title={<>Nas últimas 4 semanas, com que frequência você <Hl>correu</Hl>?</>}
                subtitle="Isso mostra seu ritmo atual de treino — não só o que você já fez um dia."
            />

            <View style={styles.options}>
                {OPTIONS.map((opt) => (
                    <SelectableOption
                        key={opt.value}
                        icon={RECENT_FREQUENCY_ICONS[opt.value]}
                        title={opt.label}
                        subtitle={opt.description}
                        selected={selected === opt.value}
                        onPress={() => handleSelect(opt.value)}
                    />
                ))}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    options: {
        gap: QUIZ.gapOptions,
        marginBottom: 24,
    },
});

export default RecentFrequencyScreen;
