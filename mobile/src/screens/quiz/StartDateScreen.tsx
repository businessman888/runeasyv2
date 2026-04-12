import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Design System — Figma node 414:663 exact tokens
const DS = {
    bg: '#0F0F1E',
    cardBg: '#1C1C2E',
    cyan: '#00D4FF',
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    glassBorder: 'rgba(235, 235, 245, 0.1)',
    pastDay: 'rgba(235, 235, 245, 0.1)',      // Figma: neutral/glass-stroke for past days
};

// Card internal padding
const CARD_PADDING_H = 12;
// 7 columns, each cell is 41×41px in Figma within a 309px row
const CELL_SIZE = 41;

interface StartDateScreenProps {
    value?: string | null;
    onChange?: (value: string) => void;
}

export function StartDateScreen({ value, onChange }: StartDateScreenProps) {
    // Helper to create a date at midnight local time
    const createLocalDate = (year: number, month: number, day: number) => {
        const d = new Date(year, month, day);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    // Parse a YYYY-MM-DD string into local date
    const parseLocalDate = (dateStr: string): Date => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return createLocalDate(year, month - 1, day);
    };

    // Format date as YYYY-MM-DD for storage
    const formatDateString = (date: Date): string => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [selectedDate, setSelectedDate] = useState<Date | null>(
        value ? parseLocalDate(value) : null
    );
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

    useEffect(() => {
        if (value) {
            setSelectedDate(parseLocalDate(value));
        }
    }, [value]);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = createLocalDate(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        lastDay.setHours(0, 0, 0, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay(); // 0=DOM, 1=SEG, ..., 6=SAB

        const days: (Date | null)[] = [];

        // Empty cells before the first day of the month
        for (let i = 0; i < startingDay; i++) {
            days.push(null);
        }

        // Current month days — normalized to midnight local
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(createLocalDate(year, month, i));
        }

        return days;
    };

    const handleDateSelect = (date: Date) => {
        if (date < today) return;

        const normalizedDate = createLocalDate(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        setSelectedDate(normalizedDate);
        if (onChange) {
            onChange(formatDateString(normalizedDate));
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
        <View style={styles.wrapper}>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>
                    Quando você quer{'\n'}iniciar os <Text style={styles.titleHighlight}>treinamentos</Text>?
                </Text>
                <Text style={styles.subtitle}>
                    Escolha a data de início do seu plano de treinamento.
                </Text>
            </View>

            {/* =========================================
                DARK CARD CONTAINER — Figma: #1C1C2E, 20px radius
                ========================================= */}
            <View style={styles.card}>
                {/* —— CALENDAR HEADER —— */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={handlePrevMonth}
                        style={styles.navButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <MaterialCommunityIcons name="arrow-left" size={22} color={DS.cyan} />
                    </TouchableOpacity>

                    <Text style={styles.monthYear}>
                        {MONTHS[currentMonth.getMonth()]} de {currentMonth.getFullYear()}
                    </Text>

                    <TouchableOpacity
                        onPress={handleNextMonth}
                        style={styles.navButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <MaterialCommunityIcons name="arrow-right" size={22} color={DS.cyan} />
                    </TouchableOpacity>
                </View>

                {/* —— WEEKDAY HEADERS — Cyan, uppercase —— */}
                <View style={styles.weekdaysRow}>
                    {WEEKDAYS.map((day) => (
                        <View key={day} style={styles.weekdayCell}>
                            <Text style={styles.weekdayText}>{day}</Text>
                        </View>
                    ))}
                </View>

                {/* —— CALENDAR GRID — 41×41px cells —— */}
                <View style={styles.dayGrid}>
                    {days.map((date, index) => {
                        const selected = date && isDateSelected(date);
                        const pastDay = date && isPast(date);
                        const todayDay = date && isToday(date) && !selected;

                        return (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.dayCell,
                                    selected && styles.dayCellSelected,
                                ]}
                                onPress={() => date && handleDateSelect(date)}
                                disabled={!date || isPast(date)}
                                activeOpacity={0.7}
                            >
                                {date && (
                                    <Text style={[
                                        styles.dayText,
                                        pastDay && styles.dayTextPast,
                                        todayDay && styles.dayTextToday,
                                        selected && styles.dayTextSelected,
                                    ]}>
                                        {date.getDate()}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

// ============================================
// STYLES — Figma node 414:663 faithful
// ============================================

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        paddingTop: 8,
    },

    // — Title Section —
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: DS.text,
        lineHeight: 34,
        marginBottom: 8,
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

    // — Dark Card Container —
    card: {
        backgroundColor: DS.cardBg,
        borderRadius: 20,
        paddingHorizontal: CARD_PADDING_H,
        paddingTop: 14,
        paddingBottom: 16,
        // Figma shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
    },

    // — Month/Year Header —
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        marginBottom: 12,
    },
    navButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthYear: {
        fontSize: 14,
        fontWeight: '500',
        color: DS.textSecondary,
        textAlign: 'center',
    },

    // — Weekday Headers (DOM, SEG...) —
    weekdaysRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    weekdayCell: {
        flex: 1,
        height: CELL_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdayText: {
        fontSize: 13,
        fontWeight: '500',
        color: DS.cyan,
        letterSpacing: 0.3,
    },

    // — Day Grid —
    dayGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },

    // — Individual Day Cell (Figma: 41×41px, flex 1/7) —
    dayCell: {
        width: `${100 / 7}%` as any,
        height: CELL_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCellSelected: {
        // Figma: border 1px solid cyan, radius 15px
        borderWidth: 1,
        borderColor: DS.cyan,
        borderRadius: 15,
    },

    // — Day Text —
    dayText: {
        fontSize: 13,
        fontWeight: '500',
        color: DS.text,
    },
    dayTextPast: {
        // Figma: neutral/glass-stroke rgba(235,235,245,0.1) — very faded
        color: DS.pastDay,
    },
    dayTextToday: {
        color: DS.cyan,
        fontWeight: '700',
    },
    dayTextSelected: {
        color: DS.cyan,
        fontWeight: '600',
    },
});

export default StartDateScreen;
