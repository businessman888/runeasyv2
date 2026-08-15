import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../database';
import { toSaoPauloDateStr } from './wellness/helpers/streak.helper';
import { isEditableWorkout, isPlanEditable } from './helpers/plan-window.helper';

/**
 * A FUNDAÇÃO DA FASE 6 — a única porta de escrita para editar um plano ativo.
 *
 * ── POR QUE ESTE SERVIÇO É FINO ───────────────────────────────────────────────
 *
 * Ele não decide adaptação nenhuma. Quem decide volume, frequência ou pace são
 * a Fase 2 (`decideAdjustment`) e a Fase 3 (`VdotService`) — este serviço só
 * TRANSPORTA a decisão para o banco com as garantias que o PostgREST não dá:
 * atomicidade, versão e idempotência.
 *
 * O par TS↔SQL é deliberado:
 *   TypeScript  decide o patch (testável, é onde o motor determinístico vive)
 *   Postgres    lock · digest · fronteira · CAS · tudo-ou-nada · histórico
 *
 * ── O CICLO ───────────────────────────────────────────────────────────────────
 *
 *   1. loadEditableWorkouts()  → a janela editável, com o md5 de cada segmento
 *   2. getStateDigest()        → o token da versão
 *   3. <quem chama monta o patch em TS>
 *   4. apply()                 → aplica atômico, ou rejeita e não escreve nada
 *
 * O passo 1 não é conveniência: é o que faz a seleção do serviço e a seleção do
 * SQL serem A MESMA COISA. A mina 2 da reauditoria existia justamente porque
 * eram duas — o serviço calculava um conjunto fino e a RPC aplicava um
 * predicado próprio, mais amplo.
 */

export type AdaptationKind =
  | 'reduzir_frequencia'
  | 'reduzir_volume'
  | 'schedule_shift'
  | 'reprice';

export type AdaptationSource =
  | 'weekly_insight'
  | 'vdot_reestimate'
  | 'reactivation'
  | 'manual';

export type AdaptationFailure =
  | 'plan_not_editable'
  | 'plan_generating'
  | 'revision_conflict'
  | 'row_conflict'
  | 'empty_patch'
  | 'nothing_to_shift'
  | 'rpc_error';

/** Uma linha da janela editável, como o banco a entrega. */
export interface EditableWorkout {
  id: string;
  week_number: number | null;
  scheduled_date: string;
  status: string;
  type: string | null;
  title: string | null;
  distance_km: number | null;
  instructions_json: unknown;
  /**
   * `md5(instructions_json::text)` calculado PELO POSTGRES.
   *
   * Não tente reproduzi-lo em JavaScript: o Postgres normaliza jsonb (chaves
   * ordenadas, espaços removidos, numéricos canônicos) e `JSON.stringify` não
   * faz isso. Um md5 calculado no Node divergiria em silêncio e o
   * compare-and-swap nunca casaria.
   */
  instructions_md5: string;
}

/** O que uma adaptação pode escrever — as MESMAS 4 colunas da whitelist do SQL. */
export interface PatchSet {
  status?: 'pending' | 'skipped' | 'missed';
  scheduled_date?: string;
  distance_km?: number;
  instructions_json?: unknown[];
}

export interface PatchItem {
  workout_id: string;
  /** CAS por linha. `instructions_md5` é obrigatório se `set` toca segmentos. */
  expected: { status: string; instructions_md5?: string };
  set: PatchSet;
}

export interface AdaptationMeta {
  source: AdaptationSource;
  sourceInsightId?: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  metrics?: Record<string, unknown> | null;
  weekNumber?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

export interface AdaptationResult {
  applied: boolean;
  replayed?: boolean;
  reason?: AdaptationFailure | string;
  adaptationId?: string;
  digestAfter?: string;
  /** Presente no conflito: o estado real, para recalcular a preview. */
  currentDigest?: string;
  affected?: { workouts: number; briefings: number };
  /** Só no shift de agenda. */
  shifted?: number;
  reclaimed?: number;
  deltaDays?: number;
  detail?: string;
}

@Injectable()
export class PlanAdaptationService {
  private readonly logger = new Logger(PlanAdaptationService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /** "Hoje" em São Paulo — a âncora de toda fronteira desta fase. */
  todayStr(): string {
    return toSaoPauloDateStr(new Date().toISOString());
  }

  /**
   * A janela editável do plano: amanhã em diante, `pending`, não-prova.
   *
   * Vem do banco (`plan_editable_workouts`) e não de um `.select()` montado
   * aqui — ver o comentário de classe.
   */
  async loadEditableWorkouts(
    planId: string,
    todayStr = this.todayStr(),
  ): Promise<EditableWorkout[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('plan_editable_workouts', {
        p_plan_id: planId,
        p_today: todayStr,
      });

    if (error) {
      this.logger.error(
        `[Adaptation] plan_editable_workouts falhou (plano ${planId}): ${error.message}`,
      );
      throw error;
    }
    return (data ?? []) as EditableWorkout[];
  }

  /**
   * O digest do estado — o "número de versão" contra o qual o apply confere.
   *
   * String OPACA para o TypeScript, de propósito. Espelhar o cálculo aqui
   * plantaria uma classe inteira de bug de paridade (serialização de jsonb e
   * numeric), e uma divergência silenciosa produziria falso "sem conflito" —
   * exatamente o defeito que o digest existe para impedir.
   */
  async getStateDigest(
    planId: string,
    todayStr = this.todayStr(),
  ): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('plan_state_digest', { p_plan_id: planId, p_today: todayStr });

    if (error) {
      this.logger.error(
        `[Adaptation] plan_state_digest falhou (plano ${planId}): ${error.message}`,
      );
      throw error;
    }
    return (data as string | null) ?? null;
  }

