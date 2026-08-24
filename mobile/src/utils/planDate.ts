/**
 * Datas do PLANO em São Paulo (UTC−3), sempre como string `YYYY-MM-DD`.
 *
 * ── POR QUE STRING, E NUNCA `Date` ───────────────────────────────────────────
 *
 * Todo o backend agenda e compara treinos por `YYYY-MM-DD` no fuso de São Paulo
 * (`SAO_PAULO_OFFSET_HOURS = -3`). Comparar `Date` no cliente reintroduz o fuso
 * do aparelho: um corredor em Lisboa às 02:00 veria "amanhã" antes do plano, e a
 * fronteira "hoje é intocável" da Fase 6 mudaria de lugar conforme quem olha.
 * Comparando string com string (`<=`, `>=`), a ordem lexicográfica é a ordem
 * cronológica e o resultado é o mesmo em qualquer aparelho.
 *
 * Extraído de `WeekDetailScreen`, onde vivia como função local — a Fase 6.4
 * precisa da mesma conta para decidir se a orientação de esforço ainda vale.
 * O corpo é o mesmo, para não mudar comportamento junto com o endereço.
 */

const SAO_PAULO_OFFSET_HOURS = -3;
const MS_PER_DAY = 86_400_000;

/** Hoje em São Paulo, como `YYYY-MM-DD`. */
export function getTodayStrSaoPaulo(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const utc = now.getTime() + offsetMs;
    const sp = new Date(utc + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000);
    const y = sp.getFullYear();
    const m = (sp.getMonth() + 1).toString().padStart(2, '0');
    const d = sp.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Soma dias a um `YYYY-MM-DD` sem passar por fuso — espelha o `shiftDays` do
 * backend (`vdot.service.ts`). `Date.UTC` é usado só como calendário: entra
 * string, sai string, e nenhum horário local participa da conta.
 *
 * Devolve `null` para entrada malformada, para o chamador poder tratar dado
 * velho ou corrompido sem virar `NaN-NaN-NaN` na tela.
 */
export function addDaysStr(dateStr: string, days: number): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? '');
    if (!match) return null;
    const [, y, m, d] = match;
    const base = Date.UTC(Number(y), Number(m) - 1, Number(d)) + days * MS_PER_DAY;
    if (!Number.isFinite(base)) return null;
    return new Date(base).toISOString().slice(0, 10);
}
