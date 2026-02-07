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

// Warning Icon
const WarningIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2L1 21H23L12 2ZM12 16C11.45 16 11 15.55 11 15V13C11 12.45 11.45 12 12 12S13 12.45 13 13V15C13 15.55 12.55 16 12 16ZM13 18H11V20H13V18Z"
            fill={colors.warning}
        />
    </Svg>
);

interface AvailableDaysScreenProps {
    value?: number[] | null;
    onChange?: (value: number[]) => void;
}

export function AvailableDaysScreen({ value, onChange }: AvailableDaysScreenProps) {
    const [selectedDays, setSelectedDays] = useState<number[]>(value || []);

    useEffect(() => {
        if (value) {
            setSelectedDays(value);
        }
    }, [value]);

    const handleDayToggle = (dayId: number) => {
        let newDays: number[];
        if (selectedDays.includes(dayId)) {
            newDays = selectedDays.filter(d => d !== dayId);
        } else {
            newDays = [...selectedDays, dayId].sort((a, b) => a - b);
        }
        setSelectedDays(newDays);
        if (onChange) {
            onChange(newDays);
        }
    };

    // Check for consecutive training days (3+ in a row)
    const hasConsecutiveDays = () => {
        const sorted = [...selectedDays].sort((a, b) => a - b);
        let consecutive = 1;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === sorted[i - 1] + 1 || (sorted[i - 1] === 6 && sorted[i] === 0)) {
                consecutive++;
                if (consecutive >= 3) return true;
            } else {
                consecutive = 1;
            }
        }
        return false;
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quais dias você pode{'\n'}
                    <Text style={styles.titleHighlight}>treinar?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Selecione os dias disponíveis para seu treino semanal.
                </Text>
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
                {DAYS.map((day) => (
                    <TouchableOpacity
                        key={day.id}
                        style={[
                            styles.dayCard,
                            selectedDays.includes(day.id) && styles.dayCardSelected
                        ]}
                        onPress={() => handleDayToggle(day.id)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.dayText,
                            selectedDays.includes(day.id) && styles.dayTextSelected
                        ]}>
                            {day.short}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Selected Count */}
            <View style={styles.countContainer}>
                <Text style={styles.countText}>
                    <Text style={styles.countNumber}>{selectedDays.length}</Text> dias selecionados
                </Text>
            </View>

            {/* Warning for consecutive days */}
            {hasConsecutiveDays() && (
                <View style={styles.warningCard}>
                    <WarningIcon />
                    <Text style={styles.warningText}>
                        Treinar 3+ dias consecutivos pode aumentar o risco de lesões. Considere alternar dias de descanso.
                    </Text>
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
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 24,
    },
    dayCard: {
        width: 70,
        height: 70,
        borderRadius: borderRadius.xl,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    dayCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
        ...shadows.neon,
    },
    dayText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    dayTextSelected: {
        color: colors.primary,
    },
    countContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    countText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    countNumber: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.primary,
    },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(255, 196, 0, 0.1)',
        borderRadius: borderRadius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.warning,
        gap: 12,
    },
    warningText: {
        flex: 1,
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.warning,
        lineHeight: 20,
    },
});

export default AvailableDaysScreen;
