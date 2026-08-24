import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { GOAL_TYPE_ICONS } from './_icons';
import { createThemeStyles, useThemeSubscription } from '../../theme';

type GoalType = 'distance' | 'race';

interface GoalTypeOption {
    id: GoalType;
    title: string;
    subtitle: string;
}

const OPTIONS: GoalTypeOption[] = [
    {
        id: 'distance',
        title: 'Distância',
        subtitle: 'Treinar progressivamente até minha meta',
    },
    {
        id: 'race',
        title: 'Tenho uma prova',
        subtitle: 'Me preparar para uma corrida específica',
    },
];

interface GoalTypeScreenProps {
    value?: GoalType | null;
    onChange?: (value: GoalType) => void;
}

export function GoalTypeScreen({ value, onChange }: GoalTypeScreenProps) {
    useThemeSubscription();
    const [selected, setSelected] = useState<GoalType | null>(value ?? null);

    useEffect(() => {
        setSelected(value ?? null);
    }, [value]);

    const handleSelect = (id: GoalType) => {
        setSelected(id);
        onChange?.(id);
    };

    return (
        <>
            <QuizHeader
                title={<>Qual a sua meta <Hl>principal</Hl>?</>}
                subtitle="Isso ajuda o Coach AI a montar o plano ideal para você."
            />

            <View style={styles.options}>
                {OPTIONS.map((option) => (
                    <SelectableOption
                        key={option.id}
                        icon={GOAL_TYPE_ICONS[option.id]}
                        title={option.title}
                        subtitle={option.subtitle}
                        selected={selected === option.id}
                        onPress={() => handleSelect(option.id)}
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

export default GoalTypeScreen;
