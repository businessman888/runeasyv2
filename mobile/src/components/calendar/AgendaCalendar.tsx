import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { colors, fonts } from '../../theme';
import { GlassSurface } from '../ui/GlassSurface';
import { semanticColors } from '../../theme/semanticColors';
import { AppIcon } from '../ui/AppIcon';
import { CalendarDay, CELL_HEIGHT } from './CalendarDay';
import { DayIndicator, type CalendarDayStatus } from './DayIndicator';
import { useCalendarGrid, toLocalDateStr, isSameDay, startOfDay } from './useCalendarGrid';

export type CalendarViewMode = 'week' | 'month';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STATUS_A11Y: Record<CalendarDayStatus, string> = {
    planned: 'treino planejado',
    completed: 'treino realizado',
    missed: 'treino não realizado',
    recovery: 'descanso',
};

// Layout constants (px). Grid height is computed from these so the week↔month
// transition can animate between two known heights (no measurement race).
const HEADER_H = 22;
const HEADER_MB = 10;
const ROW_GAP = 8;
// Quick, precise ease — no spring overshoot → smoother collapse/expand,
// especially over the glass blur on mid-range Android.
const DURATION = 300;

function monthHeight(numWeeks: number): number {
    return HEADER_H + HEADER_MB + numWeeks * CELL_HEIGHT + (numWeeks - 1) * ROW_GAP;
}

interface AgendaCalendarProps {
    viewMode: CalendarViewMode;
    onViewModeChange: (mode: CalendarViewMode) => void;
    selectedDay: Date;
    onSelectDay: (day: Date) => void;
    /** Fetch/navigation anchor month. */
    currentMonth: Date;
    /** Step the visible period: month mode ±1 month, week mode ±1 week. */
    onNavigate: (direction: -1 | 1) => void;
    /** Return to today (current period + select today). */
    onToday: () => void;
    getStatus: (dateStr: string) => CalendarDayStatus | null;
    /** Skip the live glass blur (Free tease already provides an outer blur). */
    disableGlass?: boolean;
    style?: StyleProp<ViewStyle>;
}

