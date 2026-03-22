import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../theme';
import { ScheduleDay } from '../stores/trainingStore';

interface HomeFixedHeaderProps {
    currentStreak: number;
    schedule: ScheduleDay[];
    unreadCount: number;
    profilePic: string;
    userName: string;
    onPressProfile: () => void;
    onPressNotifications: () => void;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

type DayStatus = 'completed' | 'missed' | 'recovery' | 'pending_workout' | 'pending_recovery' | null;

interface WeekDay {
    date: string;
    dayNumber: number;
    label: string;
    status: DayStatus;
    type: 'workout' | 'recovery' | null;
    isToday: boolean;
}

export function HomeFixedHeader({
    currentStreak,
    schedule,
    unreadCount,
    profilePic,
    userName,
    onPressProfile,
    onPressNotifications,
}: HomeFixedHeaderProps) {
    const insets = useSafeAreaInsets();

    const weekData = useMemo(() => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const todayStr = now.toISOString().split('T')[0];
        const days: WeekDay[] = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const scheduleDay = schedule.find(s => s.date === dateStr) || null;
            const isToday = dateStr === todayStr;

            let status: DayStatus = null;
            const type: 'workout' | 'recovery' | null = scheduleDay?.type ?? null;

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
                dayNumber: d.getDate(),
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

    const initials = useMemo(() => {
        const parts = userName.split(' ');
        if (parts.length > 1) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return userName[0]?.toUpperCase() ?? '?';
    }, [userName]);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Section 1: Profile + Stats + Bell */}
            <View style={styles.topRow}>
                <TouchableOpacity onPress={onPressProfile} activeOpacity={0.7}>
                    {profilePic && profilePic.startsWith('http') ? (
                        <Image source={{ uri: profilePic }} style={styles.profileImage} />
                    ) : (
                        <View style={styles.profileInitials}>
                            <Text style={styles.profileInitialsText}>{initials}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="fire" size={18} color="#FFFFFF" />
                        <Text style={styles.statTextWhite}>{currentStreak}</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Ionicons name="flash" size={18} color={colors.recovery} />
                        <Text style={styles.statTextLight}>
                            {counters.restDone}/{counters.restTotal}
                        </Text>
                    </View>
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="shoe-sneaker" size={18} color={colors.primary} />
                        <Text style={styles.statTextWhite}>
                            {counters.workoutDone}/{counters.workoutTotal}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={onPressNotifications}
                    activeOpacity={0.7}
                    style={styles.bellContainer}
                >
                    <Ionicons name="notifications" size={24} color="#FFFFFF" />
                    {unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Section 2: Week Grid */}
            <View style={styles.weekRow}>
                {weekData.map((day) => {
                    const isCurrentDay = day.isToday;
                    const borderColor = day.type === 'recovery' ? colors.recovery : colors.primary;

                    return (
                        <View
                            key={day.date}
                            style={[
                                styles.dayColumn,
                                isCurrentDay && {
                                    borderBottomWidth: 2,
                                    borderBottomColor: borderColor,
                                },
                            ]}
                        >
                            <Text style={styles.dayLabel}>{day.label}</Text>
                            <View style={styles.dayIconContainer}>
                                {renderDayIcon(day)}
                            </View>
                            <Text
                                style={[
                                    styles.dayNumber,
                                    isCurrentDay && { color: colors.primary },
                                ]}
                            >
                                {day.dayNumber}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function renderDayIcon(day: WeekDay): React.ReactNode {
    const size = 16;

    switch (day.status) {
        case 'completed':
            return <Ionicons name="checkmark-circle" size={size} color={colors.completed} />;
        case 'missed':
            return <Ionicons name="close-circle" size={size} color={colors.missed} />;
        case 'recovery':
        case 'pending_recovery':
            return <Ionicons name="flash" size={size} color={colors.recovery} />;
        case 'pending_workout':
            return <MaterialCommunityIcons name="shoe-sneaker" size={size} color="#FFFFFF" />;
        default:
            return <Ionicons name="flash" size={size} color={colors.recovery} />;
    }
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#15152A',
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        paddingHorizontal: 10,
        gap: 13,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
        zIndex: 10,
    },

    // Section 1
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 11,
        paddingHorizontal: 11,
        gap: 2,
    },
    profileImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    profileInitials: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: '#1C1C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInitialsText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 14,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statTextWhite: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: '#FFFFFF',
    },
    statTextLight: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: '#EBEBF5',
    },
    bellContainer: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        top: -6,
        right: -8,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: 'bold',
    },

    // Section 2
    weekRow: {
        flexDirection: 'row',
        height: 68,
        paddingBottom: 4,
    },
    dayColumn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingBottom: 4,
    },
    dayLabel: {
        fontSize: 10,
        fontWeight: typography.fontWeights.semibold,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    dayIconContainer: {
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNumber: {
        fontSize: 13,
        fontWeight: typography.fontWeights.semibold,
        color: '#EBEBF5',
    },
});
