import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { VolumePlannerService } from '../../common/volume-planner/volume-planner.service';
import {
  PlanAdaptationService,
  EditableWorkout,
} from './plan-adaptation.service';
import { isEditableWorkout } from './helpers/plan-window.helper';
import {
  computeRelief,
  totalsOfSegments,
  ReliefLevel,
  ReliefResult,
  RELIEF_TARGET_PCT,
} from './helpers/volume-relief.helper';

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
