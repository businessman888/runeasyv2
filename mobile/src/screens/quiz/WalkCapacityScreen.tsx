import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuizHeader, Hl } from '../../components/onboarding/QuizHeader';
import { SelectableOption } from '../../components/onboarding/SelectableOption';
import { QUIZ } from './_tokens';
import { WALK_CAPACITY_ICONS } from './_icons';
import { createThemeStyles, useThemeSubscription } from '../../theme';

// Mostrada APENAS no fluxo "nunca corri" (recentDistance === 0). Quem nunca correu
// não é tudo igual: um sedentário e alguém que caminha diariamente têm pontos de
// partida muito diferentes. A resposta dá ao motor (Fase B) o ponto de partida do
// protocolo caminhada/corrida.
const OPTIONS = [
    { value: 'easy', label: 'Sim, tranquilamente', description: 'Sem dificuldade' },
    { value: 'effort', label: 'Sim, com esforço', description: 'Chego ao fim cansado' },
    { value: 'not_yet', label: 'Ainda não', description: 'Preciso parar antes' },
];

interface WalkCapacityScreenProps {
    value?: string | null;
    onChange?: (value: string) => void;
}

export function WalkCapacityScreen({ value, onChange }: WalkCapacityScreenProps) {
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
                title={<>Você consegue <Hl>caminhar 30 minutos</Hl> sem parar?</>}
                subtitle="Todo mundo começa de algum lugar. Isso define o ponto de partida ideal pra você."
            />

            <View style={styles.options}>
                {OPTIONS.map((opt) => (
                    <SelectableOption
                        key={opt.value}
                        icon={WALK_CAPACITY_ICONS[opt.value]}
                        title={opt.label}
                        subtitle={opt.description}
                        selected={selected === opt.value}
                        onPress={() => handleSelect(opt.value)}
                    />
                ))}
            </View>

            <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                    🚶 Vamos montar um plano de caminhada e corrida progressivo, no seu ritmo.
                </Text>
            </View>
        </>
    );
}

const styles = createThemeStyles(() => ({
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
}));

export default WalkCapacityScreen;
