import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { LEVEL_ICONS } from './_icons';
import { createThemeStyles, useThemeSubscription } from '../../theme';

interface LevelOption {
    storeValue: string;
    title: string;
    subtitle: string;
}

const levels: LevelOption[] = [
    { storeValue: 'beginner', title: 'Iniciante', subtitle: '0-6 meses de prática' },
    { storeValue: 'intermediate', title: 'Intermediário', subtitle: '6 meses - 2 anos' },
    { storeValue: 'advanced', title: 'Avançado', subtitle: 'Mais de 2 anos' },
];

interface LevelScreenProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function LevelScreen({ value, onChange }: LevelScreenProps) {
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
                title={<>Qual é o seu nível <Hl>atual</Hl>?</>}
                subtitle="Selecione a opção que melhor descreve seu histórico de treinos. Isso nos ajuda a calibrar a intensidade."
            />

            <View style={styles.options}>
                {levels.map((option) => (
                    <SelectableOption
                        key={option.storeValue}
                        icon={LEVEL_ICONS[option.storeValue]}
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

export default LevelScreen;
