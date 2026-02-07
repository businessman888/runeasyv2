import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import Svg, { Path } from 'react-native-svg';

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Calendar Icon
const CalendarIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V9H19V20ZM9 11H7V13H9V11ZM13 11H11V13H13V11ZM17 11H15V13H17V11ZM9 15H7V17H9V15ZM13 15H11V17H13V15ZM17 15H15V17H17V15Z"
            fill={colors.primary}
        />
    </Svg>
);

// Arrow Icons
const ChevronLeft = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z" fill={colors.textSecondary} />
    </Svg>
);

const ChevronRight = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="M8.59 16.59L10 18L16 12L10 6L8.59 7.41L13.17 12L8.59 16.59Z" fill={colors.textSecondary} />
    </Svg>
);

interface StartDateScreenProps {
    value?: string | null;
    onChange?: (value: string) => void;
}

export function StartDateScreen({ value, onChange }: StartDateScreenProps) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [selectedDate, setSelectedDate] = useState<Date | null>(
        value ? new Date(value) : null
    );
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

    useEffect(() => {
        if (value) {
            setSelectedDate(new Date(value));
        }
    }, [value]);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();

        const days: (Date | null)[] = [];

        // Add empty slots for days before the first of the month
        for (let i = 0; i < startingDay; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }

        return days;
    };

    const handleDateSelect = (date: Date) => {
        if (date < today) return; // Can't select past dates

        setSelectedDate(date);
        if (onChange) {
            onChange(date.toISOString().split('T')[0]);
        }
    };

    const handlePrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const isDateSelected = (date: Date | null) => {
        if (!date || !selectedDate) return false;
        return date.toDateString() === selectedDate.toDateString();
    };

    const isToday = (date: Date | null) => {
        if (!date) return false;
        return date.toDateString() === today.toDateString();
    };

    const isPast = (date: Date | null) => {
        if (!date) return true;
        return date < today;
    };

    const days = getDaysInMonth(currentMonth);

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quando você quer{'\n'}
                    <Text style={styles.titleHighlight}>começar?</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a data de início do seu plano de treinamento.
                </Text>
            </View>

            {/* Calendar Header */}
            <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
                    <ChevronLeft />
                </TouchableOpacity>
                <Text style={styles.monthYear}>
                    {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
                    <ChevronRight />
                </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdaysRow}>
                {WEEKDAYS.map((day) => (
                    <Text key={day} style={styles.weekdayText}>{day}</Text>
                ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
                {days.map((date, index) => (
                    <TouchableOpacity
                        key={index}
                        style={[
                            styles.dayCell,
                            date && isDateSelected(date) && styles.dayCellSelected,
                            date && isToday(date) && !isDateSelected(date) && styles.dayCellToday,
                            date && isPast(date) && styles.dayCellDisabled
                        ]}
                        onPress={() => date && handleDateSelect(date)}
                        disabled={!date || isPast(date)}
                    >
                        {date && (
                            <Text style={[
                                styles.dayText,
                                isDateSelected(date) && styles.dayTextSelected,
                                isToday(date) && !isDateSelected(date) && styles.dayTextToday,
                                isPast(date) && styles.dayTextDisabled
                            ]}>
                                {date.getDate()}
                            </Text>
                        )}
                    </TouchableOpacity>
                ))}
            </View>

            {/* Selected Date Display */}
            {selectedDate && (
                <View style={styles.selectedCard}>
                    <CalendarIcon />
                    <View style={styles.selectedTextContainer}>
                        <Text style={styles.selectedLabel}>Data selecionada</Text>
                        <Text style={styles.selectedValue}>
                            {selectedDate.getDate()} de {MONTHS[selectedDate.getMonth()]} de {selectedDate.getFullYear()}
                        </Text>
                    </View>
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
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    navButton: {
        padding: 8,
    },
    monthYear: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
    },
    weekdaysRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekdayText: {
        flex: 1,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.lg,
    },
    dayCellSelected: {
        backgroundColor: colors.primary,
        ...shadows.neon,
    },
    dayCellToday: {
        borderWidth: 2,
        borderColor: colors.primary,
    },
    dayCellDisabled: {
        opacity: 0.3,
    },
    dayText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.medium,
        color: colors.text,
    },
    dayTextSelected: {
        color: colors.background,
        fontWeight: typography.fontWeights.bold,
    },
    dayTextToday: {
        color: colors.primary,
    },
    dayTextDisabled: {
        color: colors.textMuted,
    },
    selectedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 16,
        borderWidth: 2,
        borderColor: colors.primary,
        ...shadows.neon,
    },
    selectedTextContainer: {
        marginLeft: 12,
    },
    selectedLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    selectedValue: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
    },
});

export default StartDateScreen;
