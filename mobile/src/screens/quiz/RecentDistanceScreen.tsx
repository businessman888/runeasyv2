import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { DISTANCE_ICONS } from './_icons';

// value 0 = "Nunca corri" (sentinela). Escolher essa opção adapta o fluxo:
// pula tempo/pace/frequência/volume e leva à pergunta de caminhada (Fase A).
const DISTANCES = [
    { value: 0, label: 'Nunca corri', description: 'Estou começando agora' },
    { value: 3, label: '3 km', description: 'Iniciante' },
    { value: 5, label: '5 km', description: 'Popular' },
    { value: 10, label: '10 km', description: 'Intermediário' },
    { value: 15, label: '15+ km', description: 'Avançado' },
];

interface RecentDistanceScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function RecentDistanceScreen({ value, onChange }: RecentDistanceScreenProps) {
    const [selected, setSelected] = useState<number | null>(value ?? null);

    useEffect(() => {
        if (value !== undefined) {
            setSelected(value);
        }
    }, [value]);

    const handleSelect = (distance: number) => {
        setSelected(distance);
        onChange?.(distance);
    };

    return (
        <>
            <QuizHeader
                title={<>Qual foi a maior distância <Hl>que você correu recentemente</Hl>?</>}
                subtitle="Considere corridas dos últimos meses — queremos sua capacidade de hoje, não o seu recorde histórico."
            />

            <View style={styles.options}>
                {DISTANCES.map((distance) => (
                    <SelectableOption
                        key={distance.value}
                        icon={DISTANCE_ICONS[distance.value]}
                        title={distance.label}
                        subtitle={distance.description}
                        selected={selected === distance.value}
                        onPress={() => handleSelect(distance.value)}
                    />
                ))}
            </View>

            <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                    🏃 Seja realista: é a partir daqui que calibramos a progressão do seu plano.
                </Text>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    options: {
        gap: QUIZ.gapOptions,
        marginBottom: 24,
    },
    infoCard: {
        backgroundColor: QUIZ.color.card,
        borderRadius: QUIZ.card.radius,
        padding: 16,
    },
    infoText: {
        fontFamily: QUIZ.subtitle.fontFamily,
        fontSize: 14,
        color: QUIZ.color.textDim,
        lineHeight: 20,
    },
});

export default RecentDistanceScreen;
