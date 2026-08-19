import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { VolumePlannerService } from '../../common/volume-planner/volume-planner.service';
import {
  PlanAdaptationService,
  EditableWorkout,
} from './plan-adaptation.service';
import {
  isEditableWorkout,
  derivePlanWeeks,
} from './helpers/plan-window.helper';
import {
  computeRelief,
  totalsOfSegments,
  ReliefLevel,
  ReliefResult,
  RELIEF_TARGET_PCT,
} from './helpers/volume-relief.helper';
import {
  computeWeekRelief,
  WeekReliefChange,
  WeekReliefResult,
} from './helpers/week-relief.helper';

/**
 * Fase 6.2 — ALIVIAR UM TREINO. A primeira feature sobre a fundação.
 *
 * ── O QUE ESTE SERVIÇO É ──────────────────────────────────────────────────────
 *
 * A junção entre uma decisão pura (`computeRelief`, em TypeScript, testável sem
 * banco) e a primitiva atômica (`apply_plan_adaptation`, em Postgres). Ele não
 * calcula volume e não fala com o banco a não ser pela fundação — o molde é o
 * mesmo que `VdotService.repriceThroughFoundation` usa desde a 6.1.
 *
 * `PlanAdaptationService` continua transporte GENÉRICO: nenhuma noção de volume
 * entra lá. Se a 6.3 (semana inteira) e a 6.4 chegarem, elas repetem este
 * formato em vez de engordar a fundação.
 *
 * ── PREVIEW E APPLY LEEM O MESMO ESTADO ───────────────────────────────────────
 *
 * As duas rotas percorrem exatamente os mesmos passos — carregar a janela
 * editável, achar o alvo, calcular. A diferença é só o que fazem no fim. Isso é
 * deliberado: o que o corredor VIU e o que o servidor APLICA saem do mesmo
 * código, não de duas implementações que precisam concordar por disciplina.
 *
 * ── CONFLITO É RESULTADO, NUNCA EXCEÇÃO ───────────────────────────────────────
 *
 * Toda recusa sai como `{ applied: false, reason }` com HTTP 200. Um 409 seria
 * traduzido pela camada de rede do app em "verifique sua conexão" — foi
 * exatamente esse o defeito que a reauditoria encontrou no caminho da Fase 2.
 * Conflito não é falha: é "o mundo mudou, olhe de novo".
 */

export type ReliefRefusal =
  | 'not_found'
  | 'no_active_plan'
  | 'not_in_active_plan'
  | 'not_pending'
  | 'today_or_past'
  | 'race_day'
  | 'taper_week'
  | 'nothing_to_reduce'
  | 'plan_not_editable';

/** Mensagens por motivo — "não pode" sem explicação vira ticket de suporte. */
export const RELIEF_REFUSAL_MESSAGES: Record<ReliefRefusal, string> = {
  not_found: 'Treino não encontrado.',
  no_active_plan: 'Você não tem um plano ativo.',
  not_in_active_plan:
    'Este treino não pertence ao plano ativo e não pode ser alterado.',
  not_pending: 'Este treino já foi concluído, pulado ou perdido.',
  today_or_past:
    'Só é possível aliviar treinos a partir de amanhã — o dia de hoje já está em curso.',
  race_day: 'O dia da prova não pode ser alterado.',
  taper_week:
    'Esta semana é de polimento, quando o volume já é reduzido de propósito para você chegar inteiro na prova.',
  nothing_to_reduce:
    'Este treino já está no volume mínimo — não há o que aliviar.',
  plan_not_editable: 'Seu plano ainda está sendo preparado. Tente em instantes.',
};

export interface ReliefOption {
  level: ReliefLevel;
  /** O alvo nominal (20 / 35). Para rotular, nunca para prometer. */
  targetPct: number;
  /** A redução REAL — pode ser menor, quando os pisos limitam. */
  achievedPct: number;
  distanceKm: number;
  durationSeconds: number;
}

export interface ReliefPreview {
  available: true;
  workoutId: string;
  /** O token de versão. O apply DEVOLVE este valor, não um recém-buscado. */
  digest: string;
  current: {
    title: string | null;
    type: string | null;
    scheduledDate: string;
    distanceKm: number;
    durationSeconds: number;
  };
  options: ReliefOption[];
}

export interface ReliefUnavailable {
  available: false;
  reason: ReliefRefusal;
  message: string;
}

