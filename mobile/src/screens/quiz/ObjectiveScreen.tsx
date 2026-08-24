import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { OBJECTIVE_ICONS } from './_icons';
import { createThemeStyles, useThemeSubscription } from '../../theme';

interface ObjectiveOption {
    storeValue: string;
    title: string;
    subtitle: string;
}

const objectives: ObjectiveOption[] = [
    { storeValue: '5k', title: '5K', subtitle: 'Primeiros passos' },
    { storeValue: '10k', title: '10K', subtitle: 'Resistência' },
    { storeValue: 'half_marathon', title: 'Meia Maratona', subtitle: '21 km' },
    { storeValue: 'marathon', title: 'Maratona', subtitle: '42 km - Desafio supremo' },
    { storeValue: 'general_fitness', title: 'Fitness Geral', subtitle: 'Saúde e bem-estar' },
];

interface ObjectiveScreenProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function ObjectiveScreen({ value, onChange }: ObjectiveScreenProps) {
    useThemeSubscription();
    const [selected, setSelected] = useState<string | null>(value || null);

    useEffect(() => {
        setSelected(value || null);
    }, [value]);

    const handleSelect = (storeValue: string) => {
        setSelected(storeValue);
        onChange?.(storeValue);
    };

    return (
        <>
            <QuizHeader
                title={<>Qual é o seu principal <Hl>objetivo</Hl>?</>}
                subtitle="Vamos personalizar seu treino para sua meta específica."
            />

            <View style={styles.options}>
                {objectives.map((option) => (
                    <SelectableOption
                        key={option.storeValue}
                        icon={OBJECTIVE_ICONS[option.storeValue]}
                        title={option.title}
                        subtitle={option.subtitle}
                        selected={selected === option.storeValue}
                        onPress={() => handleSelect(option.storeValue)}
                    />
                ))}
            </View>
        </>
    );
}

const styles = createThemeStyles(() => ({
    options: {
        gap: QUIZ.gapOptions,
    },
}));

export default ObjectiveScreen;
