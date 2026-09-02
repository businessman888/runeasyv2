import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, elevation, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { Skeleton, SkeletonCircle } from './Skeleton';
import { AppIcon } from './ui/AppIcon';
import { ScheduleDay } from '../stores/trainingStore';

// Free users have no streak/plan counters — the header center shows the brand
// wordmark instead (cropped to the logo's content, transparent background).
const HEADER_LOGO = require('../assets/images/lpLogoRuneasyHeader.png');

interface HomeFixedHeaderProps {
    currentStreak: number;
    schedule: ScheduleDay[];
    unreadCount: number;
    profilePic: string;
    userName: string;
    /** Free users have no plan — hide the week grid and plan-derived counters. */
    isProUser: boolean;
    /** Cold start: swap avatar/stats/day-icons for skeletons (layout preserved). */
    isLoading?: boolean;
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
    isProUser,
    isLoading = false,
    onPressProfile,
    onPressNotifications,
}: HomeFixedHeaderProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();

    const weekData = useMemo(() => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const days: WeekDay[] = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const scheduleDay = schedule.find(s => s.date === dateStr) || null;
            const isToday = dateStr === todayStr;

            // O backend `getScheduleWithStatus` faz fallback do tipo do dia para
            // 'workout' quando o usuário registra uma corrida manual/livre num
            // dia que originalmente era recovery. No grid semanal (que reflete
            // o PLANO), esses dias devem permanecer recovery — a corrida livre
            // pertence à aba "Atividades", não ao header de progresso do plano.
            // Mesmo padrão usado em `CalendarScreen.getPlanStatusForDay`.
            const workoutSource = scheduleDay?.workout?.source;
            const isNonPlanFallback = scheduleDay?.type === 'workout'
                && (workoutSource === 'manual' || workoutSource === 'free');
            const effectiveType: 'workout' | 'recovery' | null = isNonPlanFallback
                ? 'recovery'
                : (scheduleDay?.type ?? null);

            let status: DayStatus = null;
            const type: 'workout' | 'recovery' | null = effectiveType;

            if (scheduleDay && effectiveType !== null) {
                if (effectiveType === 'recovery') {
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
                {isLoading ? (
                    <SkeletonCircle size={40} />
                ) : (
                    <TouchableOpacity onPress={onPressProfile} activeOpacity={0.7}>
                        {profilePic && profilePic.startsWith('http') ? (
                            <Image source={{ uri: profilePic }} style={styles.profileImage} />
                        ) : (
                            <View style={styles.profileInitials}>
                                <Text style={styles.profileInitialsText}>{initials}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {/* Cold start: barra de skeleton no centro (mantém a altura do header).
                    Pro: streak + counters. Free: wordmark da marca. */}
                {isLoading ? (
                    <View style={styles.logoWrap}>
                        <Skeleton width={150} height={18} borderRadius={9} />
                    </View>
                ) : isProUser ? (
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <AppIcon name="flame" size={16} tone="warning" variant="filled" />
                            <Text style={styles.statTextWhite}>{currentStreak}</Text>
                        </View>
                        <View style={styles.statItem}>
                            <AppIcon name="energy" size={16} tone="secondary" variant="filled" />
                            <Text style={styles.statTextLight}>
                                {counters.restDone}/{counters.restTotal}
                            </Text>
                        </View>
                        <View style={styles.statItem}>
                            <AppIcon name="running" size={16} tone="accent" variant="filled" />
                            <Text style={styles.statTextWhite}>
                                {counters.workoutDone}/{counters.workoutTotal}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.logoWrap}>
                        <Image source={HEADER_LOGO} style={styles.headerLogo} resizeMode="contain" />
                    </View>
                )}

                <TouchableOpacity
                    onPress={onPressNotifications}
                    activeOpacity={0.7}
                    style={styles.bellContainer}
                >
                    <AppIcon name="notification" size={24} tone="primary" variant="outline" />
                    {unreadCount > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Section 2: Week Grid — always shown (days + current-day marker).
                The per-day workout/rest icons come from the plan, so they render
                for Pro only; Free sees just the weekday + number. */}
            <View style={styles.weekRow}>
                {weekData.map((day) => {
                    const isCurrentDay = day.isToday;
                    // Free has no plan → always mark the current day in cyan (never
                    // leak the plan's recovery color).
                    const borderColor = isProUser && day.type === 'recovery' ? colors.recovery : colors.primary;

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
                                {/* Loading: dot skeleton. Pro: real plan icon.
                                    Free: a clean lock where the plan icon would be. */}
                                {isLoading ? (
                                    <SkeletonCircle size={14} />
                                ) : isProUser ? (
                                    renderDayIcon(day)
                                ) : (
                                    <AppIcon name="lock" size={16} tone="tertiary" variant="outline" />
                                )}
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
            return <AppIcon name="check" size={size} tone="success" variant="filled" />;
        case 'missed':
            return <AppIcon name="close" size={size} tone="danger" variant="filled" />;
        case 'recovery':
        case 'pending_recovery':
            return <AppIcon name="energy" size={size} tone="secondary" variant="outline" />;
        case 'pending_workout':
            return <AppIcon name="running" size={size} tone="primary" variant="outline" />;
        default:
            return <AppIcon name="energy" size={size} tone="tertiary" variant="outline" />;
    }
}

const styles = createThemeStyles(() => ({
    container: {
        backgroundColor: semanticColors.surface1,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        paddingHorizontal: 10,
        gap: 13,
        ...elevation.md,
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
        borderColor: semanticColors.borderStrong,
    },
    profileInitials: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: semanticColors.borderStrong,
        backgroundColor: semanticColors.surface3,
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInitialsText: {
        fontSize: 14,
        fontWeight: '600',
        color: semanticColors.textPrimary,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 14,
    },
    // Free: brand wordmark centered between the avatar and the bell.
    logoWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
    },
    headerLogo: {
        width: 140,
        height: 30,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statTextWhite: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.textPrimary,
    },
    statTextLight: {
        fontSize: 12,
        fontWeight: typography.fontWeights.semibold,
        color: semanticColors.textPrimary,
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
        backgroundColor: colors.error,
        borderRadius: 10,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        color: semanticColors.textPrimary,
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
        color: semanticColors.textSecondary,
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
        color: semanticColors.textPrimary,
    },
}));
