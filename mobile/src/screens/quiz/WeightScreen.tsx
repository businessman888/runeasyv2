import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { ValueInputSheet } from '../../components/onboarding/ValueInputSheet';
import { QUIZ } from './_tokens';
import { createThemeStyles, useThemeSubscription } from '../../theme';

const WEIGHT_OPTIONS = [
    { value: 50, label: '50 kg', range: '45-55 kg' },
    { value: 60, label: '60 kg', range: '55-65 kg' },
    { value: 70, label: '70 kg', range: '65-75 kg' },
    { value: 80, label: '80 kg', range: '75-85 kg' },
    { value: 90, label: '90 kg', range: '85-95 kg' },
    { value: 100, label: '100 kg', range: '95+ kg' },
];

interface WeightScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function WeightScreen({ value, onChange }: WeightScreenProps) {
    useThemeSubscription();
    const [selectedWeight, setSelectedWeight] = useState<number | null>(value || null);
    const [sheetOpen, setSheetOpen] = useState(false);

    useEffect(() => {
        if (value) setSelectedWeight(value);
    }, [value]);

    const handleSelect = (weight: number) => {
        setSelectedWeight(weight);
        onChange?.(weight);
    };

    const isPreset = WEIGHT_OPTIONS.some((o) => o.value === selectedWeight);
    const hasCustom = selectedWeight != null && !isPreset;

    return (
        <>
            <QuizHeader
                title={<>Qual é o seu <Hl>peso atual</Hl>?</>}
                subtitle="Usamos para calcular suas zonas de esforço e calorias."
            />

            <View style={styles.options}>
                {WEIGHT_OPTIONS.map((option) => (
                    <SelectableOption
                        key={option.value}
                        title={option.label}
                        subtitle={option.range}
                        selected={selectedWeight === option.value}
                        onPress={() => handleSelect(option.value)}
                    />
                ))}
            </View>

            <TouchableOpacity
                style={styles.customToggle}
                onPress={() => setSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Inserir peso exato"
            >
                <Text style={styles.customToggleText}>
                    {hasCustom ? `Peso exato: ${selectedWeight} kg · editar` : 'Inserir peso exato'}
                </Text>
            </TouchableOpacity>

            <ValueInputSheet
                visible={sheetOpen}
                onClose={() => setSheetOpen(false)}
                onConfirm={handleSelect}
                title="Peso exato"
                suffix="kg"
                min={30}
                max={250}
                initialValue={selectedWeight}
                placeholder="Ex: 73"
            />
        </>
    );
}

const styles = createThemeStyles(() => ({
    options: {
        gap: QUIZ.gapOptions,
        marginBottom: 16,
    },
    customToggle: {
        alignSelf: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    customToggleText: {
        fontFamily: QUIZ.optionSubtitle.fontFamily,
        fontSize: 14,
        color: QUIZ.color.cyan,
        textDecorationLine: 'underline',
    },
}));

export default WeightScreen;
