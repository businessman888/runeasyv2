import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanMuted: 'rgba(0, 127, 153, 0.3)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
};

// Circular checkbox component
const CircularCheckbox = ({ selected }: { selected: boolean }) => (
    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    fill={DS.bg}
                />
            </Svg>
        )}
    </View>
);

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
    const [selectedWeight, setSelectedWeight] = useState<number | null>(value || null);
    const [customWeight, setCustomWeight] = useState<string>(value ? String(value) : '');
    const [showCustom, setShowCustom] = useState(false);

    useEffect(() => {
        if (value) {
            setSelectedWeight(value);
            setCustomWeight(String(value));
        }
    }, [value]);

    const handleSelect = (weight: number) => {
        setSelectedWeight(weight);
        setCustomWeight(String(weight));
        setShowCustom(false);
        if (onChange) {
            onChange(weight);
        }
    };

    const handleCustomChange = (text: string) => {
        const numericText = text.replace(/[^0-9]/g, '');
        setCustomWeight(numericText);

        const weight = parseInt(numericText, 10);
        if (!isNaN(weight) && weight > 0 && weight <= 300) {
            setSelectedWeight(weight);
            if (onChange) {
                onChange(weight);
            }
        } else if (numericText === '') {
            setSelectedWeight(null);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual é o seu{'\n'}
                    <Text style={styles.titleHighlight}>peso atual</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Usamos para calcular suas zonas de esforço e calorias.
                </Text>
            </View>

            {/* Weight Cards - Full Width Vertical */}
            <View style={styles.cardsContainer}>
                {WEIGHT_OPTIONS.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.card,
                            selectedWeight === option.value && styles.cardSelected,
                        ]}
                        onPress={() => handleSelect(option.value)}
                        activeOpacity={0.7}
                    >
                        <CircularCheckbox selected={selectedWeight === option.value} />
                        <View style={styles.cardContent}>
                            <Text style={[
                                styles.cardTitle,
                                selectedWeight === option.value && styles.cardTitleSelected,
                            ]}>
                                {option.label}
                            </Text>
                            <Text style={styles.cardSubtitle}>{option.range}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Custom Input Toggle */}
            <TouchableOpacity
                style={styles.customToggle}
                onPress={() => setShowCustom(!showCustom)}
            >
                <Text style={styles.customToggleText}>
                    {showCustom ? 'Escolher opção' : 'Inserir peso exato'}
                </Text>
            </TouchableOpacity>

            {/* Custom Input (conditional) */}
            {showCustom && (
                <View style={styles.customInputContainer}>
                    <TextInput
                        style={styles.input}
                        value={customWeight}
                        onChangeText={handleCustomChange}
                        keyboardType="numeric"
                        placeholder="Ex: 73"
                        placeholderTextColor={DS.textSecondary}
                        maxLength={3}
                    />
                    <Text style={styles.inputSuffix}>kg</Text>
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 32,
        marginBottom: 12,
    },
    titleHighlight: {
        color: DS.cyan,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 22,
    },
    cardsContainer: {
        gap: 10,
        marginBottom: 16,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
        gap: 14,
    },
    cardSelected: {
        borderColor: DS.cyan,
        backgroundColor: DS.cyanMuted,
        shadowColor: DS.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 4,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: DS.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: DS.cyan,
        borderColor: DS.cyan,
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: DS.text,
    },
    cardTitleSelected: {
        color: DS.cyan,
    },
    cardSubtitle: {
        fontSize: 13,
        fontWeight: '400',
        color: DS.textSecondary,
        marginTop: 2,
    },
    customToggle: {
        alignSelf: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    customToggleText: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.cyan,
        textDecorationLine: 'underline',
    },
    customInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: DS.cyan,
        paddingHorizontal: 20,
        marginTop: 12,
    },
    input: {
        flex: 1,
        fontSize: 24,
        fontWeight: '700',
        color: DS.text,
        paddingVertical: 16,
    },
    inputSuffix: {
        fontSize: 18,
        fontWeight: '500',
        color: DS.textSecondary,
    },
});

export default WeightScreen;
