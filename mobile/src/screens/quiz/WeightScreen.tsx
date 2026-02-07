import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { colors, borderRadius } from '../../theme';

interface WeightScreenProps {
    value: number | null;
    onChange: (weight: number) => void;
}

const WEIGHT_OPTIONS = [50, 60, 70, 80, 90, 100];

export const WeightScreen: React.FC<WeightScreenProps> = ({
    value,
    onChange,
}) => {
    const [customWeight, setCustomWeight] = useState('');
    const [isCustomSelected, setIsCustomSelected] = useState(false);

    const handleSelectOption = (weight: number) => {
        setIsCustomSelected(false);
        setCustomWeight('');
        onChange(weight);
    };

    const handleCustomChange = (text: string) => {
        // Only allow numbers and one decimal point
        const filtered = text.replace(/[^0-9.]/g, '');
        const parts = filtered.split('.');
        const formatted = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered;

        setCustomWeight(formatted);
        setIsCustomSelected(true);

        const numValue = parseFloat(formatted);
        if (!isNaN(numValue) && numValue > 0) {
            onChange(numValue);
        }
    };

    const handleCustomFocus = () => {
        setIsCustomSelected(true);
    };

    const isOptionSelected = (weight: number) => {
        return !isCustomSelected && value === weight;
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Qual é o seu <Text style={styles.titleHighlight}>peso{'\n'}atual</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a opção exata ou a{'\n'}mais próxima.
                </Text>
            </View>

            {/* Options */}
            <ScrollView
                style={styles.optionsContainer}
                contentContainerStyle={styles.optionsContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Custom Input Option */}
                <TouchableOpacity
                    style={[
                        styles.optionCard,
                        styles.customOptionCard,
                        isCustomSelected && styles.optionCardSelected,
                    ]}
                    onPress={handleCustomFocus}
                    activeOpacity={0.7}
                >
                    <Text style={[
                        styles.customLabel,
                        isCustomSelected && styles.customLabelSelected,
                    ]}>
                        Outro
                    </Text>
                    <View style={[
                        styles.customInputContainer,
                        isCustomSelected && styles.customInputContainerSelected,
                    ]}>
                        <TextInput
                            style={[
                                styles.customInput,
                                isCustomSelected && styles.customInputSelected,
                            ]}
                            value={customWeight}
                            onChangeText={handleCustomChange}
                            onFocus={handleCustomFocus}
                            placeholder="Digite seu peso..."
                            placeholderTextColor="rgba(0,127,153,0.3)"
                            keyboardType="decimal-pad"
                        />
                    </View>
                    <View style={[
                        styles.radioOuter,
                        isCustomSelected && styles.radioOuterSelected,
                    ]}>
                        {isCustomSelected && <View style={styles.radioInner} />}
                    </View>
                </TouchableOpacity>

                {/* Preset Options */}
                {WEIGHT_OPTIONS.map((weight) => (
                    <TouchableOpacity
                        key={weight}
                        style={[
                            styles.optionCard,
                            isOptionSelected(weight) && styles.optionCardSelected,
                        ]}
                        onPress={() => handleSelectOption(weight)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.optionText}>{weight}KG</Text>
                        <View style={[
                            styles.radioOuter,
                            isOptionSelected(weight) && styles.radioOuterSelected,
                        ]}>
                            {isOptionSelected(weight) && <View style={styles.radioInner} />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 25,
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.textLight,
        lineHeight: 32,
    },
    titleHighlight: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: 15,
        color: 'rgba(235,235,245,0.6)',
        marginTop: 12,
        lineHeight: 22,
    },
    optionsContainer: {
        flex: 1,
    },
    optionsContent: {
        paddingHorizontal: 11,
        paddingVertical: 5,
        gap: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1C1C2E',
        borderRadius: 15,
        paddingVertical: 18,
        paddingHorizontal: 28,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    optionCardSelected: {
        backgroundColor: 'rgba(0,127,153,0.3)',
        borderWidth: 1,
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
    },
    customOptionCard: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: 'rgba(0,127,153,0.3)',
        borderStyle: 'dashed',
    },
    optionText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textLight,
    },
    customLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: 'rgba(0,127,153,0.3)',
    },
    customLabelSelected: {
        color: colors.textLight,
    },
    customInputContainer: {
        flex: 1,
        marginHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,127,153,0.3)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    customInputContainerSelected: {
        borderColor: colors.primary,
    },
    customInput: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(0,127,153,0.3)',
    },
    customInputSelected: {
        color: colors.textLight,
    },
    radioOuter: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: colors.primary,
    },
    radioInner: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
    },
});

export default WeightScreen;
