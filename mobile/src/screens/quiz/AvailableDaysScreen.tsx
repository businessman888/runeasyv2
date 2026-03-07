import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius } from '../../theme';
import Svg, { Path } from 'react-native-svg';

// Design System Colors (Figma)
const DS = {
    bg: '#0F0F1E',
    card: '#1C1C2E',
    cyan: '#00D4FF',
    cyanSelected: 'rgba(0, 212, 255, 0.1)',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    warning: '#FFC400',
};

const DAYS = [
    { id: 0, short: 'Dom', full: 'Domingo' },
    { id: 1, short: 'Seg', full: 'Segunda' },
    { id: 2, short: 'Ter', full: 'Terça' },
    { id: 3, short: 'Qua', full: 'Quarta' },
    { id: 4, short: 'Qui', full: 'Quinta' },
    { id: 5, short: 'Sex', full: 'Sexta' },
    { id: 6, short: 'Sáb', full: 'Sábado' },
];

// Info Icon for warning
const InfoIcon = () => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z"
            fill={DS.warning}
        />
    </Svg>
);

interface AvailableDaysScreenProps {
    value?: number[] | null;
    onChange?: (value: number[]) => void;
    maxDays?: number; // From previous frequency question (daysPerWeek)
}

export function AvailableDaysScreen({ value, onChange, maxDays = 7 }: AvailableDaysScreenProps) {
    const [selectedDays, setSelectedDays] = useState<number[]>(value || []);

    useEffect(() => {
        if (value) {
            setSelectedDays(value);
        }
    }, [value]);

    const handleDayToggle = (dayId: number) => {
        let newDays: number[];

        if (selectedDays.includes(dayId)) {
            // Always allow deselection
            newDays = selectedDays.filter(d => d !== dayId);
        } else {
            // BLOCK if already at max
            if (selectedDays.length >= maxDays) {
                return; // Don't add more days
            }
            newDays = [...selectedDays, dayId].sort((a, b) => a - b);
        }

        setSelectedDays(newDays);
        if (onChange) {
            onChange(newDays);
        }
    };

    // Check for 3+ consecutive training days (not just 2)
    const hasConsecutiveDays = () => {
        if (selectedDays.length < 3) return false;
        const sorted = [...selectedDays].sort((a, b) => a - b);
        let consecutive = 1;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === sorted[i - 1] + 1) {
                consecutive++;
                if (consecutive >= 3) return true;
            } else {
                consecutive = 1;
            }
        }
        // Check wrap-around: Sab(6) -> Dom(0) -> Seg(1)
        if (sorted.includes(6) && sorted.includes(0) && sorted.includes(1)) {
            return true;
        }
        if (sorted.includes(5) && sorted.includes(6) && sorted.includes(0)) {
            return true;
        }
        return false;
    };

    const isAtMax = selectedDays.length >= maxDays;

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quais dias você pode{'\n'}
                    <Text style={styles.titleHighlight}>treinar?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Selecione {maxDays} dia{maxDays !== 1 ? 's' : ''} para seu treino semanal.
                </Text>
            </View>

            {/* Days Grid - Clean circular buttons */}
            <View style={styles.daysGrid}>
                {DAYS.map((day) => {
                    const isSelected = selectedDays.includes(day.id);
                    const isDisabled = !isSelected && isAtMax;

                    return (
                        <TouchableOpacity
                            key={day.id}
                            style={[
                                styles.dayButton,
                                isSelected && styles.dayButtonSelected,
                                isDisabled && styles.dayButtonDisabled,
                            ]}
                            onPress={() => handleDayToggle(day.id)}
                            activeOpacity={isDisabled ? 1 : 0.7}
                            disabled={isDisabled}
                        >
                            <Text style={[
                                styles.dayText,
                                isSelected && styles.dayTextSelected,
                                isDisabled && styles.dayTextDisabled,
                            ]}>
                                {day.short}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Selected Count Indicator */}
            <View style={styles.countContainer}>
                <Text style={styles.countText}>
                    <Text style={styles.countNumber}>{selectedDays.length}</Text>
                    <Text style={styles.countLabel}> / {maxDays} dias selecionados</Text>
                </Text>
            </View>

            {/* Warning for consecutive days */}
            {hasConsecutiveDays() && (
                <View style={styles.warningCard}>
                    <InfoIcon />
                    <Text style={styles.warningText}>
                        Recomendamos dias alternados para melhor recuperação.
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
        fontSize: 28,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 36,
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
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 24,
    },
    // Clean button style - no weird background on text
    dayButton: {
        width: 64,
        height: 64,
        borderRadius: 32, // Circular
        backgroundColor: DS.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    dayButtonSelected: {
        borderColor: DS.cyan,
        backgroundColor: DS.cyanSelected,
    },
    dayButtonDisabled: {
        opacity: 0.4,
    },
    dayText: {
        fontSize: 16,
        fontWeight: '600',
        color: DS.textSecondary,
    },
    dayTextSelected: {
        color: DS.cyan,
    },
    dayTextDisabled: {
        color: DS.textSecondary,
    },
    countContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    countText: {
        fontSize: 15,
    },
    countNumber: {
        fontSize: 20,
        fontWeight: '700',
        color: DS.cyan,
    },
    countLabel: {
        fontSize: 15,
        fontWeight: '400',
        color: DS.textSecondary,
    },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 196, 0, 0.1)',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 196, 0, 0.3)',
        gap: 12,
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '400',
        color: DS.warning,
        lineHeight: 18,
    },
});

export default AvailableDaysScreen;
