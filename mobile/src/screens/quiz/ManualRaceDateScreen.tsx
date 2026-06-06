import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, borderRadius } from '../../theme';
import { useOnboardingStore } from '../../stores/onboardingStore';

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

const DISTANCE_PILLS = [
    { label: '5km', value: 5 },
    { label: '10km', value: 10 },
    { label: '15km', value: 15 },
    { label: '21km', value: 21.1 },
    { label: '42km', value: 42.2 },
];

const createLocalDate = (y: number, m: number, d: number) => {
    const date = new Date(y, m, d);
    date.setHours(0, 0, 0, 0);
    return date;
};
const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export function ManualRaceDateScreen() {
    const data = useOnboardingStore((s) => s.data);
    const updateData = useOnboardingStore((s) => s.updateData);

    const today = createLocalDate(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
    );

    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const selectedStr = data.race_date ?? null;

    const getDaysInMonth = (date: Date): (Date | null)[] => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const startingDay = createLocalDate(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (Date | null)[] = [];
        for (let i = 0; i < startingDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(createLocalDate(year, month, i));
        while (days.length % 7 !== 0) days.push(null);
        return days;
    };

    const weeks: (Date | null)[][] = [];
    const days = getDaysInMonth(currentMonth);
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const isPast = (d: Date | null) => !d || d < today;
    const isSelected = (d: Date | null) => !!d && !!selectedStr && formatDateString(d) === selectedStr;

    return (
        <View style={styles.wrapper}>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Qual é a data{'\n'}da sua prova?</Text>
                <Text style={styles.subtitle}>
                    Não encontramos sua prova? Sem problema —{'\n'}adicione os detalhes manualmente.
                </Text>
            </View>

            {/* Name (optional) */}
            <Text style={styles.label}>Nome da prova (opcional)</Text>
            <TextInput
                style={styles.input}
                placeholder="Ex: Maratona da minha cidade"
                placeholderTextColor={colors.textMuted}
                value={data.race_name ?? ''}
                onChangeText={(t) => updateData({ race_name: t || null })}
                accessibilityLabel="Nome da prova"
            />

            {/* Distance */}
            <Text style={styles.label}>Distância</Text>
            <View style={styles.pills}>
                {DISTANCE_PILLS.map((p) => {
                    const sel = data.race_distance === p.value;
                    return (
                        <TouchableOpacity
                            key={p.label}
                            style={[styles.pill, sel && styles.pillSelected]}
                            onPress={() => updateData({ race_distance: p.value })}
                            activeOpacity={0.8}
                            accessibilityState={{ selected: sel }}
                        >
                            <Text style={[styles.pillText, sel && styles.pillTextSelected]}>{p.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Calendar */}
            <Text style={styles.label}>Data</Text>
            <View style={styles.card}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        style={styles.navButton}
                        hitSlop={10}
                    >
                        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.monthYear}>
                        {MONTHS[currentMonth.getMonth()]} de {currentMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity
                        onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        style={styles.navButton}
                        hitSlop={10}
                    >
                        <MaterialCommunityIcons name="arrow-right" size={22} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.weekdaysRow}>
                    {WEEKDAYS.map((d) => (
                        <View key={d} style={styles.weekdayCell}>
                            <Text style={styles.weekdayText}>{d}</Text>
                        </View>
                    ))}
                </View>

                {weeks.map((week, wIdx) => (
                    <View key={`w-${wIdx}`} style={styles.weekRow}>
                        {week.map((date, cIdx) => {
                            const sel = isSelected(date);
                            const past = isPast(date);
                            return (
                                <TouchableOpacity
                                    key={`w-${wIdx}-c-${cIdx}`}
                                    style={[styles.dayCell, sel && styles.dayCellSelected]}
                                    disabled={!date || past}
                                    onPress={() => date && updateData({ race_date: formatDateString(date) })}
                                    activeOpacity={0.7}
                                >
                                    {date && (
                                        <Text style={[
                                            styles.dayText,
                                            past && styles.dayTextPast,
                                            sel && styles.dayTextSelected,
                                        ]}>
                                            {date.getDate()}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, paddingTop: 8 },
    titleContainer: { marginBottom: 20 },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 36,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        color: colors.textSecondary,
        lineHeight: 22,
    },
    label: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textLight,
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        paddingHorizontal: 16,
        height: 52,
        fontSize: typography.fontSizes.lg,
        color: colors.text,
    },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pill: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: borderRadius.full,
        backgroundColor: colors.card,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    pillSelected: { borderColor: colors.primary, backgroundColor: 'rgba(0, 212, 255, 0.08)' },
    pillText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textSecondary,
    },
    pillTextSelected: { color: colors.primary },
    card: {
        backgroundColor: colors.streakDayCard,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingTop: 14,
        paddingBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        marginBottom: 8,
    },
    navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    monthYear: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.medium,
        color: colors.textSecondary,
    },
    weekdaysRow: { flexDirection: 'row', marginBottom: 6 },
    weekdayCell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
    weekdayText: { fontSize: 12, fontWeight: '500', color: colors.primary, letterSpacing: 0.3 },
    weekRow: { flexDirection: 'row' },
    dayCell: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
    dayCellSelected: { borderWidth: 1, borderColor: colors.primary, borderRadius: 14 },
    dayText: { fontSize: 13, fontWeight: '500', color: colors.text },
    dayTextPast: { color: 'rgba(235, 235, 245, 0.15)' },
    dayTextSelected: { color: colors.primary, fontWeight: '600' },
});

export default ManualRaceDateScreen;