function AgendaCalendarInner({
    viewMode,
    onViewModeChange,
    selectedDay,
    onSelectDay,
    currentMonth,
    onNavigate,
    onToday,
    getStatus,
    disableGlass = false,
    style,
}: AgendaCalendarProps) {
    const reducedMotion = useReducedMotion();
    const today = useMemo(() => startOfDay(new Date()), []);
    const { weekDays, monthWeeks } = useCalendarGrid(currentMonth, selectedDay);

    // ── Animated grid height (collapse/expand) ──────────────────────────────
    const targetHeight = viewMode === 'month' ? monthHeight(monthWeeks.length) : CELL_HEIGHT;
    const height = useSharedValue(targetHeight);
    useEffect(() => {
        height.value = targetHeight;
    }, [targetHeight, height]);
    const gridAnimatedStyle = useAnimatedStyle(() => ({
        height: reducedMotion
            ? height.value
            : withTiming(height.value, { duration: DURATION, easing: Easing.out(Easing.cubic) }),
    }));

    // ── Period label ────────────────────────────────────────────────────────
    const periodLabel = useMemo(() => {
        if (viewMode === 'month') {
            return `${MONTHS_SHORT[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
        }
        const a = weekDays[0];
        const b = weekDays[6];
        const la = `${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}`;
        const lb = `${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
        return la === lb ? la : `${la} - ${lb}`;
    }, [viewMode, currentMonth, weekDays]);

    const renderDay = useCallback(
        (date: Date, opts: { weekday?: string; inMonth?: boolean }) => {
            const status = opts.inMonth === false ? null : getStatus(toLocalDateStr(date));
            const a11y = `${date.getDate()} de ${MONTHS_SHORT[date.getMonth()]}${status ? `, ${STATUS_A11Y[status]}` : ''}`;
            return (
                <CalendarDay
                    key={date.getTime()}
                    date={date}
                    weekday={opts.weekday}
                    inMonth={opts.inMonth}
                    status={status}
                    isSelected={isSameDay(date, selectedDay)}
                    isToday={isSameDay(date, today)}
                    onPress={onSelectDay}
                    accessibilityLabel={a11y}
                />
            );
        },
        [getStatus, selectedDay, today, onSelectDay],
    );

    return (
        <GlassSurface radius={30} disableBlur={disableGlass} bordered={false} style={[styles.card, style]}>
            {/* Navigation row */}
            <View style={styles.navRow}>
                <View style={styles.navLeft}>
                    <View style={styles.arrows}>
                        <Pressable
                            onPress={() => onNavigate(-1)}
                            hitSlop={10}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={viewMode === 'month' ? 'Mês anterior' : 'Semana anterior'}
                        >
                            <AppIcon name="chevronBack" size={20} tone="primary" />
                        </Pressable>
                        <Pressable
                            onPress={() => onNavigate(1)}
                            hitSlop={10}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={viewMode === 'month' ? 'Próximo mês' : 'Próxima semana'}
                        >
                            <AppIcon name="chevronForward" size={20} tone="primary" />
                        </Pressable>
                    </View>
                    <AppIcon name="calendar" size={16} tone="secondary" style={styles.calIcon} />
                    <Text style={styles.periodLabel}>{periodLabel}</Text>
                </View>
                <Pressable
                    onPress={onToday}
                    style={({ pressed }) => [styles.todayPill, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Ir para hoje"
                >
                    <Text style={styles.todayPillText}>Hoje</Text>
                </Pressable>
            </View>

            {/* Semana / Mês toggle */}
            <View style={styles.toggle}>
                {(['week', 'month'] as const).map((mode) => {
                    const active = viewMode === mode;
                    return (
                        <Pressable
                            key={mode}
                            onPress={() => onViewModeChange(mode)}
                            style={({ pressed }) => [
                                styles.togglePill,
                                active ? styles.togglePillActive : styles.togglePillInactive,
                                pressed && styles.pressed,
                            ]}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={mode === 'week' ? 'Semana' : 'Mês'}
                        >
                            <Text style={[styles.toggleText, active ? styles.toggleTextActive : styles.toggleTextInactive]}>
                                {mode === 'week' ? 'Semana' : 'Mês'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Grid (animated height) */}
            <Animated.View style={[styles.grid, gridAnimatedStyle]}>
                {viewMode === 'month' ? (
                    <View>
                        <View style={styles.weekdayHeader}>
                            {WEEKDAYS.map((wd) => (
                                <Text key={wd} style={styles.weekdayHeaderText}>
                                    {wd}
                                </Text>
                            ))}
                        </View>
                        {monthWeeks.map((week, wi) => (
                            <View
                                key={`w-${week[0].getTime()}`}
                                style={[styles.row, wi < monthWeeks.length - 1 && styles.rowGap]}
                            >
                                {week.map((date) =>
                                    renderDay(date, { inMonth: date.getMonth() === currentMonth.getMonth() }),
                                )}
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.row}>
                        {weekDays.map((date) => renderDay(date, { weekday: WEEKDAYS[date.getDay()] }))}
                    </View>
                )}
            </Animated.View>

            {/* Legend — month only (per Figma) */}
            {viewMode === 'month' && (
                <View style={styles.legend}>
                    <View style={styles.legendItem}>
                        <DayIndicator status="planned" />
                        <Text style={styles.legendText}>Treino</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <DayIndicator status="recovery" />
                        <Text style={styles.legendText}>Descanso</Text>
                    </View>
                </View>
            )}
        </GlassSurface>
    );
}

export const AgendaCalendar = memo(AgendaCalendarInner);

const styles = StyleSheet.create({
    card: {
        paddingHorizontal: 12,
        paddingVertical: 16,
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    navLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
    },
    arrows: {
        flexDirection: 'row',
        gap: 8,
        marginRight: 12,
    },
    iconButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calIcon: {
        marginRight: 6,
    },
    periodLabel: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: semanticColors.textSecondary,
        flexShrink: 1,
    },
    todayPill: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: semanticColors.glass,
        borderWidth: 1,
        borderColor: semanticColors.borderStrong,
    },
    todayPillText: {
        fontFamily: fonts.semibold,
        fontSize: 12,
        color: semanticColors.textPrimary,
    },
    toggle: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
        marginBottom: 16,
    },
    togglePill: {
        flex: 1,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    togglePillActive: {
        backgroundColor: semanticColors.accent,
    },
    togglePillInactive: {
        backgroundColor: semanticColors.glass,
    },
    toggleText: {
        fontFamily: fonts.medium,
        fontSize: 15,
    },
    toggleTextActive: {
        color: semanticColors.textOnAccent,
    },
    toggleTextInactive: {
        color: semanticColors.textSecondary,
    },
    grid: {
        overflow: 'hidden',
    },
    weekdayHeader: {
        flexDirection: 'row',
        height: HEADER_H,
        marginBottom: HEADER_MB,
    },
    weekdayHeaderText: {
        flex: 1,
        textAlign: 'center',
        fontFamily: fonts.medium,
        fontSize: 12,
        color: semanticColors.textTertiary,
    },
    row: {
        flexDirection: 'row',
    },
    rowGap: {
        marginBottom: ROW_GAP,
    },
    legend: {
        flexDirection: 'row',
        gap: 24,
        marginTop: 16,
        paddingHorizontal: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendText: {
        fontFamily: fonts.regular,
        fontSize: 13,
        color: semanticColors.textSecondary,
    },
    pressed: {
        opacity: 0.6,
    },
});

export default AgendaCalendar;
