import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { WEEKLY_KM_ICONS } from './_icons';
import { createThemeStyles, useThemeSubscription } from '../../theme';

// Número âncora do motor de volume (Fase B): o plano abre a partir daqui, não do
// rótulo "iniciante". Faixas (não campo numérico) porque ninguém sabe o volume
// exato de cabeça, mas todo mundo se localiza numa faixa.
const OPTIONS = [
    { value: 'lt5', label: 'Menos de 5 km', description: 'Começando' },
    { value: '5_10', label: '5 a 10 km', description: 'Base leve' },
    { value: '10_20', label: '10 a 20 km', description: 'Base sólida' },
    { value: '20_30', label: '20 a 30 km', description: 'Volume alto' },
    { value: 'gt30', label: 'Mais de 30 km', description: 'Avançado' },
];

interface CurrentWeeklyKmScreenProps {
    value?: string | null;
    onChange?: (value: string) => void;
}

export function CurrentWeeklyKmScreen({ value, onChange }: CurrentWeeklyKmScreenProps) {
    useThemeSubscription();
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
                title={<>Quantos km você corre por semana <Hl>atualmente</Hl>?</>}
                subtitle="É a partir daqui que seu plano começa. Escolha a faixa mais próxima da sua realidade de hoje."
            />

            <View style={styles.options}>
                {OPTIONS.map((opt) => (
                    <SelectableOption
                        key={opt.value}
                        icon={WEEKLY_KM_ICONS[opt.value]}
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

const styles = createThemeStyles(() => ({
    options: {
        gap: QUIZ.gapOptions,
        marginBottom: 24,
    },
}));

export default CurrentWeeklyKmScreen;
