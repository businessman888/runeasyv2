import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { ScheduleDay } from '../stores/trainingStore';

interface WeeklyStreakCardProps {
    currentStreak: number;
    schedule: ScheduleDay[];
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

type DayStatus = 'completed' | 'missed' | 'recovery' | 'pending_workout' | 'pending_recovery' | null;

interface WeekDay {
    date: string;
    label: string;
    status: DayStatus;
    type: 'workout' | 'recovery' | null;
    isToday: boolean;
}

export function WeeklyStreakCard({ currentStreak, schedule }: WeeklyStreakCardProps) {
    const weekData = useMemo(() => {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sunday
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const days: WeekDay[] = [];
        const todayStr = now.toISOString().split('T')[0];

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const scheduleDay = schedule.find(s => s.date === dateStr) || null;
            const isToday = dateStr === todayStr;

            let status: DayStatus = null;
            let type: 'workout' | 'recovery' | null = scheduleDay?.type ?? null;

            if (scheduleDay && scheduleDay.type !== null) {
                if (scheduleDay.type === 'recovery') {
                    status = scheduleDay.is_past || isToday ? 'recovery' : 'pending_recovery';
                } else if (scheduleDay.status === 'completed') {
                    status = 'completed';
                } else if (scheduleDay.status === 'missed') {
                    status = 'missed';
                } else if (scheduleDay.status === 'pending') {
                    status = 'pending_workout';
                }
            }

            days.push({
                date: dateStr,
                label: DAY_LABELS[i],
                status,
                type,
                isToday,
            });
        }

        return days;
    }, [schedule]);

    const counters = useMemo(() => {
        let restTotal = 0;
        let restDone = 0;
        let workoutTotal = 0;
        let workoutDone = 0;

        for (const day of weekData) {
            if (day.type === 'recovery') {
                restTotal++;
                if (day.status === 'recovery') restDone++;
            } else if (day.type === 'workout') {
                workoutTotal++;
                if (day.status === 'completed') workoutDone++;
            }
        }

        return { restDone, restTotal, workoutDone, workoutTotal };
    }, [weekData]);

    return (
        <View style={styles.card}>
            {/* Section 1: Streak info + counters */}
            <View style={styles.headerSection}>
                <View style={styles.streakInfo}>
                    <MaterialCommunityIcons name="fire" size={50} color={colors.primary} />
                    <View style={styles.streakTextContainer}>
                        <Text style={styles.streakNumber}>{currentStreak}</Text>
                        <Text style={styles.streakLabel}>dias de sequência</Text>
                    </View>
                </View>

                <View style={styles.counters}>
                    <View style={styles.counterItem}>
                        <Ionicons name="flash" size={18} color={colors.recovery} />
                        <Text style={styles.counterTextRest}>
                            {counters.restDone}/{counters.restTotal}
                        </Text>
                    </View>
                    <View style={styles.counterItem}>
                        <MaterialCommunityIcons name="shoe-sneaker" size={18} color={colors.primary} />
                        <Text style={styles.counterTextWorkout}>
                            {counters.workoutDone}/{counters.workoutTotal}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Section 2: Weekly day cards */}
            <View style={styles.weekSection}>
                {weekData.map((day) => {
                    const borderStyle = getDayBorder(day);
                    const iconColor = getDayIconColor(day);
                    const textColor = getDayTextColor(day);

                    return (
                        <View
                            key={day.date}
                            style={[styles.dayCard, borderStyle]}
                        >
                            <View style={styles.dayIconContainer}>
                                {renderDayIcon(day, iconColor)}
                            </View>
                            <Text style={[styles.dayLabel, { color: textColor }]}>
                                {day.label}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function renderDayIcon(day: WeekDay, color: string): React.ReactNode {
    switch (day.status) {
        case 'completed':
            return <Ionicons name="checkmark-circle" size={24} color={color} />;
        case 'missed':
            return <Ionicons name="close-circle" size={24} color={color} />;
        case 'recovery':
        case 'pending_recovery':
            return <Ionicons name="flash" size={24} color={color} />;
        case 'pending_workout':
            return <MaterialCommunityIcons name="shoe-sneaker" size={24} color={color} />;
        default:
            return <Ionicons name="flash" size={24} color={colors.recovery} />;
    }
}

function getDayBorder(day: WeekDay) {
    if (day.isToday) {
        const borderColor = day.type === 'recovery' ? colors.recovery : colors.primary;
        return { borderWidth: 1, borderColor };
    }
    if (day.status === 'completed') {
        return { borderWidth: 0.4, borderColor: 'rgba(50, 205, 50, 0.2)' };
    }
    if (day.status === 'missed') {
        return { borderWidth: 0.4, borderColor: 'rgba(255, 69, 58, 0.2)' };
    }
    return {};
}

function getDayIconColor(day: WeekDay): string {
    if (day.isToday) {
        return day.type === 'recovery' ? colors.recovery : colors.primary;
    }
    switch (day.status) {
        case 'completed':
            return colors.completed;
        case 'missed':
            return colors.missed;
        case 'recovery':
        case 'pending_recovery':
            return colors.recovery;
        case 'pending_workout':
            return colors.recovery;
        default:
            return colors.recovery;
    }
}

function getDayTextColor(day: WeekDay): string {
    if (day.isToday) {
        return day.type === 'recovery' ? colors.recovery : colors.primary;
    }
    switch (day.status) {
        case 'completed':
            return colors.completed;
        case 'missed':
            return colors.missed;
        case 'recovery':
        case 'pending_recovery':
            return colors.recovery;
        default:
            return colors.recovery;
    }
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.streakCard,
        borderRadius: 25,
        paddingVertical: 16,
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },

    // Section 1
    headerSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    streakInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    streakTextContainer: {
        justifyContent: 'center',
    },
    streakNumber: {
        fontSize: 24,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
        lineHeight: 29,
    },
    streakLabel: {
        fontSize: 10,
        fontWeight: typography.fontWeights.medium,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    counters: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    counterItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    counterTextRest: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: colors.textLight,
    },
    counterTextWorkout: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: colors.primary,
    },

    // Section 2
    weekSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
    },
    dayCard: {
        flex: 1,
        height: 76,
        backgroundColor: colors.streakDayCard,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    dayIconContainer: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayLabel: {
        fontSize: 13,
        fontWeight: typography.fontWeights.semibold,
        textAlign: 'center',
    },
});
