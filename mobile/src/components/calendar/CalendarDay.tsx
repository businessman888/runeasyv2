import React, { memo, useCallback } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';
import { DayIndicator, STATUS_COLORS, type CalendarDayStatus } from './DayIndicator';

/**
 * A single calendar cell. Vertical flex stack (no absolutely-positioned dots):
 *   [weekday label — week mode only]
 *   [circle with the day number]
 *   [status indicator icon]
 *
 * Selected day: a "stadium" capsule tinted by the day's status (green = done,
 * red = missed, purple = rest, cyan = upcoming) sits behind the stack, with the
 * number in a dark inner circle. The indicator is kept (color + icon, never
 * color alone) but tinted dark for contrast on the colored capsule.
 *
 * `weekday` is passed only in week mode (month mode has a shared header row).
 */

export const CELL_HEIGHT = 78;
const CIRCLE = 36;

interface CalendarDayProps {
    date: Date;
    /** Render an empty spacer (out-of-month day in month view). */
    inMonth?: boolean;
    /** Weekday label shown above the number (week mode only). */
    weekday?: string;
    status: CalendarDayStatus | null;
    isSelected: boolean;
    isToday: boolean;
    onPress: (date: Date) => void;
    accessibilityLabel?: string;
}

function CalendarDayInner({
    date,
    inMonth = true,
    weekday,
    status,
    isSelected,
    isToday,
    onPress,
    accessibilityLabel,
}: CalendarDayProps) {
    const handlePress = useCallback(() => onPress(date), [onPress, date]);

    // Out-of-month day → keep the column width, render nothing.
    if (!inMonth) return <View style={styles.cell} />;

    const hasLabel = weekday != null;
    // Selected capsule takes the status color; default cyan when the day has no
    // status (e.g. an upcoming plan day the user just tapped).
    const capsuleColor = STATUS_COLORS[status ?? 'planned'];

    return (
        <Pressable
            style={styles.cell}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? String(date.getDate())}
            accessibilityState={{ selected: isSelected }}
        >
            {/* Status-colored stadium capsule behind the content. */}
            {isSelected && (
                <View style={[styles.capsule, { backgroundColor: capsuleColor }]} pointerEvents="none" />
            )}

            {hasLabel && (
                <Text style={[styles.weekday, isSelected && styles.weekdaySelected]}>
                    {weekday}
                </Text>
            )}

            <View style={[styles.circle, isSelected && styles.circleSelected]}>
                <Text
                    style={[
                        styles.number,
                        isToday && !isSelected && styles.numberToday,
                    ]}
                >
                    {date.getDate()}
                </Text>
            </View>

            <View style={styles.indicatorSlot}>
                {status && (
                    <DayIndicator
                        status={status}
                        color={isSelected ? colors.backgroundLight : undefined}
                    />
                )}
            </View>
        </Pressable>
    );
}

export const CalendarDay = memo(CalendarDayInner);

const styles = StyleSheet.create({
    cell: {
        flex: 1,
        height: CELL_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    // Inset from the cell's left/right edges so its width ADAPTS to the column
    // and never exceeds it. A fixed width wider than the column overflowed the
    // cell and got clipped by the grid's overflow:hidden on the edge columns
    // (Dom/Sab). Full cell height → taller than the neighbours' content, so it
    // still reads as a raised stadium.
    capsule: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 2,
        right: 2,
        borderRadius: 20,
    },
    weekday: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: colors.textLight,
        marginBottom: 3,
    },
    weekdaySelected: {
        color: colors.backgroundLight, // navy on the colored capsule
    },
    circle: {
        width: CIRCLE,
        height: CIRCLE,
        aspectRatio: 1,
        borderRadius: CIRCLE / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleSelected: {
        backgroundColor: colors.backgroundLight, // #0E0E1F
    },
    number: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: colors.white,
    },
    numberToday: {
        color: colors.primary,
        fontFamily: fonts.bold,
    },
    indicatorSlot: {
        height: 16,
        marginTop: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default CalendarDay;
