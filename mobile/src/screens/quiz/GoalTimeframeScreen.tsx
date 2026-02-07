import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
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

// Calendar icon
const CalendarIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V9H19V20ZM9 11H7V13H9V11ZM13 11H11V13H13V11ZM17 11H15V13H17V11ZM9 15H7V17H9V15ZM13 15H11V17H13V15ZM17 15H15V17H17V15Z"
            fill={DS.cyan}
        />
    </Svg>
);

interface GoalTimeframeScreenProps {
    value?: number | null;
    onChange?: (value: number) => void;
}

const TIMEFRAME_OPTIONS = [
    { id: 1, label: '1 mês', description: 'Objetivo de curto prazo', recommended: false },
    { id: 3, label: '3 meses', description: 'Tempo ideal para iniciantes', recommended: true },
    { id: 6, label: '6 meses', description: 'Planejamento moderado', recommended: false },
    { id: 12, label: '12 meses', description: 'Objetivo de longo prazo', recommended: false },
];

export function GoalTimeframeScreen({ value, onChange }: GoalTimeframeScreenProps) {
    const [selectedMonths, setSelectedMonths] = useState<number | null>(value ?? null);

    useEffect(() => {
        if (value !== undefined) {
            setSelectedMonths(value);
        }
    }, [value]);

    const handleSelect = (months: number) => {
        setSelectedMonths(months);
        if (onChange) {
            onChange(months);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quando deseja{'\n'}
                    <Text style={styles.titleHighlight}>atingir sua meta</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha o prazo para alcançar seu objetivo. Isso determina a intensidade da progressão.
                </Text>
            </View>

            {/* Timeframe Options */}
            <View style={styles.optionsContainer}>
                {TIMEFRAME_OPTIONS.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={[
                            styles.optionCard,
                            selectedMonths === option.id && styles.optionCardSelected,
                        ]}
                        onPress={() => handleSelect(option.id)}
                        activeOpacity={0.7}
                    >
                        <CircularCheckbox selected={selectedMonths === option.id} />
                        <View style={styles.optionContent}>
                            <View style={styles.optionHeader}>
                                <Text style={[
                                    styles.optionTitle,
                                    selectedMonths === option.id && styles.optionTitleSelected,
                                ]}>
                                    {option.label}
                                </Text>
                                {option.recommended && (
                                    <View style={styles.recommendedBadge}>
                                        <Text style={styles.recommendedText}>Recomendado</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.optionDescription}>
                                {option.description}
                            </Text>
                        </View>
                        <CalendarIcon />
                    </TouchableOpacity>
                ))}
            </View>

            {/* Tip */}
            <View style={styles.tipCard}>
                <Text style={styles.tipText}>
                    💡 Prazos muito curtos podem ser desafiadores. Recomendamos pelo menos 3 meses para resultados sustentáveis.
                </Text>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 32,
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
    optionsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DS.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
        gap: 14,
    },
    optionCardSelected: {
        borderColor: DS.cyan,
        backgroundColor: DS.cyanMuted,
        // Glow effect
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
    optionContent: {
        flex: 1,
    },
    optionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: DS.text,
    },
    optionTitleSelected: {
        color: DS.cyan,
    },
    recommendedBadge: {
        backgroundColor: DS.cyan,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    recommendedText: {
        fontSize: 10,
        fontWeight: '700',
        color: DS.bg,
    },
    optionDescription: {
        fontSize: 13,
        fontWeight: '400',
        color: DS.textSecondary,
    },
    tipCard: {
        backgroundColor: DS.card,
        borderRadius: 12,
        padding: 16,
    },
    tipText: {
        fontSize: 13,
        fontWeight: '400',
        color: DS.textSecondary,
        lineHeight: 18,
    },
});

export default GoalTimeframeScreen;
