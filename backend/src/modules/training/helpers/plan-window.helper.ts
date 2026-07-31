import { toSaoPauloDateStr } from '../wellness/helpers/streak.helper';

/**
 * Fronteiras efetivas de um plano de treino, em datas locais de São Paulo.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * `training_plans` NÃO tem coluna de início nem de fim — só `created_at`. Até a
 * Fase 1A o fim do plano era calculado como `created_at + duration_weeks*7`, uma
 * data CONGELADA no momento da criação.
 *
 * O problema: `reanchorRemainingWorkoutsToToday` (chamado quando um Pro que
 * lapsou volta a pagar) empurra os treinos pendentes para frente via
 * `shift_pending_workouts`, que altera SOMENTE `workouts.scheduled_date`.
 * `training_plans.created_at` e `duration_weeks` ficam intactos. Resultado: o
 * plano era considerado "terminado" e ganhava retrospectiva ANTES de os treinos
 * deslocados acontecerem, e a janela de métricas excluía justamente o período
 * re-ancorado.
 *
 * A correção é derivar as fronteiras de `MIN/MAX(workouts.scheduled_date)`. É a
 * única fronteira que a re-âncora não consegue dessincronizar, porque é derivada
 * exatamente da coluna que ela move.
 *
 * ── FUSO ──────────────────────────────────────────────────────────────────────
 *
 * `scheduled_date` é `date` puro (sem fuso) — usado direto. `created_at` é
 * `timestamptz` e passa por `toSaoPauloDateStr`. O código antigo misturava as
 * duas pontas (`toISOString()` em UTC comparado com um "hoje" em São Paulo), o
 * que deslocava o gatilho em até um dia perto da meia-noite.
 */

/** Fim de plano assumido quando não há workouts nem `duration_weeks`. */
const DEFAULT_DURATION_WEEKS = 4;

export interface PlanWindow {
  /** YYYY-MM-DD (São Paulo), inclusivo. */
  startStr: string;
  /** YYYY-MM-DD (São Paulo), inclusivo. */
  endStr: string;
  /** Semanas cobertas pela janela — `ceil(dias / 7)`, mínimo 1. */
  weeks: number;
  /**
   * De onde as fronteiras vieram. `'workouts'` é o caminho normal e o único que
   * respeita a re-âncora; `'fallback'` só acontece em plano sem nenhum treino
   * (geração que falhou no meio).
   */
  source: 'workouts' | 'fallback';
}

/** Soma dias a uma data YYYY-MM-DD sem envolver fuso. */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Dias entre duas datas YYYY-MM-DD, inclusivo nas duas pontas. */
export function daysBetweenInclusive(startStr: string, endStr: string): number {
  const [ys, ms, ds] = startStr.split('-').map(Number);
  const [ye, me, de] = endStr.split('-').map(Number);
  const diff = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
  return Math.round(diff / 86_400_000) + 1;
}

/**
 * Deriva a janela efetiva do plano.
 *
 * Função PURA — o chamador traz as datas já lidas do banco. Isso a torna
 * testável sem mock e permite `calculateMetrics` reusar os workouts que ele já
 * carregou, sem query adicional.
 *
 * @param plan          `created_at` (ISO) e `duration_weeks` do plano.
 * @param scheduledDates `workouts.scheduled_date` do plano (YYYY-MM-DD). Vazio
 *                       quando o plano não tem treinos.
 */
export function derivePlanWindow(
  plan: { created_at: string; duration_weeks?: number | null },
  scheduledDates: string[],
): PlanWindow {
  const valid = scheduledDates.filter(
    (d): d is string => typeof d === 'string' && d.length >= 10,
  );

  if (valid.length > 0) {
    // Comparação lexicográfica basta: YYYY-MM-DD é ordenável como string.
    let startStr = valid[0];
    let endStr = valid[0];
    for (const d of valid) {
      if (d < startStr) startStr = d;
      if (d > endStr) endStr = d;
    }
    return {
      startStr,
      endStr,
      weeks: weeksIn(startStr, endStr),
      source: 'workouts',
    };
  }

  // Sem treinos: cai para a fórmula antiga, agora com o fuso certo. `- 1` porque
  // a janela é inclusiva nas duas pontas (4 semanas = 28 dias = start..start+27).
  const startStr = toSaoPauloDateStr(plan.created_at);
  const weeks =
    plan.duration_weeks && plan.duration_weeks > 0
      ? plan.duration_weeks
      : DEFAULT_DURATION_WEEKS;
  const endStr = addDaysStr(startStr, weeks * 7 - 1);

  return { startStr, endStr, weeks, source: 'fallback' };
}

/**
 * O plano já terminou em relação a `todayStr`?
 *
 * `endStr` é inclusivo — o plano só está encerrado no dia SEGUINTE ao último
 * treino. Enquanto houver treino agendado para hoje ou para o futuro, o ciclo
 * está em andamento e a retrospectiva não deve disparar.
 */
export function isPlanFinished(window: PlanWindow, todayStr: string): boolean {
  return window.endStr < todayStr;
}

function weeksIn(startStr: string, endStr: string): number {
  const days = daysBetweenInclusive(startStr, endStr);
  return Math.max(1, Math.ceil(days / 7));
}

/** Uma corrida executada, na forma mínima que o recorde precisa. */
export interface RunRow {
  /** ISO timestamp (UTC) — `activities.start_date`. */
  start_date: string;
  /** METROS — `activities.distance`. */
  distance: number | string | null;
}

export interface LongestRun {
  /** Km, 2 casas. `0` quando não houve corrida. */
  km: number;
  /** Dia em São Paulo (YYYY-MM-DD). `null` quando não houve corrida. */
  date: string | null;
}

/**
 * Maior corrida ÚNICA de um conjunto — o clímax da retrospectiva.
 *
 * Escopo é responsabilidade do CHAMADOR: passe todas as corridas da janela
 * (plano + livres). Recorde é conquista pessoal, não medida de aderência —
 * quem bateu o recorde numa corrida livre bateu o recorde do mesmo jeito. Isso
 * o diferencia de `plan_distance_completed_km`, que é plano-only de propósito.
 *
 * Em empate, vence a MAIS ANTIGA: foi nela que a marca foi atingida primeiro.
 */
export function findLongestRun(runs: RunRow[]): LongestRun {
  let bestMeters = 0;
  let bestIso: string | null = null;

  for (const r of runs) {
    const meters = Number(r.distance) || 0;
    if (meters <= 0) continue;
    if (
      meters > bestMeters ||
      (meters === bestMeters && bestIso !== null && r.start_date < bestIso)
    ) {
      bestMeters = meters;
      bestIso = r.start_date;
    }
  }

  if (bestMeters <= 0 || bestIso === null) return { km: 0, date: null };

  return {
    km: Math.round((bestMeters / 1000) * 100) / 100,
    date: toSaoPauloDateStr(bestIso),
  };
}
