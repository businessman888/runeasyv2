import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CustomCalendarProps {
    visible: boolean;
    selectedDate: Date;
    onDateSelect: (date: Date) => void;
    onClose: () => void;
    minDate?: Date;
    maxDate?: Date;
}

const MONTHS_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

export function CustomCalendar({
    visible,
    selectedDate,
    onDateSelect,
    onClose,
    minDate,
    maxDate,
}: CustomCalendarProps) {
    const [tempDate, setTempDate] = useState<Date>(selectedDate);
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date(selectedDate));

    useEffect(() => {
        if (visible) {
            setTempDate(selectedDate);
            setCurrentMonth(new Date(selectedDate));
        }
    }, [visible, selectedDate]);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let day = 1; day <= daysInMonth; day++) days.push(day);
        return days;
    }, [currentMonth]);

    const goPreviousMonth = () => {
        const m = new Date(currentMonth);
        m.setMonth(m.getMonth() - 1);
        setCurrentMonth(m);
    };

    const goNextMonth = () => {
        const m = new Date(currentMonth);
        m.setMonth(m.getMonth() + 1);
        setCurrentMonth(m);
    };

    const handleDayPress = (day: number) => {
        const candidate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        if (minDate && candidate < startOfDay(minDate)) return;
        if (maxDate && candidate > startOfDay(maxDate)) return;
        setTempDate(candidate);
    };

    const isDayDisabled = (day: number) => {
        const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        if (minDate && d < startOfDay(minDate)) return true;
        if (maxDate && d > startOfDay(maxDate)) return true;
        return false;
    };

    const isDaySelected = (day: number) =>
        day === tempDate.getDate() &&
        currentMonth.getMonth() === tempDate.getMonth() &&
        currentMonth.getFullYear() === tempDate.getFullYear();

    const handleConfirm = () => {
        onDateSelect(tempDate);
        onClose();
    };

    const monthLabel = `${MONTHS_PT[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable
                    style={styles.card}
                    onPress={(e) => e.stopPropagation()}
                    accessibilityRole="none"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.monthYear} accessibilityRole="header">
                            {monthLabel}
                        </Text>
                        <View style={styles.navRow}>
                            <TouchableOpacity
                                onPress={goPreviousMonth}
                                style={styles.navBtn}
                                accessibilityRole="button"
                                accessibilityLabel="Mês anterior"
                            >
                                <Ionicons name="chevron-back" size={22} color="#EBEBF5" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={goNextMonth}
                                style={styles.navBtn}
                                accessibilityRole="button"
                                accessibilityLabel="Próximo mês"
                            >
                                <Ionicons name="chevron-forward" size={22} color="#EBEBF5" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Weekdays */}
                    <View style={styles.weekRow}>
                        {WEEKDAYS_PT.map((d, i) => (
                            <View key={`wd-${i}`} style={styles.cell}>
                                <Text style={styles.weekdayText}>{d}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Days grid */}
                    <View style={styles.grid}>
                        {calendarDays.map((day, idx) => (
                            <View key={`day-${idx}`} style={styles.cell}>
                                {day !== null && (
                                    <TouchableOpacity
                                        onPress={() => handleDayPress(day)}
                                        disabled={isDayDisabled(day)}
                                        style={[
                                            styles.dayBtn,
                                            isDaySelected(day) && styles.dayBtnSelected,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Dia ${day}`}
                                        accessibilityState={{
                                            selected: isDaySelected(day),
                                            disabled: isDayDisabled(day),
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.dayText,
                                                isDaySelected(day) && styles.dayTextSelected,
                                                isDayDisabled(day) && styles.dayTextDisabled,
                                            ]}
                                        >
                                            {day}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Cancelar"
                        >
                            <Text style={styles.actionText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleConfirm}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Confirmar data"
                        >
                            <Text style={styles.actionText}>Ok</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const COLOR_BG = '#1C1C2E';
const COLOR_ACCENT = '#00D4FF';
const COLOR_TEXT = '#EBEBF5';
const COLOR_TEXT_MUTED = 'rgba(235, 235, 245, 0.6)';
const COLOR_TEXT_DARK = '#0E0E1F';

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 355,
        backgroundColor: COLOR_BG,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLOR_ACCENT,
        paddingHorizontal: 6,
        paddingTop: 14,
        paddingBottom: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        height: 62,
    },
    monthYear: {
        fontFamily: 'Poppins',
        fontSize: 20,
        fontWeight: '500',
        color: COLOR_TEXT,
    },
    navRow: {
        flexDirection: 'row',
        gap: 8,
    },
    navBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekRow: {
        flexDirection: 'row',
        marginTop: 4,
        marginBottom: 2,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    cell: {
        width: `${100 / 7}%`,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    weekdayText: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '400',
        color: COLOR_TEXT_MUTED,
    },
    dayBtn: {
        width: 34,
        height: 34,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayBtnSelected: {
        backgroundColor: COLOR_ACCENT,
    },
    dayText: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '400',
        color: COLOR_TEXT,
    },
    dayTextSelected: {
        color: COLOR_TEXT_DARK,
        fontWeight: '600',
    },
    dayTextDisabled: {
        color: 'rgba(235, 235, 245, 0.3)',
    },
    actions: {
        height: 52,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 10,
        gap: 8,
    },
    actionBtn: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        minHeight: 44,
        justifyContent: 'center',
    },
    actionText: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '500',
        color: COLOR_ACCENT,
    },
});
