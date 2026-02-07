import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';

const QUICK_OPTIONS = [50, 60, 70, 80, 90, 100];

interface WeightScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

export function WeightScreen({ value, onChange }: WeightScreenProps) {
    const [selectedWeight, setSelectedWeight] = useState<number | null>(value || null);
    const [customWeight, setCustomWeight] = useState<string>(value ? String(value) : '');

    useEffect(() => {
        if (value) {
            setSelectedWeight(value);
            setCustomWeight(String(value));
        }
    }, [value]);

    const handleQuickSelect = (weight: number) => {
        setSelectedWeight(weight);
        setCustomWeight(String(weight));
        if (onChange) {
            onChange(weight);
        }
    };

    const handleCustomChange = (text: string) => {
        // Only allow numbers
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
                    Qual é o seu peso{'\n'}
                    <Text style={styles.titleHighlight}>atual?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Usamos para calcular suas zonas de esforço e calorias.
                </Text>
            </View>

            {/* Quick Selection Pills */}
            <View style={styles.pillsContainer}>
                {QUICK_OPTIONS.map((weight) => (
                    <TouchableOpacity
                        key={weight}
                        style={[
                            styles.pill,
                            selectedWeight === weight && styles.pillSelected
                        ]}
                        onPress={() => handleQuickSelect(weight)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.pillText,
                            selectedWeight === weight && styles.pillTextSelected
                        ]}>
                            {weight}kg
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Custom Input */}
            <View style={styles.customInputContainer}>
                <Text style={styles.customLabel}>Peso exato (kg)</Text>
                <View style={styles.inputWrapper}>
                    <TextInput
                        style={styles.input}
                        value={customWeight}
                        onChangeText={handleCustomChange}
                        keyboardType="numeric"
                        placeholder="Ex: 75"
                        placeholderTextColor={colors.textMuted}
                        maxLength={3}
                    />
                    <Text style={styles.inputSuffix}>kg</Text>
                </View>
            </View>

            {/* Display Selected */}
            {selectedWeight && (
                <View style={styles.selectedCard}>
                    <Text style={styles.selectedLabel}>Peso selecionado</Text>
                    <Text style={styles.selectedValue}>{selectedWeight} kg</Text>
                </View>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 32,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 40,
        marginBottom: 12,
    },
    titleHighlight: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 24,
    },
    pillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 32,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: colors.card,
        borderRadius: borderRadius.full,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    pillSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    pillText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    pillTextSelected: {
        color: colors.primary,
    },
    customInputContainer: {
        marginBottom: 32,
    },
    customLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
        marginBottom: 12,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        borderWidth: 2,
        borderColor: colors.border,
        paddingHorizontal: 20,
    },
    input: {
        flex: 1,
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        paddingVertical: 16,
    },
    inputSuffix: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
    },
    selectedCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 20,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.primary,
        ...shadows.neon,
    },
    selectedLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    selectedValue: {
        fontSize: 48,
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
});

export default WeightScreen;
