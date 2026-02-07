import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import Svg, { Path } from 'react-native-svg';

const DAYS = [
    { id: 0, short: 'Dom', full: 'Domingo' },
    { id: 1, short: 'Seg', full: 'Segunda' },
    { id: 2, short: 'Ter', full: 'Terça' },
    { id: 3, short: 'Qua', full: 'Quarta' },
    { id: 4, short: 'Qui', full: 'Quinta' },
    { id: 5, short: 'Sex', full: 'Sexta' },
    { id: 6, short: 'Sáb', full: 'Sábado' },
];

// Fire Icon for intense day - uses cyan (primary) per Figma
const FireIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 23C7.03 23 3 18.97 3 14C3 10.61 4.61 7.55 7.25 5.65L8.66 7.06C6.61 8.54 5.25 10.96 5.25 13.75C5.25 17.89 8.86 21.25 13 21.25C17.14 21.25 20.75 17.89 20.75 13.75C20.75 10.61 19.03 7.84 16.41 6.33L17.78 4.96C20.59 7.02 22.5 10.27 22.5 14C22.5 18.97 18.47 23 12 23ZM12 3.5C12 5.98 11 9 9.5 11C9.5 11 10.5 12 12 12C14 12 15.5 10.5 15.5 8.5C15.5 6.5 14 5 12 3.5Z"
            fill={colors.primary}
        />
    </Svg>
);

interface IntenseDayScreenProps {
    value?: number | null;
    availableDays?: number[];
    onChange?: (value: number) => void;
}

export function IntenseDayScreen({ value, availableDays = [], onChange }: IntenseDayScreenProps) {
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

            {/* Icon */}
            <View style={styles.iconContainer}>
                <View style={styles.iconWrapper}>
                    <FireIcon />
                </View>
                <Text style={styles.iconLabel}>Treino Intenso</Text>
            </View>

            {/* Days Selection */}
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
                            styles.dayShort,
                            selectedDay === day.id && styles.dayShortSelected
                        ]}>
                            {day.short}
                        </Text>
                        <Text style={[
                            styles.dayFull,
                            selectedDay === day.id && styles.dayFullSelected
                        ]}>
                            {day.full}
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
    iconContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconWrapper: {
        width: 64,
        height: 64,
        borderRadius: borderRadius.full,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    iconLabel: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
    },
    daysContainer: {
        gap: 12,
        marginBottom: 24,
    },
    dayCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    dayCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    dayShort: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold,
        color: colors.textSecondary,
        width: 50,
    },
    dayShortSelected: {
        color: colors.primary,
    },
    dayFull: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        flex: 1,
    },
    dayFullSelected: {
        color: colors.text,
    },
    tipCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: 16,
    },
    tipText: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});

export default IntenseDayScreen;
