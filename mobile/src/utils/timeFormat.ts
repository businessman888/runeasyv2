export interface HMS {
    hours: number;
    minutes: number;
    seconds: number;
}

export function toSeconds(hms: HMS | null | undefined): number {
    if (!hms) return 0;
    return hms.hours * 3600 + hms.minutes * 60 + hms.seconds;
}

export function fromSeconds(totalSeconds: number): HMS {
    const safe = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return { hours, minutes, seconds };
}

export function formatHMS(hmsOrSeconds: HMS | number): string {
    const { hours, minutes, seconds } =
        typeof hmsOrSeconds === 'number' ? fromSeconds(hmsOrSeconds) : hmsOrSeconds;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
}
