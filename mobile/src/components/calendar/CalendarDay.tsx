import React, { memo, useCallback } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';
import { StatusDot, type CalendarDayStatus } from './StatusDot';

/**
 * A single calendar cell. Two visual jobs:
 *  - Non-selected day: number (+ status dot below it).
 *  - Selected day: a cyan "stadium" capsule that extends vertically beyond the
 *    cell, wrapping a dark inner circle with the number, plus (week mode only)
 *    the weekday label above it. The status dot sits at the bottom edge inside
 *    the circle.
 *
 * `weekday` is passed only in week mode (month mode has a shared header row), so
 * the same capsule naturally wraps the label in week mode and just the number
 * in month mode. Extracted from Figma nodes 1537:1723 / 1537:1725.
 */

export const CELL_HEIGHT = 62;
const CAPSULE_W = 44;
const CIRCLE = 34;

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

    return (
        <Pressable
            style={[styles.cell, hasLabel ? styles.cellWithLabel : styles.cellCentered]}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? String(date.getDate())}
            accessibilityState={{ selected: isSelected }}
        >
            {/* Cyan stadium capsule — behind the content, extends past the cell. */}
            {isSelected && <View style={styles.capsule} pointerEvents="none" />}

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
                {status && (
                    <View style={styles.dotWrap} pointerEvents="none">
                        <StatusDot status={status} />
                    </View>
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
        position: 'relative',
    },
    cellCentered: {
        justifyContent: 'center',
    },
    cellWithLabel: {
        justifyContent: 'space-between',
        paddingVertical: 5,
    },
    // Fills the full cell height (taller than the neighbours' number+dot
    // content, so it reads as the raised "stadium" from Figma) without spilling
    // past the cell — the animated grid clips overflow during the transition.
    capsule: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: CAPSULE_W,
        transform: [{ translateX: -CAPSULE_W / 2 }],
        borderRadius: CAPSULE_W / 2,
        backgroundColor: colors.primary,
    },
    weekday: {
        fontFamily: fonts.medium,
        fontSize: 12,
        color: colors.textLight,
    },
    weekdaySelected: {
        color: colors.backgroundLight, // navy on cyan
    },
    circle: {
        width: CIRCLE,
        height: CIRCLE,
        borderRadius: CIRCLE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    circleSelected: {
        backgroundColor: colors.backgroundLight, // #0E0E1F
    },
    number: {
        fontFamily: fonts.medium,
        fontSize: 15,
        color: colors.white,
    },
    numberToday: {
        color: colors.primary,
        fontFamily: fonts.bold,
    },
    dotWrap: {
        position: 'absolute',
        bottom: 3,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
});

export default CalendarDay;
