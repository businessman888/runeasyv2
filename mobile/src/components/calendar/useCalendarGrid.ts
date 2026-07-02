import { useMemo } from 'react';

/**
 * Date helpers + grid derivation for the Agenda calendar. Weeks start on Sunday
 * (Dom), matching the Figma design's first column.
 */

export function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

export function addDays(d: Date, n: number): Date {
    const x = startOfDay(d);
    x.setDate(x.getDate() + n);
    return x;
}

/** Sunday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay());
    return x;
}

export function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * Local `YYYY-MM-DD` (no UTC shift) — must match the key the screen uses to
 * look up `schedule`/`workouts` (built from local date components).
 */
export function toLocalDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export interface CalendarGrid {
    /** 7 days (Sun→Sat) of the week containing `selectedDay`. */
    weekDays: Date[];
    /** Weeks (each 7 days, Sun→Sat) covering `currentMonth`, incl. leading/trailing spill. */
    monthWeeks: Date[][];
}

export function useCalendarGrid(currentMonth: Date, selectedDay: Date): CalendarGrid {
    const weekDays = useMemo(() => {
        const start = startOfWeek(selectedDay);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [selectedDay]);

    const monthWeeks = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const first = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const offset = first.getDay(); // leading empty cells before day 1
        const numWeeks = Math.ceil((offset + daysInMonth) / 7);
        const gridStart = startOfWeek(first);
        return Array.from({ length: numWeeks }, (_, w) =>
            Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)),
        );
    }, [currentMonth]);

    return { weekDays, monthWeeks };
}
