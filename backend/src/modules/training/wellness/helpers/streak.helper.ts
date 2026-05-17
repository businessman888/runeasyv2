/**
 * Computes the user's current and longest running streak.
 *
 * Streak rule: number of consecutive days (counting back from "today" in
 * São Paulo timezone) that contain at least one completed activity.
 * Window capped at 90 days to bound query cost.
 */

const SAO_PAULO_OFFSET_HOURS = -3;
export const STREAK_WINDOW_DAYS = 90;

export interface StreakResult {
    current: number;
    longest: number;
    lastActivityDate: string | null; // YYYY-MM-DD in São Paulo TZ
}

/**
 * Convert an ISO timestamp (UTC) to a YYYY-MM-DD date string in São Paulo.
 */
export function toSaoPauloDateStr(isoTimestamp: string): string {
    const utc = new Date(isoTimestamp);
    const sp = new Date(utc.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000);
    const y = sp.getUTCFullYear();
    const m = String(sp.getUTCMonth() + 1).padStart(2, '0');
    const d = String(sp.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function saoPauloTodayStr(): string {
    return toSaoPauloDateStr(new Date().toISOString());
}

function dateStrMinusDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * Compute current + longest streak from a set of ISO activity timestamps.
 */
export function computeStreak(activityStartDates: string[]): StreakResult {
    if (activityStartDates.length === 0) {
        return { current: 0, longest: 0, lastActivityDate: null };
    }

    const daysWithActivity = new Set<string>();
    for (const iso of activityStartDates) {
        daysWithActivity.add(toSaoPauloDateStr(iso));
    }

    const today = saoPauloTodayStr();

    // Current streak — count back from today. Allow a 1-day grace
    // (yesterday) so a user who hasn't run yet today doesn't see a 0.
    let current = 0;
    let cursor = today;
    if (!daysWithActivity.has(cursor)) {
        cursor = dateStrMinusDays(cursor, 1);
        if (!daysWithActivity.has(cursor)) {
            current = 0;
        } else {
            current = 1;
            cursor = dateStrMinusDays(cursor, 1);
            while (daysWithActivity.has(cursor) && current < STREAK_WINDOW_DAYS) {
                current += 1;
                cursor = dateStrMinusDays(cursor, 1);
            }
        }
    } else {
        current = 1;
        cursor = dateStrMinusDays(cursor, 1);
        while (daysWithActivity.has(cursor) && current < STREAK_WINDOW_DAYS) {
            current += 1;
            cursor = dateStrMinusDays(cursor, 1);
        }
    }

    // Longest streak — scan the window for the longest consecutive run.
    let longest = 0;
    let run = 0;
    let scan = today;
    for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
        if (daysWithActivity.has(scan)) {
            run += 1;
            if (run > longest) longest = run;
        } else {
            run = 0;
        }
        scan = dateStrMinusDays(scan, 1);
    }
    if (current > longest) longest = current;

    const sortedDates = Array.from(daysWithActivity).sort();
    const lastActivityDate = sortedDates[sortedDates.length - 1] ?? null;

    return { current, longest, lastActivityDate };
}