  /**
   * A chave de idempotência — derivada, não recebida do cliente.
   *
   * Um REPLAY (timeout com resposta perdida, retry HTTP, segundo aparelho sobre
   * o mesmo estado) reproduz exatamente as mesmas entradas e, portanto, a mesma
   * chave: o apply devolve o resultado já gravado sem escrever de novo.
   *
   * Uma SEGUNDA ADAPTAÇÃO LEGÍTIMA parte de um estado diferente — a primeira
   * mudou o plano, logo mudou o digest — e gera chave diferente. Passa.
   *
   * Derivar em vez de exigir do mobile mantém a garantia mesmo para clientes
   * que não sabem que ela existe.
   */
  buildIdempotencyKey(
    planId: string,
    digestBefore: string,
    kind: AdaptationKind,
    workoutIds: string[],
  ): string {
    const canonical = [
      planId,
      digestBefore,
      kind,
      [...workoutIds].sort().join(','),
    ].join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Aplica uma adaptação. Atômico: ou tudo, ou nada.
   *
   * Conflito NÃO lança — devolve `{ applied: false, reason }` com o digest
   * atual, para quem chama recalcular a preview e pedir reconfirmação. Só erro
   * de infraestrutura vira exceção.
   */
  async apply(params: {
    userId: string;
    planId: string;
    kind: AdaptationKind;
    patch: PatchItem[];
    expectedDigest: string;
    meta: AdaptationMeta;
    todayStr?: string;
    invalidateBriefings?: boolean;
    /** Só a Fase 3 usa: whitelist `{ vdot_current }`. */
    planPatch?: Record<string, unknown> | null;
    /** Só a Fase 3 usa: a linha de `plan_vdot_history`, na mesma transação. */
    vdotHistory?: Record<string, unknown> | null;
  }): Promise<AdaptationResult> {
    const today = params.todayStr ?? this.todayStr();
    const idempotencyKey = this.buildIdempotencyKey(
      params.planId,
      params.expectedDigest,
      params.kind,
      params.patch.map((p) => p.workout_id),
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('apply_plan_adaptation', {
        p_user_id: params.userId,
        p_plan_id: params.planId,
        p_today: today,
        p_expected_digest: params.expectedDigest,
        p_idempotency_key: idempotencyKey,
        p_kind: params.kind,
        p_patch: params.patch,
        p_invalidate_briefings: params.invalidateBriefings ?? true,
        p_meta: this.serializeMeta(params.meta),
        p_plan_patch: params.planPatch ?? null,
        p_vdot_history: params.vdotHistory ?? null,
      });

    if (error) {
      this.logger.error(
        `[Adaptation] apply_plan_adaptation falhou (plano ${params.planId}, ${params.kind}): ${error.message}`,
      );
      return { applied: false, reason: 'rpc_error', detail: error.message };
    }

    const result = this.mapResult(data);
    this.logResult(params.planId, params.kind, result);
    return result;
  }

  /**
   * Desloca a agenda (re-âncora / adiar / repetir semana).
   *
   * Fronteira DIFERENTE da de edição, e isso é correto: a re-âncora precisa
   * tocar o passado (reclamar `missed`, trazer de volta a sessão perdida no
   * meio da semana repetida). A segurança não vem de um predicado — vem de os
   * IDs serem exatamente os que o serviço selecionou.
   */
  async applyScheduleShift(params: {
    userId: string;
    planId: string;
    workoutIds: string[];
    deltaDays: number;
    expectedDigest: string;
    meta: AdaptationMeta;
    insightId?: string | null;
    todayStr?: string;
  }): Promise<AdaptationResult> {
    const today = params.todayStr ?? this.todayStr();
    const idempotencyKey = this.buildIdempotencyKey(
      params.planId,
      params.expectedDigest,
      'schedule_shift',
      params.workoutIds,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('apply_schedule_shift', {
        p_user_id: params.userId,
        p_plan_id: params.planId,
        p_workout_ids: params.workoutIds,
        p_days: params.deltaDays,
        p_today: today,
        p_expected_digest: params.expectedDigest,
        p_idempotency_key: idempotencyKey,
        p_insight_id: params.insightId ?? null,
        p_meta: this.serializeMeta(params.meta),
      });

    if (error) {
      this.logger.error(
        `[Adaptation] apply_schedule_shift falhou (plano ${params.planId}): ${error.message}`,
      );
      return {
        applied: false,
        reason: 'rpc_error',
        detail: error.message,
        shifted: 0,
      };
    }

    const result = this.mapResult(data);
    this.logResult(params.planId, 'schedule_shift', result);
    return result;
  }

  /**
   * O plano está em estado editável? Gate de PRÉ-condição.
   *
   * A função SQL rejeita de qualquer forma — isto existe para a preview poder
   * dizer POR QUE, em vez de devolver uma lista vazia sem explicação.
   */
  async assertPlanEditable(
    planId: string,
    userId: string,
  ): Promise<{ editable: boolean; reason?: string }> {
    const client = this.supabaseService.getClient();

    const { data: plan } = await client
      .from('training_plans')
      .select('id, status, generation_status')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!plan) return { editable: false, reason: 'not_active' };

    const { count } = await client
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', planId);

    return isPlanEditable(plan, count ?? 0);
  }

  /**
   * Espelho em TypeScript da fronteira do SQL — para a preview explicar o que
   * ficou de fora ("este treino é hoje, e hoje é intocável").
   *
   * ⚠️ Não é a guarda. A guarda é o `WHERE` de `apply_plan_adaptation`. Existe
   * um teste de paridade entre as duas justamente porque duas cópias da mesma
   * regra é como a mina 2 nasceu.
   */
  explainExclusion(
    workout: Parameters<typeof isEditableWorkout>[0],
    ctx: { activePlanId: string; todayStr: string },
  ) {
    return isEditableWorkout(workout, ctx);
  }

  // ───────────────────────────────────────────────────────────────────────────

  private serializeMeta(meta: AdaptationMeta): Record<string, unknown> {
    return {
      source: meta.source,
      source_insight_id: meta.sourceInsightId ?? null,
      reason: meta.reason ?? null,
      reason_code: meta.reasonCode ?? null,
      metrics: meta.metrics ?? {},
      week_number: meta.weekNumber ?? null,
      window_start: meta.windowStart ?? null,
      window_end: meta.windowEnd ?? null,
    };
  }

  private mapResult(data: unknown): AdaptationResult {
    const row = (data ?? {}) as Record<string, unknown>;
    const affected = row.affected as
      | { workouts?: number; briefings?: number }
      | undefined;

    return {
      applied: row.applied === true,
      replayed: row.replayed === true,
      reason: (row.reason as string) ?? undefined,
      adaptationId: (row.adaptation_id as string) ?? undefined,
      digestAfter: (row.digest_after as string) ?? undefined,
      currentDigest: (row.current_digest as string) ?? undefined,
      affected: affected
        ? {
            workouts: Number(affected.workouts ?? 0),
            briefings: Number(affected.briefings ?? 0),
          }
        : undefined,
      shifted: row.shifted !== undefined ? Number(row.shifted) : undefined,
      reclaimed: row.reclaimed !== undefined ? Number(row.reclaimed) : undefined,
      deltaDays: row.delta_days !== undefined ? Number(row.delta_days) : undefined,
      detail: (row.detail as string) ?? undefined,
    };
  }

  private logResult(
    planId: string,
    kind: AdaptationKind,
    result: AdaptationResult,
  ): void {
    if (result.applied) {
      this.logger.log(
        `[Adaptation] ${kind} no plano ${planId}: ` +
          (result.replayed
            ? 'REPLAY (nada reescrito)'
            : `${result.affected?.workouts ?? result.shifted ?? 0} treino(s), ` +
              `${result.affected?.briefings ?? 0} briefing(s) invalidado(s)`),
      );
      return;
    }
    this.logger.warn(
      `[Adaptation] ${kind} no plano ${planId} NÃO aplicado: ${result.reason}` +
        (result.detail ? ` (${result.detail})` : ''),
    );
  }
}