export interface ReliefApplied {
  applied: true;
  replayed: boolean;
  adaptationId?: string;
  distanceKm: number;
  achievedPct: number;
  briefingsInvalidated: number;
}

export interface ReliefRejected {
  applied: false;
  reason: string;
  message: string;
  /**
   * A preview RECALCULADA, quando o estado mudou. É ela que o app mostra para
   * pedir reconfirmação — o digest do conflito sozinho não bastaria, porque o
   * próprio alvo pode ter mudado (a F3 reprecificou, alguém concluiu o treino).
   */
  preview?: ReliefPreview | ReliefUnavailable;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 6.3 — a SEMANA
// ─────────────────────────────────────────────────────────────────────────────

export type WeekReliefRefusalReason =
  | ReliefRefusal
  | 'no_next_week'
  | 'week_time_based'
  | 'already_applied'
  // Vindas da política pura (`WeekReliefRefusal`), repassadas sem tradução.
  | 'no_workouts';

export interface WeekReliefOption {
  level: ReliefLevel;
  targetPct: number;
  achievedPct: number;
  weekTotalKmAfter: number;
  changes: Array<{
    workoutId: string;
    title: string | null;
    type: string | null;
    scheduledDate: string;
    isProtected: boolean;
    beforeKm: number;
    afterKm: number;
    changed: boolean;
  }>;
}

export interface WeekReliefPreview {
  available: true;
  weekNumber: number;
  windowStart: string;
  windowEnd: string;
  weekTotalKm: number;
  workoutCount: number;
  digest: string;
  options: WeekReliefOption[];
}

export interface WeekReliefUnavailable {
  available: false;
  reason: WeekReliefRefusalReason;
  message: string;
}

export interface WeekReliefApplied {
  applied: true;
  replayed: boolean;
  adaptationId?: string;
  weekNumber: number;
  achievedPct: number;
  weekTotalKmAfter: number;
  workoutsChanged: number;
  briefingsInvalidated: number;
}

export interface WeekReliefRejected {
  applied: false;
  reason: string;
  message: string;
  preview?: WeekReliefPreview | WeekReliefUnavailable;
}

const WEEK_REFUSAL_MESSAGES: Record<string, string> = {
  no_next_week:
    'Não há uma próxima semana no seu plano para aliviar — você já está na reta final.',
  week_time_based:
    'Esta semana é do protocolo de caminhada/corrida, medido em tempo. O alívio de volume ainda não cobre esse formato.',
  already_applied: 'Você já aliviou esta semana.',
  nothing_to_reduce:
    'Não há o que aliviar nesta semana — os treinos que poderiam ceder já estão no volume mínimo.',
  no_workouts: 'A próxima semana ainda não tem treinos.',
};

@Injectable()
export class VolumeReliefService {
  private readonly logger = new Logger(VolumeReliefService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly planAdaptation: PlanAdaptationService,
    private readonly volumePlanner: VolumePlannerService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Preview
  // ───────────────────────────────────────────────────────────────────────────

  async preview(
    userId: string,
    workoutId: string,
  ): Promise<ReliefPreview | ReliefUnavailable> {
    const ctx = await this.resolve(userId, workoutId);
    if ('reason' in ctx) return this.unavailable(ctx.reason);

    const options: ReliefOption[] = [];
    for (const level of ['light', 'strong'] as ReliefLevel[]) {
      const r = computeRelief(ctx.target.instructions_json, level);
      if (!r?.changed) continue;
      options.push(this.toOption(level, r));
    }

    if (options.length === 0) return this.unavailable('nothing_to_reduce');

    // O digest vem POR ÚLTIMO, depois de ler o alvo: ele precisa descrever o
    // mesmo estado que a preview está mostrando.
    const digest = await this.planAdaptation.getStateDigest(
      ctx.planId,
      ctx.todayStr,
    );
    if (!digest) return this.unavailable('plan_not_editable');

    const totals = totalsOfSegments(ctx.target.instructions_json);

    return {
      available: true,
      workoutId,
      digest,
      current: {
        title: ctx.target.title,
        type: ctx.target.type,
        scheduledDate: ctx.target.scheduled_date,
        distanceKm: totals.km,
        durationSeconds: totals.seconds,
      },
      options,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Apply
  // ───────────────────────────────────────────────────────────────────────────

  async apply(
    userId: string,
    workoutId: string,
    level: ReliefLevel,
    expectedDigest: string,
  ): Promise<ReliefApplied | ReliefRejected> {
    const ctx = await this.resolve(userId, workoutId);
    if ('reason' in ctx) return this.rejected(ctx.reason);

    const relief = computeRelief(ctx.target.instructions_json, level);
    if (!relief?.changed) return this.rejected('nothing_to_reduce');

    const result = await this.planAdaptation.apply({
      userId,
      planId: ctx.planId,
      kind: 'reduzir_volume',
      todayStr: ctx.todayStr,
      expectedDigest,
      patch: [
        {
          workout_id: workoutId,
          // O md5 vem de `plan_editable_workouts` — calculado PELO POSTGRES.
          // É ele que fecha a corrida fina com a Fase 3 sobre o mesmo array.
          expected: {
            status: 'pending',
            instructions_md5: ctx.target.instructions_md5,
          },
          set: {
            distance_km: relief.distanceKm,
            instructions_json: relief.segments,
          },
        },
      ],
      meta: {
        source: 'manual',
        reason: `aliviar volume (${RELIEF_TARGET_PCT[level]}%)`,
        reasonCode: `relief_${level}`,
        weekNumber: ctx.target.week_number,
        windowStart: ctx.target.scheduled_date,
        windowEnd: ctx.target.scheduled_date,
        metrics: {
          before_km: totalsOfSegments(ctx.target.instructions_json).km,
          after_km: relief.distanceKm,
          achieved_pct: relief.achievedPct,
        },
      },
    });

    if (result.applied) {
      this.logger.log(
        `[Relief] treino ${workoutId} aliviado ${relief.achievedPct}% ` +
          `(${level})${result.replayed ? ' [replay]' : ''}`,
      );
      return {
        applied: true,
        replayed: result.replayed === true,
        adaptationId: result.adaptationId,
        distanceKm: relief.distanceKm,
        achievedPct: relief.achievedPct,
        briefingsInvalidated: result.affected?.briefings ?? 0,
      };
    }

    // ── Conflito: recalcula a preview para o corredor reconfirmar ────────────
    //
    // Recarrega TUDO, não só o digest. Entre a preview e agora, o alvo pode ter
    // mudado de volume (F3) ou saído da janela (concluído). Devolver o digest
    // novo com a preview velha convidaria a aplicar sobre um treino que não é
    // mais o que foi mostrado — o oposto do que a concorrência otimista existe
    // para garantir.
    const isConflict =
      result.reason === 'revision_conflict' || result.reason === 'row_conflict';

    return {
      applied: false,
      reason: result.reason ?? 'unknown',
      message: isConflict
        ? 'Seu plano mudou desde que você abriu esta tela. Veja a nova sugestão.'
        : 'Não foi possível aliviar este treino agora.',
      preview: isConflict ? await this.preview(userId, workoutId) : undefined,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Fase 6.3 — a SEMANA
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Preview do alívio da SEMANA SEGUINTE.
   *
   * ── POR QUE A SEGUINTE, E NÃO A CORRENTE ──────────────────────────────────
   *
   * A semana corrente pode estar meio no passado — hoje é quinta, segunda e
   * terça já foram. Aliviar "a semana" nesse caso mexeria em dois treinos e
   * anunciaria um percentual sobre um total que o corredor não reconhece.
   * A semana seguinte está inteira no futuro: o que a preview mostra é o que
   * existe.
   *
   * O app NÃO escolhe a semana — o backend resolve. Um cliente não tem como
   * pedir a semana errada.
   */
  async previewWeek(
    userId: string,
    insightId?: string | null,
  ): Promise<WeekReliefPreview | WeekReliefUnavailable> {
    const ctx = await this.resolveWeek(userId, insightId);
    if ('reason' in ctx) return this.weekUnavailable(ctx.reason);

    const options: WeekReliefOption[] = [];
    let lastRefusal: WeekReliefRefusalReason | null = null;

    for (const level of ['light', 'strong'] as ReliefLevel[]) {
      const out = computeWeekRelief(ctx.inputs, level);
      if ('reason' in out) {
        lastRefusal = out.reason;
        continue;
      }
      if (!out.result.changed) continue;
      options.push(this.toWeekOption(out.result));
    }

    if (options.length === 0) {
      return this.weekUnavailable(lastRefusal ?? 'nothing_to_reduce');
    }

    // O digest por ÚLTIMO: ele tem de descrever o mesmo estado que a preview
    // está mostrando.
    const digest = await this.planAdaptation.getStateDigest(
      ctx.planId,
      ctx.todayStr,
    );
    if (!digest) return this.weekUnavailable('plan_not_editable');

    return {
      available: true,
      weekNumber: ctx.weekNumber,
      windowStart: ctx.windowStart,
      windowEnd: ctx.windowEnd,
      weekTotalKm: options[0].changes.reduce((s, c) => s + c.beforeKm, 0),
      workoutCount: ctx.inputs.length,
      digest,
      options,
    };
  }

  /**
   * Aplica o alívio da semana — UM patch com N itens, atômico.
   *
   * Cada treino alterado entra com o SEU `expected.instructions_md5`. Se
   * qualquer um deles tiver mudado desde a preview, a primitiva levanta `RE409`
   * e desfaz o bloco inteiro: não existe "aliviou 3 de 4".
   */
  async applyWeek(
    userId: string,
    level: ReliefLevel,
    expectedDigest: string,
    insightId?: string | null,
  ): Promise<WeekReliefApplied | WeekReliefRejected> {
    const ctx = await this.resolveWeek(userId, insightId);
    if ('reason' in ctx) return this.weekRejected(ctx.reason);

    const out = computeWeekRelief(ctx.inputs, level);
    if ('reason' in out) return this.weekRejected(out.reason);
    if (!out.result.changed) return this.weekRejected('nothing_to_reduce');

    const alterados = out.result.changes.filter((c) => c.changed);
    const patch = alterados.map((c) => {
      const alvo = ctx.byId.get(c.workoutId)!;
      return {
        workout_id: c.workoutId,
        expected: {
          status: 'pending',
          instructions_md5: alvo.instructions_md5,
        },
        set: {
          distance_km: c.afterKm,
          instructions_json: c.segments as unknown[],
        },
      };
    });

    const result = await this.planAdaptation.apply({
      userId,
      planId: ctx.planId,
      kind: 'reduzir_volume',
      todayStr: ctx.todayStr,
      expectedDigest,
      patch,
      meta: {
        source: insightId ? 'weekly_insight' : 'manual',
        sourceInsightId: insightId ?? null,
        reason: `aliviar a semana ${ctx.weekNumber} (${RELIEF_TARGET_PCT[level]}%)`,
        reasonCode: `week_relief_${level}`,
        weekNumber: ctx.weekNumber,
        windowStart: ctx.windowStart,
        windowEnd: ctx.windowEnd,
        metrics: {
          before_km: out.result.weekTotalKmBefore,
          after_km: out.result.weekTotalKmAfter,
          achieved_pct: out.result.achievedPct,
          workouts_changed: alterados.length,
          workouts_protected: out.result.changes.filter((c) => c.isProtected)
            .length,
        },
      },
    });

    if (result.applied) {
      this.logger.log(
        `[WeekRelief] semana ${ctx.weekNumber} do plano ${ctx.planId}: ` +
          `${out.result.weekTotalKmBefore}→${out.result.weekTotalKmAfter} km ` +
          `(${out.result.achievedPct}%, ${alterados.length} treino(s))` +
          (result.replayed ? ' [replay]' : ''),
      );
      return {
        applied: true,
        replayed: result.replayed === true,
        adaptationId: result.adaptationId,
        weekNumber: ctx.weekNumber,
        achievedPct: out.result.achievedPct,
        weekTotalKmAfter: out.result.weekTotalKmAfter,
        workoutsChanged: alterados.length,
        briefingsInvalidated: result.affected?.briefings ?? 0,
      };
    }

    const isConflict =
      result.reason === 'revision_conflict' || result.reason === 'row_conflict';

    return {
      applied: false,
      reason: result.reason ?? 'unknown',
      message: isConflict
        ? 'Seu plano mudou desde que você abriu esta tela. Veja a nova sugestão.'
        : 'Não foi possível aliviar esta semana agora.',
      preview: isConflict
        ? await this.previewWeek(userId, insightId)
        : undefined,
    };
  }

  /**
   * Resolve a semana alvo, os treinos dela e os guards.
   *
   * Preview e apply consomem o MESMO veredito — o que o corredor viu e o que o
   * servidor aplica saem do mesmo código, não de duas leituras que precisam
   * concordar.
   */
  private async resolveWeek(
    userId: string,
    insightId?: string | null,
  ): Promise<
    | {
        planId: string;
        todayStr: string;
        weekNumber: number;
        windowStart: string;
        windowEnd: string;
        inputs: Array<{
          id: string;
          type: string | null;
          title: string | null;
          scheduled_date: string;
          instructions_json: unknown;
        }>;
        byId: Map<string, EditableWorkout>;
      }
    | { reason: WeekReliefRefusalReason }
  > {
    const todayStr = this.planAdaptation.todayStr();
    const client = this.supabaseService.getClient();

    const { data: plan } = await client
      .from('training_plans')
      .select(
        'id, status, generation_status, duration_weeks, goal, goal_type, race_distance',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!plan?.id) return { reason: 'no_active_plan' };

    const editableCheck = await this.planAdaptation.assertPlanEditable(
      plan.id,
      userId,
    );
    if (!editableCheck.editable) return { reason: 'plan_not_editable' };

    // ── Já aplicado? O HISTÓRICO é a fonte de verdade ────────────────────────
    //
    // Não há coluna de carimbo para volume (só `schedule` tem
    // `adjustment_applied_at`, gravado dentro da própria transação do shift).
    // Consultar `plan_adaptations` evita migration E deixa o padrão "aliviou
    // toda semana" visível no mesmo lugar onde ele precisa ser auditável.
    if (insightId) {
      const { data: ja } = await client
        .from('plan_adaptations')
        .select('id')
        .eq('source_insight_id', insightId)
        .eq('kind', 'reduzir_volume')
        .is('reverted_at', null)
        .limit(1);
      if (Array.isArray(ja) && ja.length > 0) {
        return { reason: 'already_applied' };
      }
    }

    // ── A semana alvo ────────────────────────────────────────────────────────
    //
    // `derivePlanWeeks` sobre TODOS os treinos do plano — a mesma derivação que
    // `getPlanOverview` usa para `is_current`. Derivar de `created_at + 7n`
    // estaria errado depois de qualquer re-âncora.
    const { data: todos } = await client
      .from('workouts')
      .select('id, week_number, scheduled_date')
      .eq('plan_id', plan.id)
      .eq('user_id', userId);

    const weeks = derivePlanWeeks((todos ?? []) as never[]);
    if (weeks.length === 0) return { reason: 'no_workouts' };

    // "Corrente" = a primeira semana que ainda não terminou (mesmo critério do
    // overview). A alvo é a seguinte a ela.
    const corrente = weeks.find((w) => w.endStr >= todayStr) ?? null;
    const alvoNumero = (corrente?.weekNumber ?? weeks[0].weekNumber) + 1;
    const alvo = weeks.find((w) => w.weekNumber === alvoNumero);
    if (!alvo) return { reason: 'no_next_week' };

    // Taper é invariante: o polimento já é volume reduzido de propósito.
    if (this.isTaperWeek(plan, alvoNumero)) return { reason: 'taper_week' };

    // Os treinos vêm da janela editável do BANCO — é ela que traz o
    // `instructions_md5` calculado pelo Postgres e garante que a seleção do
    // serviço e a do SQL sejam a mesma coisa.
    const editable = await this.planAdaptation.loadEditableWorkouts(
      plan.id,
      todayStr,
    );
    const daSemana = editable.filter((w) => w.week_number === alvoNumero);
    if (daSemana.length === 0) return { reason: 'no_workouts' };

    return {
      planId: plan.id,
      todayStr,
      weekNumber: alvoNumero,
      windowStart: alvo.startStr,
      windowEnd: alvo.endStr,
      inputs: daSemana.map((w) => ({
        id: w.id,
        type: w.type,
        title: w.title,
        scheduled_date: w.scheduled_date,
        instructions_json: w.instructions_json,
      })),
      byId: new Map(daSemana.map((w) => [w.id, w])),
    };
  }

  private toWeekOption(r: WeekReliefResult): WeekReliefOption {
    return {
      level: r.level,
      targetPct: r.targetPct,
      achievedPct: r.achievedPct,
      weekTotalKmAfter: r.weekTotalKmAfter,
      changes: r.changes.map((c: WeekReliefChange) => ({
        workoutId: c.workoutId,
        title: c.title,
        type: c.type,
        scheduledDate: c.scheduledDate,
        isProtected: c.isProtected,
        beforeKm: c.beforeKm,
        afterKm: c.afterKm,
        changed: c.changed,
      })),
    };
  }

  private weekMessage(reason: string): string {
    return (
      WEEK_REFUSAL_MESSAGES[reason] ??
      RELIEF_REFUSAL_MESSAGES[reason as ReliefRefusal] ??
      'Não foi possível aliviar esta semana.'
    );
  }

  private weekUnavailable(
    reason: WeekReliefRefusalReason,
  ): WeekReliefUnavailable {
    return { available: false, reason, message: this.weekMessage(reason) };
  }

  private weekRejected(reason: WeekReliefRefusalReason): WeekReliefRejected {
    return { applied: false, reason, message: this.weekMessage(reason) };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Contexto compartilhado por preview e apply
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resolve plano, alvo e guardas. É o ÚNICO lugar que decide se um treino pode
   * ser aliviado — preview e apply consomem o mesmo veredito.
   */
  private async resolve(
    userId: string,
    workoutId: string,
  ): Promise<
    | { planId: string; todayStr: string; target: EditableWorkout }
    | { reason: ReliefRefusal }
  > {
    const todayStr = this.planAdaptation.todayStr();
    const client = this.supabaseService.getClient();

    const { data: plan } = await client
      .from('training_plans')
      .select(
        'id, status, generation_status, duration_weeks, goal, goal_type, race_distance',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!plan?.id) return { reason: 'no_active_plan' };

    const { data: workout } = await client
      .from('workouts')
      .select('id, plan_id, status, scheduled_date, is_race_day, week_number')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!workout) return { reason: 'not_found' };

    // A fronteira compartilhada — a MESMA que o `WHERE` do SQL reafirma.
    const check = isEditableWorkout(workout, {
      activePlanId: plan.id,
      todayStr,
    });
    if (!check.editable) {
      return { reason: (check.reason ?? 'not_found') as ReliefRefusal };
    }

    // ── Taper é invariante ───────────────────────────────────────────────────
    //
    // O polimento JÁ é volume reduzido de propósito: cortar mais chegaria na
    // prova destreinado. A fase é recomputada (não lida de `plan_json`) pelo
    // mesmo trio que `getPlanOverview` usa desde a 6.1 — plano antigo nenhum
    // fica com a fase errada.
    if (this.isTaperWeek(plan, workout.week_number)) {
      return { reason: 'taper_week' };
    }

    const editableCheck = await this.planAdaptation.assertPlanEditable(
      plan.id,
      userId,
    );
    if (!editableCheck.editable) return { reason: 'plan_not_editable' };

    // O alvo vem da janela editável do BANCO, não de um select próprio: é o que
    // traz o `instructions_md5` calculado pelo Postgres, e o que garante que a
    // seleção do serviço e a do SQL sejam a mesma coisa (a mina 2 da 6.1).
    const editable = await this.planAdaptation.loadEditableWorkouts(
      plan.id,
      todayStr,
    );
    const target = editable.find((w) => w.id === workoutId);
    if (!target) return { reason: 'not_pending' };

    return { planId: plan.id, todayStr, target };
  }

  private isTaperWeek(
    plan: {
      duration_weeks?: number | null;
      goal?: string | null;
      goal_type?: string | null;
      race_distance?: number | null;
    },
    weekNumber: number | null,
  ): boolean {
    if (typeof weekNumber !== 'number' || weekNumber <= 0) return false;
    const totalWeeks = plan.duration_weeks ?? 0;
    if (totalWeeks <= 0) return false;

    const goalKm = this.volumePlanner.resolveGoalKm({
      goal: plan.goal,
      goalType: plan.goal_type,
      raceDistance: plan.race_distance,
    });
    const phases = this.volumePlanner.calculatePhases(totalWeeks, goalKm);
    return this.volumePlanner.phaseOfWeek(weekNumber, phases) === 'taper';
  }

  private toOption(level: ReliefLevel, r: ReliefResult): ReliefOption {
    return {
      level,
      targetPct: RELIEF_TARGET_PCT[level],
      achievedPct: r.achievedPct,
      distanceKm: r.distanceKm,
      durationSeconds: r.durationSeconds,
    };
  }

  private unavailable(reason: ReliefRefusal): ReliefUnavailable {
    return {
      available: false,
      reason,
      message: RELIEF_REFUSAL_MESSAGES[reason],
    };
  }

  private rejected(reason: ReliefRefusal): ReliefRejected {
    return {
      applied: false,
      reason,
      message: RELIEF_REFUSAL_MESSAGES[reason],
    };
  }
}
