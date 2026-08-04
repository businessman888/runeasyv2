/** Formatadores da tela de insight semanal. Puros e sem dependência de tema. */

/** Segundos/km → "m:ss". A unidade canônica do repo é segundos/km. */
export function formatPace(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Número com vírgula decimal (pt-BR) e sem casa quando é inteiro. */
export function formatKm(v: number | null | undefined): string {
    const n = Number(v ?? 0);
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

export function formatPercent(v: number | null | undefined): string {
    if (v == null) return '—';
    return `${Math.round(v)}%`;
}

/**
 * "8 a 14 de jun" — a janela da semana, sem repetir o mês quando é o mesmo.
 * Recebe datas YYYY-MM-DD (sem fuso) e NÃO usa `new Date`, que as
 * interpretaria em UTC e poderia recuar um dia.
 */
const MONTHS = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export function formatWeekRange(start: string, end: string): string {
    const [, sm, sd] = start.split('-');
    const [, em, ed] = end.split('-');
    const sMonth = MONTHS[Number(sm) - 1] ?? '';
    const eMonth = MONTHS[Number(em) - 1] ?? '';
    const sDay = Number(sd);
    const eDay = Number(ed);

    if (sm === em) return `${sDay} a ${eDay} de ${eMonth}`;
    return `${sDay} de ${sMonth} a ${eDay} de ${eMonth}`;
}

/**
 * Descreve o desvio de intensidade em linguagem de treinador.
 * `avgDeltaSec` negativo = correu MAIS RÁPIDO que o prescrito.
 */
export function describeIntensityDelta(avgDeltaSec: number): string {
    const abs = Math.abs(Math.round(avgDeltaSec));
    if (abs < 5) return 'no ritmo prescrito';
    return avgDeltaSec < 0
        ? `${abs}s/km mais rápido que o alvo`
        : `${abs}s/km mais lento que o alvo`;
}
