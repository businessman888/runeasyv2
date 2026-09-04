/**
 * Escolha do treino que representa o dia, para o prompt de prontidão.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * Não há `UNIQUE (plan_id, scheduled_date)` em nenhum ambiente — está medido em
 * produção e documentado em `training/helpers/day-swap.helper.ts`. Dois treinos
 * pendentes na mesma data são um estado possível, e o backlog registra o
 * incidente. O readiness precisa de UM treino para descrever o dia, então a
 * escolha tem de ser explícita e determinística em vez de "o primeiro que o
 * PostgREST devolver" — que varia entre execuções e tornaria o veredito
 * irreprodutível.
 *
 * ── FUNÇÃO PURA, DE PROPÓSITO ─────────────────────────────────────────────────
 *
 * O chamador traz as linhas já lidas do banco. Assim a regra de desempate é
 * testável sem mock de Supabase — mesmo molde de `plan-window.helper.ts`, que a
 * Fase 6 usa para as fronteiras de edição.
 */

/** O subconjunto de `public.workouts` que o readiness lê. */
export interface PlannedWorkoutRow {
  id: string;
  plan_id: string | null;
  type: string | null;
  /** NULL na esmagadora maioria: o insert em lote do plano não grava `title`. */
  title: string | null;
  objective: string | null;
  distance_km: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  is_race_day: boolean | null;
}

/**
 * Dia de prova. Checa as DUAS marcas porque o repo é inconsistente: o insert
 * grava `is_race_day: true` e `type: 'race_day'` juntos, mas partes do código
 * checam só uma delas.
 */
export function isRaceDay(w: Pick<PlannedWorkoutRow, 'type' | 'is_race_day'>) {
  return w.is_race_day === true || w.type === 'race_day';
}

/**
 * O treino que representa a data. `undefined` quando não há nenhum.
 *
 * Ordem de precedência — pensada para ser explicável ao corredor, não esperta:
 *
 * 1. **Dia de prova primeiro.** É o evento invariante do plano; se ele está na
 *    data, é ele que descreve o dia.
 * 2. **Treino de plano antes de manual.** O treino do plano é o objeto sobre o
 *    qual a IA sugere ajuste ("reduza o volume"); um treino avulso que o
 *    corredor criou não é o alvo do ajuste.
 * 3. **Mais cedo primeiro** (`scheduled_time` ascendente, `null` por último —
 *    sem horário é menos específico que com horário).
 * 4. **`id` ascendente** como desempate final, para a saída não depender da
 *    ordem em que as linhas chegaram.
 *
 * Não ordena por intensidade nem por distância de propósito: "a mais puxada"
 * parece razoável e é indefensável — muda o veredito por um critério que o
 * corredor não consegue prever.
 */
export function pickPrimaryWorkout(
  rows: PlannedWorkoutRow[],
): PlannedWorkoutRow | undefined {
  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0];

  return [...rows].sort(compareWorkouts)[0];
}

function compareWorkouts(a: PlannedWorkoutRow, b: PlannedWorkoutRow): number {
  const race = Number(isRaceDay(b)) - Number(isRaceDay(a));
  if (race !== 0) return race;

  const planned = Number(b.plan_id !== null) - Number(a.plan_id !== null);
  if (planned !== 0) return planned;

  // `scheduled_time` é 'HH:MM:SS' — comparação lexicográfica basta, sem Date.
  const timeA = a.scheduled_time ?? '￿';
  const timeB = b.scheduled_time ?? '￿';
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
