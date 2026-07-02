import React, { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

/**
 * Per-day status shown on the Agenda calendar. Derived upstream by the screen's
 * `getCalendarStatus` from `ScheduleDay`.
 * Meanings: cyan = Treino a realizar, verde = realizado, vermelho = não
 * realizado, roxo = Descanso.
 */
export type CalendarDayStatus = 'planned' | 'completed' | 'missed' | 'recovery';

/** Status → color, also used for the selected-day capsule background. */
export const STATUS_COLORS: Record<CalendarDayStatus, string> = {
    planned: colors.primary, // #00D4FF cyan
    completed: colors.completed, // #32CD32 green
    missed: colors.missed, // #FF453A red
    recovery: colors.recovery, // #9747FF purple
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Clean, premium indicator glyphs from the app's Ionicons set (replaces the
// old dashes/× and the flat gradient dots): a check for done, an × for missed,
// a moon for rest, a small filled dot for an upcoming session.
const ICON: Record<CalendarDayStatus, { name: IoniconName; size: number }> = {
    planned: { name: 'ellipse', size: 7 },
    completed: { name: 'checkmark-sharp', size: 13 },
    missed: { name: 'close-sharp', size: 13 },
    recovery: { name: 'moon', size: 11 },
};

interface DayIndicatorProps {
    status: CalendarDayStatus;
    /** Override the glyph color (e.g. navy when sitting on a colored capsule). */
    color?: string;
}

export const DayIndicator = memo(function DayIndicator({ status, color }: DayIndicatorProps) {
    const { name, size } = ICON[status];
    return <Ionicons name={name} size={size} color={color ?? STATUS_COLORS[status]} />;
});

export default DayIndicator;
