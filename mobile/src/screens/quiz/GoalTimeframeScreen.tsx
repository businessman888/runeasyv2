import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { fonts, useThemeSubscription, createThemeStyles } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';

const getLocalThemePalette1 = () => ({
    bg: semanticColors.canvas,
    card: semanticColors.surface2,
    cyan: semanticColors.accent,
    cyanSelected: semanticColors.accentSubtle,
    text: semanticColors.textPrimary,
    textSecondary: semanticColors.textSecondary,
});

// Design System Colors (Figma)


// Circular checkbox component
const CircularCheckbox = ({ selected }: { selected: boolean }) => (
    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && (
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    fill={semanticColors.textOnAccent}
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
            fill={getLocalThemePalette1().cyan}
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
];

export function GoalTimeframeScreen({ value, onChange }: GoalTimeframeScreenProps) {
    useThemeSubscription();
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
                    <OptionCard
                        key={option.id}
                        selected={selectedMonths === option.id}
                        onPress={() => handleSelect(option.id)}
                        accessibilityLabel={`${option.label}, ${option.description}`}
                        style={styles.optionCard}
                        selectedStyle={styles.optionCardSelected}
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
                    </OptionCard>
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

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 32,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: getLocalThemePalette1().text,
        lineHeight: 32,
        marginBottom: 12,
    },
    titleHighlight: {
        fontFamily: fonts.bold,
        color: getLocalThemePalette1().cyan,
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        color: getLocalThemePalette1().textSecondary,
        lineHeight: 22,
    },
    optionsContainer: {
        gap: 12,
        marginBottom: 24,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: getLocalThemePalette1().card,
        borderRadius: 15,
        padding: 16,
        borderWidth: 1.5,
        borderColor: 'transparent',
        gap: 14,
    },
    optionCardSelected: {
        borderColor: getLocalThemePalette1().cyan,
        backgroundColor: getLocalThemePalette1().cyanSelected,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: getLocalThemePalette1().textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: getLocalThemePalette1().cyan,
        borderColor: getLocalThemePalette1().cyan,
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
        fontFamily: fonts.semibold,
        fontSize: 17,
        color: getLocalThemePalette1().text,
    },
    optionTitleSelected: {
        color: getLocalThemePalette1().cyan,
    },
    recommendedBadge: {
        backgroundColor: getLocalThemePalette1().cyan,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    recommendedText: {
        fontFamily: fonts.bold,
        fontSize: 10,
        color: getLocalThemePalette1().bg,
    },
    optionDescription: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: getLocalThemePalette1().textSecondary,
    },
    tipCard: {
        backgroundColor: getLocalThemePalette1().card,
        borderRadius: 12,
        padding: 16,
    },
    tipText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: getLocalThemePalette1().textSecondary,
        lineHeight: 18,
    },
}));

export default GoalTimeframeScreen;
