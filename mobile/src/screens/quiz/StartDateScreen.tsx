import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius } from '../../theme';

interface StartDateScreenProps {
    value: Date | null;
    onChange: (date: Date) => void;
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const StartDateScreen: React.FC<StartDateScreenProps> = ({
    value,
    onChange,
}) => {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());

    // Get calendar days for current month
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (number | null)[] = [];

        // Add empty slots for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    }, [currentMonth, currentYear]);

    const goToPreviousMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(currentYear - 1);
        } else {
            setCurrentMonth(currentMonth - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(currentYear + 1);
        } else {
            setCurrentMonth(currentMonth + 1);
        }
    };

    const handleDayPress = (day: number) => {
        const selectedDate = new Date(currentYear, currentMonth, day);
        // Only allow selecting today or future dates
        if (selectedDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
            onChange(selectedDate);
        }
    };

    const isDaySelected = (day: number) => {
        if (!value || !day) return false;
        return (
            value.getDate() === day &&
            value.getMonth() === currentMonth &&
            value.getFullYear() === currentYear
        );
    };

    const isDayDisabled = (day: number) => {
        if (!day) return true;
        const date = new Date(currentYear, currentMonth, day);
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return date < todayStart;
    };

    const isToday = (day: number) => {
        if (!day) return false;
        return (
            today.getDate() === day &&
            today.getMonth() === currentMonth &&
            today.getFullYear() === currentYear
        );
    };

    // Can go to previous month if it's current or future month
    const canGoPrevious = !(currentMonth === today.getMonth() && currentYear === today.getFullYear());

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>
                    Quando você quer{'\n'}iniciar os{' '}
                    <Text style={styles.titleHighlight}>treinamentos</Text>?
                </Text>
            </View>

            {/* Calendar */}
            <View style={styles.calendarContainer}>
                {/* Month Navigation */}
                <View style={styles.monthHeader}>
                    <TouchableOpacity
                        onPress={goToPreviousMonth}
                        disabled={!canGoPrevious}
                        style={[styles.navButton, !canGoPrevious && styles.navButtonDisabled]}
                    >
                        <Ionicons
                            name="chevron-back"
                            size={24}
                            color={canGoPrevious ? colors.textLight : 'rgba(235,235,245,0.3)'}
                        />
                    </TouchableOpacity>
                    <Text style={styles.monthTitle}>
                        {MONTHS[currentMonth]} {currentYear}
                    </Text>
                    <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                        <Ionicons name="chevron-forward" size={24} color={colors.textLight} />
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
                    {calendarDays.map((day, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.dayCell,
                                isDaySelected(day!) && styles.dayCellSelected,
                                isToday(day!) && !isDaySelected(day!) && styles.dayCellToday,
                            ]}
                            onPress={() => day && handleDayPress(day)}
                            disabled={isDayDisabled(day!)}
                            activeOpacity={0.7}
                        >
                            {day && (
                                <Text style={[
                                    styles.dayText,
                                    isDaySelected(day) && styles.dayTextSelected,
                                    isDayDisabled(day) && styles.dayTextDisabled,
                                    isToday(day) && !isDaySelected(day) && styles.dayTextToday,
                                ]}>
                                    {day}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Selected Date Display */}
            {value && (
                <View style={styles.selectedDateContainer}>
                    <Text style={styles.selectedDateLabel}>Data selecionada:</Text>
                    <Text style={styles.selectedDateValue}>
                        {value.getDate().toString().padStart(2, '0')} de {MONTHS[value.getMonth()]} de {value.getFullYear()}
                    </Text>
                </View>
            )}
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
    calendarContainer: {
        marginHorizontal: 11,
        backgroundColor: '#1C1C2E',
        borderRadius: 15,
        padding: 16,
    },
    monthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    navButton: {
        padding: 8,
    },
    navButtonDisabled: {
        opacity: 0.3,
    },
    monthTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.textLight,
    },
    weekdaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(235,235,245,0.1)',
        paddingBottom: 12,
    },
    weekdayText: {
        width: 40,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: colors.primary,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCellSelected: {
        backgroundColor: colors.primary,
        borderRadius: 20,
    },
    dayCellToday: {
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: 20,
    },
    dayText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textLight,
    },
    dayTextSelected: {
        color: colors.background,
        fontWeight: '700',
    },
    dayTextDisabled: {
        color: 'rgba(235,235,245,0.3)',
    },
    dayTextToday: {
        color: colors.primary,
    },
    selectedDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        gap: 8,
    },
    selectedDateLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
    },
    selectedDateValue: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary,
    },
});

export default StartDateScreen;
