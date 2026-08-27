import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import {
  EditableWorkout,
  PatchItem,
  PlanAdaptationService,
} from './plan-adaptation.service';
import { derivePlanWeeks } from './helpers/plan-window.helper';
import {
  evaluateSpacing,
  freeDatesInWindow,
  isNoOp,
  normalizeDays,
  readDaysOfWeek,
  remapSingle,
  remapStructural,
  sameDaySet,
  SpacingVerdict,
  SwapRefusal,
  Weekday,
  weekdayOf,
} from './helpers/day-swap.helper';
import { DaySwapMode } from './dto/day-swap.dto';

/**
 * TROCA DE DIAS — o serviço (Fase T.1).
 *
 * ── OS DOIS MODOS ────────────────────────────────────────────────────────────
 *
 *   MODO 1 (structural)  "minha rotina mudou de vez"
 *                        Novo conjunto de dias, da PRÓXIMA semana até o fim do
 *                        plano. A semana corrente fica intocada — é isso que
 *                        torna o passado impossível POR CONSTRUÇÃO, e não por
 *                        validação.
 *
 *   MODO 2 (single)      "essa semana preciso mexer num dia"
 *                        UM treino da semana corrente para outro dia. O select
 *                        só oferece dias que ainda não passaram E que estão
 *                        livres: o passado morre por filtragem, a colisão morre
 *                        por não ser oferecida.
 *
 * A divisão não é só de UX. Ela é o que faz a guarda `RE422` da T.0 ser o que
 * deve ser — uma REDE, que em uso normal nunca dispara. Se ela disparar, é bug
 * daqui, e o `PlanAdaptationService` loga em ERROR justamente por isso.
 *
 * ── O QUE ESTE SERVIÇO NÃO FAZ ───────────────────────────────────────────────
 *
 * Não calcula datas (é o `day-swap.helper`, puro e testável sem mock) e não
 * escreve no banco (é a primitiva). Ele resolve contexto, monta o patch e
 * traduz recusa em resposta — o mesmo formato da 6.2/6.3.
 */

export type DaySwapRefusal =
  | SwapRefusal
  | 'no_active_plan'
  | 'plan_not_editable'
  | 'not_found'
  | 'not_pending'
  | 'missing_new_days'
  | 'missing_target'
  | 'nothing_to_change';

const REFUSAL_MESSAGES: Record<DaySwapRefusal, string> = {
  no_active_plan: 'Você não tem um plano ativo.',
  plan_not_editable: 'Seu plano ainda está sendo preparado.',
  no_editable_workouts: 'Não há treinos futuros para reorganizar.',
  no_next_week: 'Seu plano não tem uma próxima semana para reorganizar.',
  not_found: 'Não encontrei esse treino.',
  not_pending: 'Esse treino não pode mais ser movido.',
  same_days: 'Esses já são os seus dias de treino.',
  day_count_mismatch:
    'Escolha a mesma quantidade de dias que você treina hoje.',
  week_count_mismatch:
    'Alguma semana do seu plano tem mais treinos do que os dias escolhidos.',
  invalid_days: 'Os dias escolhidos não são válidos.',
  target_not_free: 'Já existe um treino nesse dia.',
  target_in_past: 'Esse dia já passou.',
  missing_new_days: 'Escolha os novos dias de treino.',
  missing_target: 'Escolha o treino e o dia de destino.',
  nothing_to_change: 'Nada mudaria com essa escolha.',
};

export interface DaySwapUnavailable {
  available: false;
  reason: DaySwapRefusal;
  message: string;
}

export interface DaySwapContext {
  available: true;
  /** Dias atuais, do CALENDÁRIO — nunca de `days_per_week`. */
  currentDays: Weekday[];
  /** Quantos dias o corredor treina. A troca mantém este número. */
  dayCount: number;
  /** A semana que o Modo 1 remapeia primeiro. */
  nextWeek: { weekNumber: number; startDate: string; endDate: string } | null;
  /** Insumo do Modo 2: o que ainda vem nesta semana e para onde pode ir. */
  currentWeek: {
    weekNumber: number;
    workouts: Array<{
      workoutId: string;
      type: string | null;
      title: string | null;
      date: string;
      weekday: Weekday;
    }>;
    freeDates: Array<{ date: string; weekday: Weekday }>;
  } | null;
}

