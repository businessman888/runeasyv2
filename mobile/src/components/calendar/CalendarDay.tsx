import React, { memo, useCallback } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { fonts } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { DayIndicator, type CalendarDayStatus } from './DayIndicator';

/**
 * A single calendar cell. Vertical flex stack (no absolutely-positioned dots):
 *   [weekday label — week mode only]
 *   [circle with the day number]
 *   [status indicator icon]
 *
 * Selection uses cyan for workout/common days and purple for recovery days.
 * The status icon remains visible, so meaning never depends on color alone.
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
    const selectionColor = status === 'recovery'
        ? semanticColors.recovery
        : semanticColors.accent;

    return (
        <Pressable
            style={styles.cell}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? String(date.getDate())}
            accessibilityState={{ selected: isSelected }}
        >
            {/* Status-colored capsule with icon as an independent signal. */}
            {isSelected && (
                <View
                    style={[styles.capsule, { backgroundColor: selectionColor }]}
                    pointerEvents="none"
                />
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
                    <DayIndicator status={status} selected={isSelected} />
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
        color: semanticColors.textSecondary,
        marginBottom: 3,
    },
    weekdaySelected: {
        color: semanticColors.textOnAccent,
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
        backgroundColor: semanticColors.surface1,
    },
    number: {
        fontFamily: fonts.medium,
        fontSize: 16,
        color: semanticColors.textPrimary,
    },
    numberToday: {
        color: semanticColors.accent,
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
