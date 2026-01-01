import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Platform,
} from 'react-native';

// SVG Icons
function ChevronUpIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M7.41 15.41L12 10.83L16.59 15.41L18 14L12 8L6 14L7.41 15.41Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>▲</Text>;
}

function ChevronDownIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M7.41 8.59L12 13.17L16.59 8.59L18 10L12 16L6 10L7.41 8.59Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>▼</Text>;
}

interface CustomCalendarProps {
    visible: boolean;
    selectedDate: Date;
    onDateSelect: (date: Date) => void;
    onClose: () => void;
    minDate?: Date;
    maxDate?: Date;
}

export function CustomCalendar({
    visible,
    selectedDate,
    onDateSelect,
    onClose,
    minDate,
    maxDate,
}: CustomCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

    useEffect(() => {
        if (visible) {
            setCurrentMonth(new Date(selectedDate));
        }
    }, [visible, selectedDate]);

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const generateCalendarDays = () => {
        const daysInMonth = getDaysInMonth(currentMonth);
        const firstDay = getFirstDayOfMonth(currentMonth);
        const days: (number | null)[] = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(day);
        }

        return days;
    };

    const handlePreviousMonth = () => {
        const newMonth = new Date(currentMonth);
        newMonth.setMonth(newMonth.getMonth() - 1);
        setCurrentMonth(newMonth);
    };

    const handleNextMonth = () => {
        const newMonth = new Date(currentMonth);
        newMonth.setMonth(newMonth.getMonth() + 1);
        setCurrentMonth(newMonth);
    };

    const handlePreviousYear = () => {
        const newMonth = new Date(currentMonth);
        newMonth.setFullYear(newMonth.getFullYear() - 1);
        setCurrentMonth(newMonth);
    };

    const handleNextYear = () => {
        const newMonth = new Date(currentMonth);
        newMonth.setFullYear(newMonth.getFullYear() + 1);
        setCurrentMonth(newMonth);
    };

    const handleDatePress = (day: number) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);

        // Check if date is within allowed range
        if (minDate && newDate < minDate) return;
        if (maxDate && newDate > maxDate) return;

        onDateSelect(newDate);
        onClose();
    };

    const isDateSelected = (day: number) => {
        return (
            day === selectedDate.getDate() &&
            currentMonth.getMonth() === selectedDate.getMonth() &&
            currentMonth.getFullYear() === selectedDate.getFullYear()
        );
    };

    const isDateDisabled = (day: number) => {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    };

    const calendarDays = generateCalendarDays();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                >
                    <View style={styles.calendarContainer}>
                        {/* Header with Month/Year Selector and Navigation */}
                        <View style={styles.header}>
                            <View style={styles.monthYearSelector}>
                                <Text style={styles.monthYear}>
                                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                                </Text>
                                <View style={styles.yearNavigation}>
                                    <TouchableOpacity
                                        style={styles.yearNavButton}
                                        onPress={handlePreviousYear}
                                    >
                                        <ChevronUpIcon size={16} color="#FFFFFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.yearNavButton}
                                        onPress={handleNextYear}
                                    >
                                        <ChevronDownIcon size={16} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.monthNavigation}>
                                <TouchableOpacity
                                    style={styles.navButton}
                                    onPress={handlePreviousMonth}
                                >
                                    <ChevronUpIcon size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.navButton}
                                    onPress={handleNextMonth}
                                >
                                    <ChevronDownIcon size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Weekday Headers */}
                        <View style={styles.weekDaysContainer}>
                            {weekDays.map((day, index) => (
                                <View key={index} style={styles.weekDayCell}>
                                    <Text style={styles.weekDayText}>{day}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Calendar Grid */}
                        <View style={styles.daysContainer}>
                            {calendarDays.map((day, index) => (
                                <View key={index} style={styles.dayCell}>
                                    {day !== null ? (
                                        <TouchableOpacity
                                            style={[
                                                styles.dayButton,
                                                isDateSelected(day) && styles.dayButtonSelected,
                                                isDateDisabled(day) && styles.dayButtonDisabled,
                                            ]}
                                            onPress={() => handleDatePress(day)}
                                            disabled={isDateDisabled(day)}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayText,
                                                    isDateSelected(day) && styles.dayTextSelected,
                                                    isDateDisabled(day) && styles.dayTextDisabled,
                                                ]}
                                            >
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={styles.emptyCell} />
                                    )}
                                </View>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarContainer: {
        width: 300,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    monthYearSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    monthYear: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    yearNavigation: {
        flexDirection: 'row',
        gap: 4,
    },
    yearNavButton: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    monthNavigation: {
        flexDirection: 'row',
        gap: 8,
    },
    navButton: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    weekDaysContainer: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekDayCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
    },
    weekDayText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
    },
    daysContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%', // 100% / 7 days
        aspectRatio: 1,
        padding: 2,
    },
    dayButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    dayButtonSelected: {
        backgroundColor: '#00D4FF',
    },
    dayButtonDisabled: {
        opacity: 0.3,
    },
    emptyCell: {
        flex: 1,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '400',
        color: '#FFFFFF',
    },
    dayTextSelected: {
        color: '#0A0A18',
        fontWeight: '600',
    },
    dayTextDisabled: {
        color: 'rgba(255, 255, 255, 0.4)',
    },
});
