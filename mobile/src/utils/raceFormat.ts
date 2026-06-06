import type { Race } from '../types/races.types';

const MONTHS_PT = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTHS_PT_LONG = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Parses a 'YYYY-MM-DD' date as a local Date (no timezone surprises). */
export function parseRaceDate(raceDate: string): Date {
    return new Date(`${raceDate}T00:00:00`);
}

/** Short pt-BR date, e.g. "31 Dez 2026". */
export function formatRaceDateShort(raceDate: string): string {
    const d = parseRaceDate(raceDate);
    if (Number.isNaN(d.getTime())) return raceDate;
    return `${d.getDate()} ${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Long pt-BR date, e.g. "31 de dezembro de 2026". */
export function formatRaceDateLong(raceDate: string): string {
    const d = parseRaceDate(raceDate);
    if (Number.isNaN(d.getTime())) return raceDate;
    return `${d.getDate()} de ${MONTHS_PT_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Distances summary, e.g. "7.5km, 15km". Prefers labels, falls back to numbers. */
export function formatDistances(race: Pick<Race, 'distances' | 'distances_labels'>): string {
    if (race.distances_labels?.length) return race.distances_labels.join(', ');
    if (race.distances?.length) return race.distances.map((d) => `${d}km`).join(', ');
    return '';
}

/** Whole weeks from today to the race date (min 0). */
export function weeksUntilRace(raceDate: string): number {
    const race = parseRaceDate(raceDate);
    const today = new Date();
    const days = Math.ceil((race.getTime() - today.getTime()) / 86_400_000);
    return Math.max(Math.ceil(days / 7), 0);
}

/** Maps a race level enum to a pt-BR label. */
export function raceLevelLabel(level: Race['level']): string {
    switch (level) {
        case 'beginner': return 'iniciante';
        case 'intermediate': return 'intermediário';
        case 'advanced': return 'avançado';
        default: return 'todos os níveis';
    }
}