export interface DaySwapChange {
  workoutId: string;
  type: string | null;
  title: string | null;
  weekNumber: number;
  from: string;
  to: string;
}

export interface DaySwapPreview {
  available: true;
  mode: DaySwapMode;
  changes: DaySwapChange[];
  weeksAffected: number;
  spacing: SpacingVerdict;
  digest: string;
}

export interface DaySwapApplied {
  applied: true;
  replayed: boolean;
  adaptationId?: string;
  workoutsMoved: number;
  /** Só no Modo 1: os dias gravados em `user_onboarding`. */
  daysSaved?: Weekday[];
}

export interface DaySwapRejected {
  applied: false;
  reason: string;
  message: string;
  /** Presente no conflito: a preview recalculada, para reconfirmar. */
  preview?: DaySwapPreview | DaySwapUnavailable;
}

interface SwapContext {
  planId: string;
  userId: string;
  todayStr: string;
  editable: EditableWorkout[];
  /** Datas ocupadas por QUALQUER treino do plano — inclusive os intocáveis. */
  occupiedDates: string[];
  currentWeekNumber: number | null;
  nextWeekNumber: number | null;
  weeks: ReturnType<typeof derivePlanWeeks>;
}

@Injectable()
export class DaySwapService {
  private readonly logger = new Logger(DaySwapService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly planAdaptation: PlanAdaptationService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Contexto — o que o chat precisa para montar a conversa
  // ───────────────────────────────────────────────────────────────────────────

  async getContext(
    userId: string,
  ): Promise<DaySwapContext | DaySwapUnavailable> {
    const ctx = await this.resolve(userId);
    if ('reason' in ctx) return this.unavailable(ctx.reason);

    const semanaAlvo = ctx.nextWeekNumber ?? ctx.currentWeekNumber;
    if (semanaAlvo === null) return this.unavailable('no_editable_workouts');

    const currentDays = readDaysOfWeek(ctx.editable, semanaAlvo);
    if (currentDays.length === 0)
      return this.unavailable('no_editable_workouts');

    return {
      available: true,
      currentDays,
      dayCount: currentDays.length,
      nextWeek: this.weekWindow(ctx, ctx.nextWeekNumber),
      currentWeek: this.buildCurrentWeek(ctx),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Preview
  // ───────────────────────────────────────────────────────────────────────────

  async preview(
    userId: string,
    params: {
      mode: DaySwapMode;
      newDays?: number[];
      workoutId?: string;
      targetDate?: string;
    },
  ): Promise<DaySwapPreview | DaySwapUnavailable> {
    const ctx = await this.resolve(userId);
    if ('reason' in ctx) return this.unavailable(ctx.reason);

    const calc = this.calculate(ctx, params);
    if ('reason' in calc) return this.unavailable(calc.reason);

    // O digest por ÚLTIMO: ele tem de descrever o mesmo estado que a preview
    // está mostrando.
    const digest = await this.planAdaptation.getStateDigest(
      ctx.planId,
      ctx.todayStr,
    );
    if (!digest) return this.unavailable('plan_not_editable');

    return {
      available: true,
      mode: params.mode,
      changes: calc.changes,
      weeksAffected: new Set(calc.changes.map((c) => c.weekNumber)).size,
      spacing: calc.spacing,
      digest,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Apply
  // ───────────────────────────────────────────────────────────────────────────

  async apply(
    userId: string,
    params: {
      mode: DaySwapMode;
      expectedDigest: string;
      newDays?: number[];
      workoutId?: string;
      targetDate?: string;
    },
  ): Promise<DaySwapApplied | DaySwapRejected> {
    const ctx = await this.resolve(userId);
    if ('reason' in ctx) return this.rejected(ctx.reason);

    const calc = this.calculate(ctx, params);
    if ('reason' in calc) return this.rejected(calc.reason);

    const patch: PatchItem[] = calc.changes.map((c) => ({
      workout_id: c.workoutId,
      // Sem `instructions_md5`: o SQL só o exige quando o `set` toca
      // `instructions_json`, e a troca não toca em segmento nenhum. Uma
      // reprecificação concorrente da F3 é pega pelo DIGEST, que inclui o md5
      // de cada treino da janela.
      expected: { status: 'pending' },
      set: { scheduled_date: c.to },
    }));

    const result = await this.planAdaptation.apply({
      userId,
      planId: ctx.planId,
      kind: 'swap_days',
      todayStr: ctx.todayStr,
      expectedDigest: params.expectedDigest,
      patch,
      // ── O BRIEFING SOBREVIVE ─────────────────────────────────────────────
      //
      // A troca muda a DATA, não o conteúdo. O prompt do briefing não contém
      // data nem dia da semana (só tipo, distância, zona, esforço, objetivo,
      // blocos e nível), então o texto continua correto. Invalidar aqui
      // torraria geração de IA cobrada para reescrever o mesmo texto.
      //
      // ⚠️ Se um dia a troca passar a mexer no CONTEÚDO do treino, esta linha
      // tem de voltar para `true`.
      invalidateBriefings: false,
      // Modo 1 fecha a Mina 4; Modo 2 é pontual e NÃO redefine a rotina.
      onboardingPatch: calc.daysToSave
        ? { available_days: calc.daysToSave }
        : null,
      meta: {
        source: 'manual',
        reason:
          params.mode === 'structural'
            ? `trocar dias de treino para ${(calc.daysToSave ?? []).join(',')}`
            : 'mover um treino de dia',
        reasonCode: `swap_days_${params.mode}`,
        weekNumber: calc.changes[0]?.weekNumber ?? null,
        windowStart: calc.changes[0]?.to ?? null,
        windowEnd: calc.changes[calc.changes.length - 1]?.to ?? null,
        metrics: {
          mode: params.mode,
          workouts_moved: calc.changes.length,
          weeks_affected: new Set(calc.changes.map((c) => c.weekNumber)).size,
          spacing_verdict: calc.spacing.verdict,
        },
      },
    });

    if (result.applied) {
      this.logger.log(
        `[DaySwap] ${params.mode} no plano ${ctx.planId}: ` +
          `${calc.changes.length} treino(s), espaçamento ${calc.spacing.verdict}` +
          (calc.daysToSave
            ? `, dias → [${calc.daysToSave.join(',')}] ` +
              `(onboarding: ${result.affected?.onboarding ?? '?'} linha(s))`
            : '') +
          (result.replayed ? ' [replay]' : ''),
      );
      return {
        applied: true,
        replayed: result.replayed === true,
        adaptationId: result.adaptationId,
        workoutsMoved: calc.changes.length,
        daysSaved: calc.daysToSave ?? undefined,
      };
    }

    // ── Conflito: recalcula a preview para o corredor reconfirmar ────────────
    //
    // Recarrega TUDO, não só o digest: entre a preview e agora o calendário
    // pode ter mudado, e devolver o digest novo com a preview velha convidaria
    // a aplicar sobre um estado que não é mais o que foi mostrado.
    const isConflict =
      result.reason === 'revision_conflict' || result.reason === 'row_conflict';

    return {
      applied: false,
      reason: result.reason ?? 'unknown',
      message: isConflict
        ? 'Seu plano mudou desde que você abriu esta tela. Veja como ficou.'
        : 'Não foi possível trocar os dias agora.',
      preview: isConflict ? await this.preview(userId, params) : undefined,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // O cálculo — comum a preview e apply, para as duas NUNCA divergirem
  // ───────────────────────────────────────────────────────────────────────────

  private calculate(
    ctx: SwapContext,
    params: {
      mode: DaySwapMode;
      newDays?: number[];
      workoutId?: string;
      targetDate?: string;
    },
  ):
    | {
        changes: DaySwapChange[];
        spacing: SpacingVerdict;
        daysToSave: Weekday[] | null;
      }
    | { reason: DaySwapRefusal } {
    if (params.mode === 'structural') {
      return this.calculateStructural(ctx, params.newDays);
    }
    return this.calculateSingle(ctx, params.workoutId, params.targetDate);
  }

  private calculateStructural(
    ctx: SwapContext,
    rawDays: number[] | undefined,
  ):
    | {
        changes: DaySwapChange[];
        spacing: SpacingVerdict;
        daysToSave: Weekday[];
      }
    | { reason: DaySwapRefusal } {
    if (!rawDays) return { reason: 'missing_new_days' };

    const newDays = normalizeDays(rawDays);
    if (!newDays) return { reason: 'invalid_days' };

    if (ctx.nextWeekNumber === null) return { reason: 'no_next_week' };

    const atuais = readDaysOfWeek(ctx.editable, ctx.nextWeekNumber);
    if (atuais.length === 0) return { reason: 'no_editable_workouts' };

    // "Mantém a quantidade" é a invariante do v1: mudar o NÚMERO de dias seria
    // quase regenerar o plano, e está fora do escopo.
    if (newDays.length !== atuais.length) {
      return { reason: 'day_count_mismatch' };
    }
    if (sameDaySet(newDays, atuais)) return { reason: 'same_days' };

    const out = remapStructural({
      workouts: ctx.editable.map((w) => ({
        id: w.id,
        week_number: w.week_number,
        scheduled_date: w.scheduled_date,
        type: w.type,
        title: w.title,
      })),
      newDays,
      fromWeekNumber: ctx.nextWeekNumber,
      todayStr: ctx.todayStr,
      occupiedDates: ctx.occupiedDates,
    });
    if ('reason' in out) return { reason: out.reason };
    if (isNoOp(out.result)) return { reason: 'nothing_to_change' };

    const changes = out.result
      .filter((r) => r.changed)
      .map((r) => this.toChange(r));

    return {
      changes,
      // A régua avalia a PRIMEIRA semana remapeada — o arranjo se repete nas
      // seguintes, e citar um exemplo concreto é o que o chat consegue mostrar.
      spacing: evaluateSpacing(
        out.result.filter((r) => r.weekNumber === ctx.nextWeekNumber),
      ),
      daysToSave: newDays,
    };
  }

  private calculateSingle(
    ctx: SwapContext,
    workoutId: string | undefined,
    targetDate: string | undefined,
  ):
    | { changes: DaySwapChange[]; spacing: SpacingVerdict; daysToSave: null }
    | { reason: DaySwapRefusal } {
    if (!workoutId || !targetDate) return { reason: 'missing_target' };

    const alvo = ctx.editable.find((w) => w.id === workoutId);
    if (!alvo) return { reason: 'not_found' };

    const out = remapSingle({
      workout: {
        id: alvo.id,
        week_number: alvo.week_number,
        scheduled_date: alvo.scheduled_date,
        type: alvo.type,
        title: alvo.title,
      },
      targetDate,
      todayStr: ctx.todayStr,
      occupiedDates: ctx.occupiedDates,
    });
    if ('reason' in out) return { reason: out.reason };
    if (isNoOp(out.result)) return { reason: 'nothing_to_change' };

    // A régua olha a semana INTEIRA depois da mudança: mover um treino pode
    // colar dois pesados que hoje estão separados, e é isso que interessa
    // avisar. Os outros treinos entram na avaliação com as datas que já têm.
    const semana = ctx.editable
      .filter((w) => w.week_number === alvo.week_number)
      .map((w) => ({
        workoutId: w.id,
        weekNumber: w.week_number ?? 0,
        type: w.type,
        title: w.title,
        from: w.scheduled_date,
        to: w.id === alvo.id ? targetDate : w.scheduled_date,
        changed: w.id === alvo.id,
      }));

    return {
      changes: out.result.map((r) => this.toChange(r)),
      spacing: evaluateSpacing(semana),
      daysToSave: null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * O contexto do plano ativo: janela editável, semanas e datas ocupadas.
   *
   * A janela vem do BANCO (`plan_editable_workouts`), nunca de um `select`
   * montado aqui — é o que garante que a seleção do serviço e a do SQL sejam a
   * mesma coisa. Foi a divergência entre as duas que criou a mina 2 da 6.1.
   */
  private async resolve(
    userId: string,
  ): Promise<SwapContext | { reason: DaySwapRefusal }> {
    const todayStr = this.planAdaptation.todayStr();
    const client = this.supabaseService.getClient();

    // Tipado explicitamente: o `supabase-js` devolve `any` do `.select()`, e sem
    // isto `plan.id` seria `any` — um erro de digitação no nome da coluna
    // passaria como `undefined` sem o compilador reclamar.
    const { data: plan } = (await client
      .from('training_plans')
      .select('id, status, generation_status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()) as { data: { id: string } | null };

    if (!plan?.id) return { reason: 'no_active_plan' };

    const editavel = await this.planAdaptation.assertPlanEditable(
      plan.id,
      userId,
    );
    if (!editavel.editable) return { reason: 'plan_not_editable' };

    // TODOS os treinos do plano — não só os editáveis. As datas dos concluídos,
    // pulados e do dia da PROVA precisam entrar na checagem de colisão: nada no
    // banco impede mover um treino para cima de um deles (não existe
    // `UNIQUE (plan_id, scheduled_date)` em ambiente nenhum).
    type LinhaDoPlano = {
      id: string;
      week_number: number | null;
      scheduled_date: string;
    };

    const { data: todos } = (await client
      .from('workouts')
      .select('id, week_number, scheduled_date')
      .eq('plan_id', plan.id)
      .eq('user_id', userId)) as { data: LinhaDoPlano[] | null };

    const linhas = todos ?? [];

    const editable = await this.planAdaptation.loadEditableWorkouts(
      plan.id,
      todayStr,
    );
    if (editable.length === 0) return { reason: 'no_editable_workouts' };

    const weeks = derivePlanWeeks(linhas);
    const corrente = weeks.find((w) => w.endStr >= todayStr) ?? null;
    const correnteNum = corrente?.weekNumber ?? null;
    const seguinte =
      correnteNum !== null
        ? (weeks.find((w) => w.weekNumber === correnteNum + 1)?.weekNumber ??
          null)
        : null;

    return {
      planId: plan.id,
      userId,
      todayStr,
      editable,
      occupiedDates: linhas.map((w) => w.scheduled_date),
      currentWeekNumber: correnteNum,
      nextWeekNumber: seguinte,
      weeks,
    };
  }

  private buildCurrentWeek(ctx: SwapContext): DaySwapContext['currentWeek'] {
    if (ctx.currentWeekNumber === null) return null;

    const janela = ctx.weeks.find(
      (w) => w.weekNumber === ctx.currentWeekNumber,
    );
    if (!janela) return null;

    const daSemana = ctx.editable
      .filter((w) => w.week_number === ctx.currentWeekNumber)
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : 1));

    const freeDates = freeDatesInWindow({
      windowStart: janela.startStr,
      windowEnd: janela.endStr,
      todayStr: ctx.todayStr,
      occupiedDates: ctx.occupiedDates,
    });

    return {
      weekNumber: ctx.currentWeekNumber,
      workouts: daSemana.map((w) => ({
        workoutId: w.id,
        type: w.type,
        title: w.title,
        date: w.scheduled_date,
        weekday: weekdayOf(w.scheduled_date),
      })),
      freeDates: freeDates.map((d) => ({ date: d, weekday: weekdayOf(d) })),
    };
  }

  private weekWindow(
    ctx: SwapContext,
    weekNumber: number | null,
  ): DaySwapContext['nextWeek'] {
    if (weekNumber === null) return null;
    const janela = ctx.weeks.find((w) => w.weekNumber === weekNumber);
    if (!janela) return null;
    return {
      weekNumber,
      startDate: janela.startStr,
      endDate: janela.endStr,
    };
  }

  private toChange(r: {
    workoutId: string;
    weekNumber: number;
    type: string | null;
    title: string | null;
    from: string;
    to: string;
  }): DaySwapChange {
    return {
      workoutId: r.workoutId,
      type: r.type,
      title: r.title,
      weekNumber: r.weekNumber,
      from: r.from,
      to: r.to,
    };
  }

  private unavailable(reason: DaySwapRefusal): DaySwapUnavailable {
    return { available: false, reason, message: REFUSAL_MESSAGES[reason] };
  }

  private rejected(reason: DaySwapRefusal): DaySwapRejected {
    return { applied: false, reason, message: REFUSAL_MESSAGES[reason] };
  }
}
