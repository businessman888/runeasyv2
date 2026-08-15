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
 * O plano — ou UMA SEMANA dele — já terminou em relação a `todayStr`?
 *
 * `endStr` é inclusivo, então o período só está encerrado no dia SEGUINTE ao
 * último treino. Enquanto houver treino agendado para hoje ou para o futuro, o
 * ciclo está em andamento e a retrospectiva não deve disparar.
 *
 * O parâmetro é estrutural (`{ endStr }`) de propósito: serve tanto para
 * `PlanWindow` (plano inteiro, retrospectiva) quanto para `PlanWeekWindow`
 * (semana, insight semanal). É literalmente a mesma pergunta em outra escala.
 */
export function isPlanFinished(
  window: { endStr: string },
  todayStr: string,
): boolean {
  return window.endStr < todayStr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fronteira de EDIÇÃO (Fase 6) — a única autoritativa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ── DUAS FRONTEIRAS, E ISSO É DE PROPÓSITO ────────────────────────────────────
 *
 * O repo tem duas perguntas diferentes sobre passado/futuro, e confundi-las
 * quebraria uma das duas:
 *
 *   FRONTEIRA DE EDIÇÃO (aqui)      — "o que a Fase 6 e a Fase 3 podem MUDAR?"
 *                                     amanhã em diante, pending, plano ativo.
 *   FRONTEIRA DE PROGRESSO (re-âncora) — "até onde o atleta já andou?"
 *                                     precisa tocar o PASSADO (reclamar missed,
 *                                     repetir semana). Vive em
 *                                     `reanchorRemainingWorkoutsToToday`.
 *
 * O defeito que a reauditoria da Fase 6 encontrou não era a existência das
 * duas: era o SQL não reproduzir nenhuma delas. `shift_pending_workouts`
 * deslocava TODOS os pendentes do plano, ignorando o conjunto que o serviço
 * tinha calculado. Isso é resolvido passando IDs, não unificando as fronteiras.
 *
 * ── POR QUE HOJE INTEIRO É CONGELADO ──────────────────────────────────────────
 *
 * O backend NÃO conhece o estado "em execução": não existe `started`/
 * `in_progress` em `workouts`, e o cursor da corrida vive em MMKV no device. A
 * representação segura é NÃO representar — um treino que o corredor está
 * correndo agora está agendado para HOJE, e hoje não é editável. Isso torna o
 * estado local irrelevante para a segurança da edição, sem exigir um estado
 * novo que pode ficar preso quando o app morre no meio da corrida.
 *
 * Não é fronteira nova: é a que a Fase 3 já roda em produção
 * (`vdot.service.ts` → `status='pending'` + `scheduled_date > hoje`). Aqui ela
 * vira helper compartilhado, para F3 e F6 não terem duas cópias que divergem.
 */

/** Primeiro dia que uma adaptação pode tocar. Hoje é sempre intocável. */
export function editableFrom(todayStr: string): string {
  return addDaysStr(todayStr, 1);
}

export type EditBlockReason =
  | 'not_in_active_plan'
  | 'not_pending'
  | 'today_or_past'
  | 'race_day';

export interface EditableWorkoutRow {
  plan_id?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  is_race_day?: boolean | null;
}

export interface EditableCheck {
  editable: boolean;
  reason?: EditBlockReason;
}

/**
 * Este treino pode ser alterado por uma adaptação?
 *
 * ⚠️ Esta função é a fronteira do lado do TypeScript. A MESMA fronteira é
 * reafirmada no `WHERE` de `apply_plan_adaptation` — duplicação deliberada,
 * defesa em profundidade. Foi exatamente a AUSÊNCIA dessa segunda camada que
 * deixou `shift_pending_workouts` divergir do serviço sem ninguém perceber.
 * Há teste de paridade entre as duas.
 */
export function isEditableWorkout(
  w: EditableWorkoutRow,
  ctx: { activePlanId: string; todayStr: string },
): EditableCheck {
  // Manual/livre (`plan_id` nulo) e treinos de ciclos encerrados ficam fora de
  // forma inequívoca — nunca por heurística de data.
  if (!w.plan_id || w.plan_id !== ctx.activePlanId) {
    return { editable: false, reason: 'not_in_active_plan' };
  }
  if (w.status !== 'pending') {
    return { editable: false, reason: 'not_pending' };
  }
  // Comparação lexicográfica de YYYY-MM-DD: sem `Date`, sem fuso. `todayStr`
  // vem de `getSaoPauloToday()` — nunca do relógio do processo (UTC no Railway).
  if (!w.scheduled_date || w.scheduled_date < editableFrom(ctx.todayStr)) {
    return { editable: false, reason: 'today_or_past' };
  }
  // Prova é invariante: a adaptação trabalha ao redor, nunca move nem esvazia.
  if (w.is_race_day === true) {
    return { editable: false, reason: 'race_day' };
  }
  return { editable: true };
}

export type PlanBlockReason =
  | 'not_active'
  | 'generating'
  | 'generation_failed'
  | 'no_workouts';

export interface PlanEditableRow {
  status?: string | null;
  generation_status?: string | null;
}

export interface PlanEditableCheck {
  editable: boolean;
  reason?: PlanBlockReason;
}

/**
 * O PLANO está em estado editável?
 *
 * Existe porque `generation_status='complete'` nunca foi garantia de que os
 * workouts terminaram de ser materializados: até a Fase 6.1 ele era gravado
 * ANTES dos inserts em lote. A ordem foi corrigida, mas planos criados antes
 * disso podem estar `complete` com zero treinos — daí `no_workouts` continuar
 * sendo checado em vez de presumido.
 *
 * @param workoutCount treinos já materializados do plano.
 */
export function isPlanEditable(
  plan: PlanEditableRow,
  workoutCount: number,
): PlanEditableCheck {
  if (plan.status !== 'active') {
    return { editable: false, reason: 'not_active' };
  }
  if (plan.generation_status === 'failed') {
    return { editable: false, reason: 'generation_failed' };
  }
  if (
    plan.generation_status === 'generating' ||
    plan.generation_status === 'partial'
  ) {
    return { editable: false, reason: 'generating' };
  }
  if (workoutCount <= 0) {
    return { editable: false, reason: 'no_workouts' };
  }
  return { editable: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Semanas do plano
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fronteiras de UMA semana do plano.
 *
 * Mesma ideia de `PlanWindow`, uma escala abaixo: a semana N vai do primeiro ao
 * último `scheduled_date` dos treinos com `week_number = N`. E pelo mesmo
 * motivo — é a única fronteira que `shift_pending_workouts` não consegue
 * dessincronizar, porque é derivada exatamente da coluna que ela move.
 */
export interface PlanWeekWindow {
  weekNumber: number;
  /** YYYY-MM-DD, inclusivo. */
  startStr: string;
  /** YYYY-MM-DD, inclusivo. */
  endStr: string;
  /**
   * `'workouts'` = derivada de treinos reais, a única fronteira mensurável.
   * `'fallback'` = semana declarada em `duration_weeks` que ainda não tem treino
   * hidratado; existe só para a UI renderizar um período coerente.
   *
   * ⚠️ QUEM MEDE ALGO DEVE IGNORAR `'fallback'`: uma semana sem treino não tem
   * aderência, nem volume, nem zona — gerar insight para ela produziria uma
   * linha de zeros que não significa nada.
   */
  source: 'workouts' | 'fallback';
}

interface WeekRow {
  week_number?: number | null;
  scheduled_date?: string | null;
}

/**
 * Deriva as fronteiras de TODAS as semanas de um plano.
 *
 * Função PURA — o chamador traz os treinos já lidos. Isso a torna testável sem
 * mock e permite ao insight semanal reusar o array de workouts que ele já
 * carregou, sem query por semana.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * Esta lógica vivia enterrada dentro de `getPlanOverview`, um método de 200+
 * linhas que também monta DTOs de UI — inalcançável de fora. O insight semanal
 * precisa exatamente das mesmas fronteiras, e duas derivações independentes
 * acabariam discordando (a tela de Metas destacando uma semana e o insight
 * medindo outra).
 *
 * A extração também conserta um bug de fuso: a versão antiga comparava
 * `new Date(startDate + 'T00:00:00')` — interpretado na TZ do PROCESSO, que em
 * Railway é UTC — com um "hoje" de São Paulo. Aqui tudo é string `YYYY-MM-DD`,
 * que é ordenável lexicograficamente e não tem fuso.
 *
 * @param workouts  Treinos do plano (`week_number` + `scheduled_date`).
 * @param fallback  `created_at` do plano e `duration_weeks`, para completar as
 *                  semanas declaradas que ainda não têm treino. Omitir quando
 *                  só interessam as semanas mensuráveis.
 */
export function derivePlanWeeks(
  workouts: WeekRow[],
  fallback?: { createdAt: string; totalWeeks: number },
): PlanWeekWindow[] {
  const byWeek = new Map<number, { min: string; max: string }>();

  for (const w of workouts) {
    const wn = w.week_number;
    const date = w.scheduled_date;
    if (typeof wn !== 'number' || !Number.isFinite(wn)) continue;
    if (typeof date !== 'string' || date.length < 10) continue;

    const current = byWeek.get(wn);
    if (!current) {
      byWeek.set(wn, { min: date, max: date });
      continue;
    }
    // Comparação lexicográfica basta: YYYY-MM-DD é ordenável como string.
    if (date < current.min) current.min = date;
    if (date > current.max) current.max = date;
  }

  const weeks: PlanWeekWindow[] = [];
  for (const [weekNumber, range] of byWeek) {
    weeks.push({
      weekNumber,
      startStr: range.min,
      endStr: range.max,
      source: 'workouts',
    });
  }

  // Semanas declaradas em `duration_weeks` que não têm nenhum treino ainda
  // (geração parcial, ou plano que falhou no meio). Só a UI as consome.
  if (fallback && fallback.totalWeeks > 0) {
    const planStartStr = toSaoPauloDateStr(fallback.createdAt);
    for (let wn = 1; wn <= fallback.totalWeeks; wn++) {
      if (byWeek.has(wn)) continue;
      const startStr = addDaysStr(planStartStr, (wn - 1) * 7);
      weeks.push({
        weekNumber: wn,
        startStr,
        endStr: addDaysStr(startStr, 6),
        source: 'fallback',
      });
    }
  }

  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
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
