import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fonts, createThemeStyles, useThemeSubscription } from '../../theme';
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


// Days of week - SHORT names only
const DAYS = [
    { id: 0, short: 'DOM' },
    { id: 1, short: 'SEG' },
    { id: 2, short: 'TER' },
    { id: 3, short: 'QUA' },
    { id: 4, short: 'QUI' },
    { id: 5, short: 'SEX' },
    { id: 6, short: 'SÁB' },
];

interface IntenseDayScreenProps {
    value?: number | null;
    availableDays?: number[];
    onChange?: (value: number) => void;
}

export function IntenseDayScreen({ value, availableDays = [], onChange }: IntenseDayScreenProps) {
    useThemeSubscription();
    const [selectedDay, setSelectedDay] = useState<number | null>(value ?? null);

    useEffect(() => {
        if (value !== undefined) {
            setSelectedDay(value);
        }
    }, [value]);

    const handleDaySelect = (dayId: number) => {
        setSelectedDay(dayId);
        if (onChange) {
            onChange(dayId);
        }
    };

    const filteredDays = DAYS.filter(day => availableDays.includes(day.id));

    if (filteredDays.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    Por favor, selecione os dias disponíveis primeiro.
                </Text>
            </View>
        );
    }

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Qual dia você prefere{'\n'}
                    <Text style={styles.titleHighlight}>treinar mais forte?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    No treino intenso, você terá sessões mais longas e desafiadoras.
                </Text>
            </View>

            {/* Fire Icon with MaterialCommunityIcons */}
            <View style={styles.iconContainer}>
                <View style={styles.iconWrapper}>
                    <MaterialCommunityIcons name="fire" size={32} color={getLocalThemePalette1().cyan} />
                </View>
                <Text style={styles.iconLabel}>Treino Intenso</Text>
            </View>

            {/* Days Selection - SIGLAS ONLY */}
            <View style={styles.daysContainer}>
                {filteredDays.map((day) => (
                    <TouchableOpacity
                        key={day.id}
                        style={[
                            styles.dayCard,
                            selectedDay === day.id && styles.dayCardSelected
                        ]}
                        onPress={() => handleDaySelect(day.id)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.dayText,
                            selectedDay === day.id && styles.dayTextSelected
                        ]}>
                            {day.short}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Tip */}
            <View style={styles.tipCard}>
                <Text style={styles.tipText}>
                    💡 Escolha um dia em que você tenha mais tempo e energia disponível.
                </Text>
            </View>
        </>
    );
}

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 24,
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
    iconContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconWrapper: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: semanticColors.accentSubtle,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    iconLabel: {
        fontFamily: fonts.semibold,
        fontSize: 16,
        color: getLocalThemePalette1().cyan,
    },
    daysContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
        justifyContent: 'center',
    },
    dayCard: {
        width: 70,
        height: 50,
        backgroundColor: getLocalThemePalette1().card,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    dayCardSelected: {
        borderColor: getLocalThemePalette1().cyan,
        backgroundColor: getLocalThemePalette1().cyanSelected,
    },
    dayText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        color: getLocalThemePalette1().textSecondary,
    },
    dayTextSelected: {
        color: getLocalThemePalette1().cyan,
    },
    tipCard: {
        backgroundColor: getLocalThemePalette1().card,
        borderRadius: 12,
        padding: 16,
    },
    tipText: {
        fontFamily: fonts.regular,
        fontSize: 14,
        color: getLocalThemePalette1().textSecondary,
        lineHeight: 20,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyText: {
        fontFamily: fonts.regular,
        fontSize: 16,
        color: getLocalThemePalette1().textSecondary,
        textAlign: 'center',
    },
}));

export default IntenseDayScreen;
