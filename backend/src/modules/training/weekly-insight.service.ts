import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { TrainingService } from './training.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';
import { paceValueToSecondsPerKm } from '../../common/pace-calculator';
import {
  derivePlanWeeks,
  isPlanFinished,
  PlanWeekWindow,
} from './helpers/plan-window.helper';
import {
  decideAdjustment,
  SuggestedAdjustment,
  ADJUSTMENT_LABELS,
  EASY_PACE_TOLERANCE_SEC,
} from './helpers/weekly-adjustment';
import { toSaoPauloDateStr } from './wellness/helpers/streak.helper';
import {
  buildMetric,
  sparkline7,
  weightedAvgPaceSeconds,
  resolveTargetFrequency,
  MetricPoint,
} from './wellness/helpers/metrics.helper';

/**
 * INSIGHT SEMANAL — resumo de uma SEMANA DO PLANO, gerado na virada.
 *
 * ── O QUE ISTO RESOLVE ────────────────────────────────────────────────────────
 *
 * Até aqui o app só falava com o atleta no FIM do ciclo (a retrospectiva). Entre
 * a criação do plano e o fim dele, silêncio — e é exatamente nesse intervalo que
 * um plano dá errado sem ninguém perceber.
 *
 * ── O PRINCÍPIO ───────────────────────────────────────────────────────────────
 *
 * Número é cálculo determinístico; a IA só dá voz. Todas as métricas e a escolha
 * do reajuste saem de regra (`decideAdjustment`); o Haiku recebe tudo pronto e
 * apenas narra.
 *
 * ── ESCOPO DA SEMANA ──────────────────────────────────────────────────────────
 *
 * A janela vem de `derivePlanWeeks` — MIN/MAX(scheduled_date) por `week_number`,
 * a mesma função que `getPlanOverview` consome. Não é semana de calendário: a
 * semana 3 de um plano pode ir de quarta a segunda.
 */

/** Zonas de treino, na ordem em que aparecem. */
const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;
export type Zone = (typeof ZONES)[number];

/** Zonas em que correr mais rápido que o prescrito é ERRO, não objetivo. */
const EASY_ZONES: ReadonlySet<string> = new Set<string>(['Z1', 'Z2']);

/**
 * Data de ativação da feature. Semanas que fecharam ANTES disso não geram
 * insight — sem isso, no primeiro dia no ar todo plano ativo dispararia uma
 * chamada de IA por semana já fechada, de uma vez.
 *
 * Sobrescrevível por env para ativar staging antes de produção.
 */
export const DEFAULT_WEEKLY_INSIGHT_START_DATE = '2026-08-03';

interface WorkoutRow {
  id: string;
  week_number: number | null;
  scheduled_date: string | null;
  status: string | null;
  distance_km: number | string | null;
  distance_run: number | string | null;
  time_run_seconds: number | null;
  pace_seconds_per_km: number | string | null;
  instructions_json: unknown;
  metadata: { zone?: string } | null;
}

interface ActivityRow {
  start_date: string;
  distance: number | null;
  moving_time: number | null;
  average_pace: number | null;
  calories: number | null;
  elevation_gain: number | null;
}

/** Plano ativo, na forma mínima que a varredura precisa. */
interface ActivePlanRow {
  id: string;
  user_id: string;
  frequency_per_week: number | null;
}

/** Linha de `plan_week_insights` — só o que este service lê de volta. */
export interface WeeklyInsightRow {
  id: string;
  plan_id: string;
  user_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  completed_workouts: number | null;
  total_runs_in_period: number | null;
  ai_narrative: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  notified_at: string | null;
  seen_at: string | null;
  adjustment_applied_at: string | null;
}

export interface ZoneBucket {
  workouts: number;
  km: number;
  seconds: number;
}

export interface IntensityBucket {
  /** Treinos medidos (têm pace esperado E executado). */
  n: number;
  avgExpectedSec: number;
  avgActualSec: number;
  /** Negativo = correu MAIS RÁPIDO que o prescrito. */
  avgDeltaSec: number;
  /** Quantos saíram `EASY_PACE_TOLERANCE_SEC` (ou mais) abaixo do alvo. */
  fasterCount: number;
}

export interface PlanWeekMetrics {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;

  // ── Aderência ao plano (escopo: workouts do plano nesta semana) ──
  plannedWorkouts: number;
  completedWorkouts: number;
  completionRate: number;
  plannedDistanceKm: number;
  completedDistanceKm: number;
  distanceVsGoalPercent: number;
  /** Σ distance_run ÷ Σ distance_km SÓ DOS CONCLUÍDOS. Ver a nota do enum. */
  executionRatioPercent: number;
  avgPaceSeconds: number;
  expectedPaceSeconds: number;

  // ── Frequência: DIAS DISTINTOS, não contagem de treinos ──
  frequencyActualDays: number;
  frequencyTargetDays: number;
  frequencyVsGoalPercent: number;

  // ── Total corrido na janela (inclui corrida livre) ──
  totalDistanceKm: number;
  totalRunsInPeriod: number;
  freeRunDistanceKm: number;

  // ── Blocos estruturados ──
  metricsDeltas: Record<string, MetricPoint>;
  zoneDistribution: {
    prescribed: Record<string, ZoneBucket>;
    executed: Record<string, ZoneBucket>;
  };
  intensityAdherence: Record<string, IntensityBucket>;

  // ── Insumos do enum ──
  easyRunsMeasured: number;
  easyRunsTooFast: number;
}

export interface WeeklyInsight {
  id: string;
  planId: string;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  metrics: PlanWeekMetrics | null;
  suggestedAdjustment: SuggestedAdjustment | null;
  aiNarrative: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
  notifiedAt: string | null;
}

@Injectable()
export class WeeklyInsightService {
  private readonly logger = new Logger(WeeklyInsightService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    // forwardRef: TrainingService injeta RetrospectiveService, que vive no mesmo
    // módulo — o ciclo é resolvido do mesmo jeito que a retrospectiva faz.
    @Inject(forwardRef(() => TrainingService))
    private readonly trainingService: TrainingService,
    private readonly aiRouter: AIRouterService,
  ) {}

  /** Cutoff de ativação (YYYY-MM-DD). Semanas fechadas antes disso são ignoradas. */
  private get startDate(): string {
    return (
      this.configService.get<string>('WEEKLY_INSIGHT_START_DATE') ||
      DEFAULT_WEEKLY_INSIGHT_START_DATE
    );
  }

  private saoPauloTodayStr(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Gatilho
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Varre os planos ativos e gera insight para toda semana FECHADA que ainda não
   * tem um. Chamado pelo cron diário.
   *
   * O gatilho é "a semana fechou e não tem insight", não "no instante da
   * virada" — então ele se auto-recupera: se o backend estiver fora do ar na
   * madrugada, a varredura do dia seguinte pega a semana do mesmo jeito.
   *
   * DEDUPE POR TABELA, nunca em memória. O cron de lembretes usa um `Set` que
   * perde estado em restart (e cujo cleanup nem funciona); aqui a checagem é uma
   * query e a `UNIQUE (plan_id, week_number)` é a rede final — que também é o
   * que protege se o backend rodar em mais de uma réplica.
   */
  async checkForClosedPlanWeeks(): Promise<
    Array<{ userId: string; insightId: string; weekNumber: number }>
  > {
    const today = this.saoPauloTodayStr();
    const cutoff = this.startDate;
    const generated: Array<{
      userId: string;
      insightId: string;
      weekNumber: number;
    }> = [];

    this.logger.log(
      `[WeeklyInsight] Varrendo semanas fechadas em ${today} (cutoff ${cutoff})`,
    );

    try {
      const supabase = this.supabaseService.getClient();

      const { data, error } = await supabase
        .from('training_plans')
        .select('id, user_id, frequency_per_week')
        .eq('status', 'active');

      if (error) {
        this.logger.error('[WeeklyInsight] Erro buscando planos:', error);
        return generated;
      }
      const activePlans = (data ?? []) as ActivePlanRow[];
      if (activePlans.length === 0) return generated;

      // Pro-only, igual à retrospectiva: o plano de quem não paga fica
      // congelado, não envelhece nem gera conteúdo em background. Uma query em
      // lote, não uma por plano.
      const proUserIds = await this.fetchProUserIds(
        Array.from(new Set(activePlans.map((p) => p.user_id))),
      );

      for (const plan of activePlans) {
        if (!proUserIds.has(plan.user_id)) continue;

        try {
          const results = await this.processPlan(
            plan.user_id,
            plan.id,
            plan.frequency_per_week,
            today,
            cutoff,
          );
          generated.push(...results);
        } catch (err) {
          // Um plano problemático não pode derrubar a varredura dos outros.
          this.logger.error(`[WeeklyInsight] Falha no plano ${plan.id}:`, err);
        }
      }
    } catch (err) {
      this.logger.error('[WeeklyInsight] Erro na varredura:', err);
    }

    this.logger.log(`[WeeklyInsight] ${generated.length} insight(s) gerado(s)`);
    return generated;
  }

  private async fetchProUserIds(userIds: string[]): Promise<Set<string>> {
    const pro = new Set<string>();
    if (userIds.length === 0) return pro;

    const { data } = await this.supabaseService
      .getClient()
      .from('users')
      .select('id, subscription_plan')
      .in('id', userIds);

    const rows = (data ?? []) as Array<{
      id: string;
      subscription_plan: string | null;
    }>;
    for (const u of rows) {
      if ((u.subscription_plan ?? 'free') === 'pro') pro.add(u.id);
    }
    return pro;
  }

  /** Semanas elegíveis de um plano + geração. 3 queries fixas por plano. */
  private async processPlan(
    userId: string,
    planId: string,
    planFrequency: number | null,
    today: string,
    cutoff: string,
  ): Promise<Array<{ userId: string; insightId: string; weekNumber: number }>> {
    const supabase = this.supabaseService.getClient();
    const out: Array<{
      userId: string;
      insightId: string;
      weekNumber: number;
    }> = [];

    const workouts = await this.fetchPlanWorkouts(planId);
    if (workouts.length === 0) return out;

    // Sem `fallback`: semana sem treino não tem aderência, volume nem zona —
    // gerar insight para ela produziria uma linha de zeros sem significado.
    const weeks = derivePlanWeeks(workouts).filter(
      (w) => w.source === 'workouts',
    );
    if (weeks.length === 0) return out;

    const { data: existingRows } = await supabase
      .from('plan_week_insights')
      .select('week_number')
      .eq('plan_id', planId);
    const existing = new Set(
      (existingRows || []).map((r: { week_number: number }) => r.week_number),
    );

    const lastWeekNumber = weeks[weeks.length - 1].weekNumber;

    for (const week of weeks) {
      // A última semana do plano é coberta pela retrospectiva de fim de ciclo —
      // gerar as duas na mesma madrugada seria dois pushes dizendo quase a
      // mesma coisa.
      if (week.weekNumber === lastWeekNumber) continue;
      if (!isPlanFinished(week, today)) continue;
      if (week.endStr < cutoff) continue; // sem backfill
      if (existing.has(week.weekNumber)) continue;

      const insight = await this.generateForWeek(
        userId,
        planId,
        week,
        weeks,
        workouts,
        planFrequency,
      );
      if (insight) {
        out.push({
          userId,
          insightId: insight.id,
          weekNumber: week.weekNumber,
        });
      }
    }

    return out;
  }

  private async fetchPlanWorkouts(planId: string): Promise<WorkoutRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('workouts')
      .select(
        'id, week_number, scheduled_date, status, distance_km, distance_run, time_run_seconds, pace_seconds_per_km, instructions_json, metadata',
      )
      .eq('plan_id', planId);

    if (error) {
      this.logger.warn(
        `[WeeklyInsight] fetchPlanWorkouts falhou para ${planId}: ${error.message}`,
      );
      return [];
    }
    return (data || []) as WorkoutRow[];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Geração
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Gera (ou tenta gerar) o insight de UMA semana.
   *
   * Placeholder → métricas → enum → narrativa → UPDATE. Se qualquer etapa
   * falhar, a linha fica com `status='failed'` — NÃO é apagada, ao contrário da
   * retrospectiva. Lá o `delete` existe porque a checagem de existência ignora
   * `status` e uma linha órfã bloquearia o plano para sempre; aqui a `UNIQUE`
   * já garante unicidade, então persistir a falha é seguro e deixa a porta
   * aberta para um "tentar novamente".
   */
  async generateForWeek(
    userId: string,
    planId: string,
    week: PlanWeekWindow,
    allWeeks: PlanWeekWindow[],
    workouts: WorkoutRow[],
    planFrequency: number | null,
  ): Promise<WeeklyInsight | null> {
    const supabase = this.supabaseService.getClient();

    const { data: inserted, error: insertError } = await supabase
      .from('plan_week_insights')
      .insert({
        user_id: userId,
        plan_id: planId,
        week_number: week.weekNumber,
        week_start: week.startStr,
        week_end: week.endStr,
        status: 'processing',
      })
      .select()
      .single();

    const row = inserted as WeeklyInsightRow | null;
    if (insertError || !row) {
      // Caminho esperado quando a UNIQUE barra uma corrida entre réplicas.
      this.logger.warn(
        `[WeeklyInsight] Não criou placeholder p/ plano ${planId} semana ${week.weekNumber}: ${insertError?.message}`,
      );
      return null;
    }

    try {
      const prevWeek =
        allWeeks.find((w) => w.weekNumber === week.weekNumber - 1) ?? null;

      const metrics = await this.buildPlanWeekMetrics(
        userId,
        week,
        prevWeek,
        workouts,
        planFrequency,
      );

      const adjustment = decideAdjustment({
        plannedWorkouts: metrics.plannedWorkouts,
        completedWorkouts: metrics.completedWorkouts,
        completionRate: metrics.completionRate,
        executionRatio: metrics.executionRatioPercent,
        easyRunsMeasured: metrics.easyRunsMeasured,
        easyRunsTooFast: metrics.easyRunsTooFast,
      });

      const narrative = await this.generateNarrative(
        userId,
        metrics,
        adjustment,
      );

      const isZeroWeek =
        metrics.completedWorkouts === 0 && metrics.totalRunsInPeriod === 0;
      const shouldNotify = isZeroWeek
        ? !(await this.previousWeekWasZeroed(planId, week.weekNumber))
        : true;

      const notifiedAt = shouldNotify ? new Date().toISOString() : null;

      const { data: updated, error: updateError } = await supabase
        .from('plan_week_insights')
        .update({
          planned_workouts: metrics.plannedWorkouts,
          completed_workouts: metrics.completedWorkouts,
          completion_rate: metrics.completionRate,
          planned_distance_km: metrics.plannedDistanceKm,
          completed_distance_km: metrics.completedDistanceKm,
          distance_vs_goal_percent: metrics.distanceVsGoalPercent,
          execution_ratio_percent: metrics.executionRatioPercent,
          avg_pace_seconds: metrics.avgPaceSeconds,
          expected_pace_seconds: metrics.expectedPaceSeconds,
          frequency_actual_days: metrics.frequencyActualDays,
          frequency_target_days: metrics.frequencyTargetDays,
          frequency_vs_goal_percent: metrics.frequencyVsGoalPercent,
          total_distance_km: metrics.totalDistanceKm,
          total_runs_in_period: metrics.totalRunsInPeriod,
          free_run_distance_km: metrics.freeRunDistanceKm,
          metrics_deltas: metrics.metricsDeltas,
          zone_distribution: metrics.zoneDistribution,
          intensity_adherence: metrics.intensityAdherence,
          suggested_adjustment: adjustment,
          ai_narrative: narrative,
          status: 'completed',
          processed_at: new Date().toISOString(),
          notified_at: notifiedAt,
        })
        .eq('id', row.id)
        .select()
        .single();

      if (updateError || !updated) {
        this.logger.error('[WeeklyInsight] UPDATE falhou:', updateError);
        await this.markFailed(row.id);
        return null;
      }

      if (shouldNotify) {
        await this.sendWeeklyInsightNotification(
          userId,
          row.id,
          planId,
          week.weekNumber,
        );
      } else {
        this.logger.log(
          `[WeeklyInsight] Push suprimido (semana ${week.weekNumber} zerada consecutiva) p/ user ${userId}`,
        );
      }

      return this.mapRow(updated as WeeklyInsightRow, metrics, adjustment);
    } catch (err) {
      this.logger.error('[WeeklyInsight] Erro gerando:', err);
      await this.markFailed(row.id);
      return null;
    }
  }

  private async markFailed(insightId: string): Promise<void> {
    try {
      await this.supabaseService
        .getClient()
        .from('plan_week_insights')
        .update({ status: 'failed', processed_at: new Date().toISOString() })
        .eq('id', insightId);
    } catch (err) {
      this.logger.error(
        `[WeeklyInsight] Não conseguiu marcar ${insightId} como failed`,
        err,
      );
    }
  }

  /**
   * A semana anterior também foi zerada? Decide se o push de retomada sai.
   *
   * Sem linha anterior (a primeira depois do cutoff) → trata como primeira e
   * notifica. É a escolha conservadora: no máximo um push a mais na ativação.
   */
  private async previousWeekWasZeroed(
    planId: string,
    weekNumber: number,
  ): Promise<boolean> {
    if (weekNumber <= 1) return false;

    const { data } = await this.supabaseService
      .getClient()
      .from('plan_week_insights')
      .select('completed_workouts, total_runs_in_period')
      .eq('plan_id', planId)
      .eq('week_number', weekNumber - 1)
      .maybeSingle();

    if (!data) return false;
    return (
      Number(data.completed_workouts) === 0 &&
      Number(data.total_runs_in_period) === 0
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Métricas
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Métricas de uma semana do plano, em DOIS BLOCOS QUE NUNCA SE SOMAM.
   *
   * ADERÊNCIA vem de `workouts` filtrados por `week_number` — escopo de plano
   * por construção, porque corrida livre grava `plan_id: null` e nunca entra
   * neste array. TOTAL CORRIDO vem de `activities` na janela, e inclui tudo.
   *
   * Somar os dois contaria a mesma corrida duas vezes. É a mesma separação que
   * a Fase 1A fez na retrospectiva, e pelo mesmo motivo: quem corre por fora
   * não pode inflar a própria aderência.
   */
  async buildPlanWeekMetrics(
    userId: string,
    week: PlanWeekWindow,
    prevWeek: PlanWeekWindow | null,
    workouts: WorkoutRow[],
    planFrequency: number | null,
  ): Promise<PlanWeekMetrics> {
    const weekWorkouts = workouts.filter(
      (w) => w.week_number === week.weekNumber,
    );
    const completed = weekWorkouts.filter((w) => w.status === 'completed');

    const plannedWorkouts = weekWorkouts.length;
    const completedWorkouts = completed.length;

    const plannedDistanceKm = sum(weekWorkouts, (w) => num(w.distance_km));

    // `distance_run` é o GPS; `distance_km` (o prescrito) é o fallback para
    // linhas legadas concluídas antes daquela coluna existir. Padrão fixado na
    // Fase 1A e usado também em StatsService.getPeriodSummary.
    const completedDistanceKm = sum(completed, (w) =>
      num(w.distance_run ?? w.distance_km),
    );

    // Distância PRESCRITA só dos treinos concluídos — o denominador do
    // executionRatio. Diferente de plannedDistanceKm, que é a semana inteira.
    const prescribedOfCompletedKm = sum(completed, (w) => num(w.distance_km));

    const completedSeconds = sum(completed, (w) => num(w.time_run_seconds));
    const avgPaceSeconds =
      completedDistanceKm > 0 && completedSeconds > 0
        ? Math.round(completedSeconds / completedDistanceKm)
        : 0;

    // ── Activities da janela ──
    const activities = await this.fetchActivitiesInWindow(
      userId,
      week.startStr,
      week.endStr,
    );
    const totalDistanceKm = sum(activities, (a) => (a.distance || 0) / 1000);

    // ── Semana anterior (para o delta). Calculada NA HORA, não lida da linha
    //    anterior: sem backfill, a primeira semana pós-ativação não tem N−1
    //    persistida e o delta viria vazio para sempre.
    const prevActivities = prevWeek
      ? await this.fetchActivitiesInWindow(
          userId,
          prevWeek.startStr,
          prevWeek.endStr,
        )
      : [];

    // ── Zonas e intensidade ──
    const zoneDistribution = this.buildZoneDistribution(
      weekWorkouts,
      completed,
    );
    const {
      buckets: intensityAdherence,
      easyMeasured,
      easyTooFast,
    } = this.buildIntensityAdherence(completed);

    const expectedPaceSeconds = this.weekExpectedPaceSeconds(completed);

    // ── Frequência: DIAS DISTINTOS, não contagem de treinos ──
    // Dois treinos no mesmo dia contam 1 — é a definição de
    // StatsService.getPeriodSummary, não a de WellnessService.buildPerformanceBlock
    // (que conta corridas). Escolhida porque a meta do onboarding é "quantos
    // DIAS por semana você pode treinar".
    const frequencyActualDays = new Set(
      completed.map((w) => w.scheduled_date).filter(Boolean),
    ).size;
    const frequencyTargetDays = resolveTargetFrequency(
      planFrequency,
      plannedWorkouts,
      1, // a janela É uma semana
    );

    return {
      weekNumber: week.weekNumber,
      weekStart: week.startStr,
      weekEnd: week.endStr,

      plannedWorkouts,
      completedWorkouts,
      completionRate: pct(completedWorkouts, plannedWorkouts),
      plannedDistanceKm: round1(plannedDistanceKm),
      completedDistanceKm: round1(completedDistanceKm),
      distanceVsGoalPercent: pct(completedDistanceKm, plannedDistanceKm),
      executionRatioPercent: pct(completedDistanceKm, prescribedOfCompletedKm),
      avgPaceSeconds,
      expectedPaceSeconds,

      frequencyActualDays,
      frequencyTargetDays,
      frequencyVsGoalPercent: pct(frequencyActualDays, frequencyTargetDays),

      totalDistanceKm: round1(totalDistanceKm),
      totalRunsInPeriod: activities.length,
      // Piso em 0: activities pode não cobrir um treino concluído manualmente
      // sem linha correspondente.
      freeRunDistanceKm: round1(
        Math.max(0, totalDistanceKm - completedDistanceKm),
      ),

      metricsDeltas: this.buildDeltas(
        activities,
        prevActivities,
        week.startStr,
      ),
      zoneDistribution,
      intensityAdherence,

      easyRunsMeasured: easyMeasured,
      easyRunsTooFast: easyTooFast,
    };
  }

  /**
   * Activities na janela da semana. Bounds cientes de São Paulo + filtro
   * pós-query pelo dia local, porque a janela em UTC sangra um dia nas bordas.
   * Mesmo padrão de StatsService.getPeriodSummary.
   */
  private async fetchActivitiesInWindow(
    userId: string,
    startStr: string,
    endStr: string,
  ): Promise<ActivityRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('activities')
      .select(
        'start_date, distance, moving_time, average_pace, calories, elevation_gain',
      )
      .eq('user_id', userId)
      .gte('start_date', `${startStr}T00:00:00-03:00`)
      .lte('start_date', `${endStr}T23:59:59-03:00`);

    if (error) {
      this.logger.warn(
        `[WeeklyInsight] fetchActivities falhou: ${error.message}`,
      );
      return [];
    }

    // Sem filtro por `type`: StatsService não filtra, e o filtro fazia o total
    // ficar menor que o do Calendário para linhas com `type` nulo.
    return ((data || []) as ActivityRow[]).filter((a) => {
      const day = toSaoPauloDateStr(a.start_date);
      return day >= startStr && day <= endStr;
    });
  }

  /** As 6 métricas, semana N vs N−1 do plano. */
  private buildDeltas(
    current: ActivityRow[],
    previous: ActivityRow[],
    startStr: string,
  ): Record<string, MetricPoint> {
    const km = (a: ActivityRow) => (a.distance || 0) / 1000;
    const min = (a: ActivityRow) => (a.moving_time || 0) / 60;

    return {
      distance: buildMetric(
        round2(sum(current, km)),
        round2(sum(previous, km)),
        sparkline7(current, startStr, km),
      ),
      frequency: buildMetric(
        current.length,
        previous.length,
        sparkline7(current, startStr, () => 1),
      ),
      pace: buildMetric(
        Math.round(weightedAvgPaceSeconds(current)),
        Math.round(weightedAvgPaceSeconds(previous)),
        sparkline7(
          current,
          startStr,
          (a) => paceValueToSecondsPerKm(a.average_pace) ?? 0,
        ),
      ),
      duration: buildMetric(
        Math.round(sum(current, min)),
        Math.round(sum(previous, min)),
        sparkline7(current, startStr, min),
      ),
      calories: buildMetric(
        Math.round(sum(current, (a) => a.calories || 0)),
        Math.round(sum(previous, (a) => a.calories || 0)),
        sparkline7(current, startStr, (a) => a.calories || 0),
      ),
      elevation: buildMetric(
        Math.round(sum(current, (a) => a.elevation_gain || 0)),
        Math.round(sum(previous, (a) => a.elevation_gain || 0)),
        sparkline7(current, startStr, (a) => a.elevation_gain || 0),
      ),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Zonas
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Distribuição por zona PRESCRITA (`metadata.zone`), não inferida do tipo.
   *
   * `WellnessService.buildZonesBlock` classifica por FC e, sem FC, cai num mapa
   * hardcoded de tipo→zona. Mas FC praticamente não existe nos dados, e
   * `metadata.zone` — escrita pela geração do plano, com o VDOT em mãos — está
   * preenchida em 100% dos treinos de plano. É informação melhor, e estava
   * sendo descartada.
   */
  private buildZoneDistribution(
    weekWorkouts: WorkoutRow[],
    completed: WorkoutRow[],
  ): {
    prescribed: Record<string, ZoneBucket>;
    executed: Record<string, ZoneBucket>;
  } {
    const empty = (): Record<string, ZoneBucket> => {
      const out: Record<string, ZoneBucket> = {};
      for (const z of ZONES) out[z] = { workouts: 0, km: 0, seconds: 0 };
      return out;
    };

    const prescribed = empty();
    for (const w of weekWorkouts) {
      const zone = this.zoneOf(w);
      if (!zone) continue;
      prescribed[zone].workouts += 1;
      prescribed[zone].km += num(w.distance_km);
    }

    const executed = empty();
    for (const w of completed) {
      const zone = this.zoneOf(w);
      if (!zone) continue;
      executed[zone].workouts += 1;
      executed[zone].km += num(w.distance_run ?? w.distance_km);
      executed[zone].seconds += num(w.time_run_seconds);
    }

    for (const z of ZONES) {
      prescribed[z].km = round1(prescribed[z].km);
      executed[z].km = round1(executed[z].km);
    }

    return { prescribed, executed };
  }

  private zoneOf(w: WorkoutRow): Zone | null {
    const raw = w.metadata?.zone;
    if (typeof raw !== 'string') return null;
    const upper = raw.toUpperCase();
    return (ZONES as readonly string[]).includes(upper)
      ? (upper as Zone)
      : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Aderência de intensidade
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Pace ESPERADO de um treino, em segundos/km, ponderado pela distância dos
   * segmentos de `instructions_json`.
   *
   * ── POR QUE PONDERADO, E NÃO O PACE DO SEGMENTO `main` ────────────────────
   *
   * `pace_seconds_per_km` é o pace da CORRIDA INTEIRA — inclui aquecimento e
   * volta à calma, que são lentos de propósito. Comparar esse número com o
   * `pace_min` do segmento principal faria todo mundo parecer mais lento do que
   * correu. O ponderado por distância é a única comparação apples-to-apples.
   *
   * ── POR QUE NÃO `workouts.target_pace_seconds` ────────────────────────────
   *
   * Aquela coluna é NULL em todo treino de plano — só é preenchida para
   * `source='manual'` (está no COMMENT da coluna, e produção confirma). O pace
   * prescrito de um treino de plano vive em `instructions_json`.
   *
   * Segmentos com `pace_min` inutilizável (walk/run grava `pace_min: 0`) ficam
   * FORA do numerador e do denominador. Um treino sem nenhum segmento
   * aproveitável devolve `null` e não entra na agregação — é correto: não havia
   * pace prescrito para comparar.
   *
   * ── OS DOIS FORMATOS DE SEGMENTO ──────────────────────────────────────────
   *
   * `instructions_json` tem duas formas, e a geração escolhe pelo tipo do treino
   * (ver o schema em `training-ai.service.ts`):
   *
   *   simples  { type: 'warmup'|'main'|'cooldown', distance_km OU duration_seconds,
   *              pace_min, pace_max, zone }
   *   repeat   { type: 'repeat', reps: N,
   *              work:     { distance_km OU duration_seconds, pace_min, ... },
   *              recovery: { distance_km OU duration_seconds, pace_min, ... } }
   *
   * O `repeat` NÃO tem `distance_km` nem `pace_min` no topo — eles vivem dentro
   * de `work`/`recovery`, e valem `reps` vezes cada. Até 2026-08-06 esta função
   * procurava `seg.repeat.work` (chave que o schema nunca produziu) e exigia
   * `distance_km` no topo do bloco: o resultado era o MIOLO DE QUALIDADE INTEIRO
   * ser descartado, sobrando só aquecimento e volta à calma. Um intervalado
   * estruturado saía com pace esperado idêntico ao de uma rodagem leve, e a
   * aderência de Z4/Z5 media o esforço duro com régua de easy.
   *
   * ── DISTÂNCIA × TEMPO ─────────────────────────────────────────────────────
   *
   * Todo sub-bloco tem EXATAMENTE um entre `distance_km` e `duration_seconds`.
   * O ponderado é sempre Σtempo ÷ Σdistância; um sub-bloco por tempo entra
   * convertendo com o próprio pace prescrito (90 s a 7:39/km = 0,196 km). Sem
   * isso, as recuperações e os aquecimentos por tempo — que o prompt PREFERE —
   * sumiriam do denominador, e o esperado ficaria mais rápido que a corrida que
   * ele descreve, justo na direção que faz o atleta parecer melhor do que foi.
   */
  expectedPaceForWorkout(w: WorkoutRow): number | null {
    const segments = Array.isArray(w.instructions_json)
      ? (w.instructions_json as Array<Record<string, unknown>>)
      : [];
    if (segments.length === 0) return null;

    let seconds = 0;
    let distance = 0;

    /** Acumula um sub-bloco `times` vezes. Sem pace utilizável, não entra. */
    const addEffort = (raw: unknown, times = 1): void => {
      if (!raw || typeof raw !== 'object') return;
      const effort = raw as Record<string, unknown>;

      const paceSec = paceValueToSecondsPerKm(
        effort.pace_min as number | undefined,
      );
      if (paceSec == null || paceSec <= 0) return;

      const km = num(effort.distance_km as number | string | null);
      if (km > 0) {
        distance += km * times;
        seconds += km * paceSec * times;
        return;
      }

      const sec = num(effort.duration_seconds as number | string | null);
      if (sec > 0) {
        distance += (sec / paceSec) * times;
        seconds += sec * times;
      }
    };

    for (const seg of segments) {
      if (seg.type === 'repeat') {
        // `Math.max(1, ...)` espelha `segmentEngine.buildSegSteps` no mobile —
        // o motor que EXECUTA o treino. As duas contagens de reps têm de ser a
        // mesma, senão o esperado descreve um treino diferente do realizado.
        const reps = Math.max(1, Math.round(num(seg.reps as number) || 1));
        addEffort(seg.work, reps);
        addEffort(seg.recovery, reps);
        continue;
      }
      addEffort(seg);
    }

    if (distance <= 0) return null;
    return Math.round(seconds / distance);
  }

  /** Pace esperado médio da semana (ponderado pelos treinos concluídos). */
  private weekExpectedPaceSeconds(completed: WorkoutRow[]): number {
    const values = completed
      .map((w) => this.expectedPaceForWorkout(w))
      .filter((v): v is number => v != null);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }

  /**
   * Cruza pace prescrito × executado por zona.
   *
   * `easyMeasured`/`easyTooFast` contam SÓ Z1/Z2 — é onde correr mais rápido que
   * o alvo é erro inequívoco. Num Z4, correr rápido é o objetivo do treino, e
   * incluí-lo faria o cue de intensidade disparar em quem executou bem.
   */
  private buildIntensityAdherence(completed: WorkoutRow[]): {
    buckets: Record<string, IntensityBucket>;
    easyMeasured: number;
    easyTooFast: number;
  } {
    const acc: Record<
      string,
      { expected: number[]; actual: number[]; faster: number }
    > = {};
    let easyMeasured = 0;
    let easyTooFast = 0;

    for (const w of completed) {
      const zone = this.zoneOf(w);
      if (!zone) continue;

      const expected = this.expectedPaceForWorkout(w);
      const actual = num(w.pace_seconds_per_km);
      if (expected == null || actual <= 0) continue;

      if (!acc[zone]) acc[zone] = { expected: [], actual: [], faster: 0 };
      acc[zone].expected.push(expected);
      acc[zone].actual.push(actual);

      const tooFast = actual <= expected - EASY_PACE_TOLERANCE_SEC;
      if (tooFast) acc[zone].faster += 1;

      if (EASY_ZONES.has(zone)) {
        easyMeasured += 1;
        if (tooFast) easyTooFast += 1;
      }
    }

    const buckets: Record<string, IntensityBucket> = {};
    for (const [zone, v] of Object.entries(acc)) {
      const avgExpected = avg(v.expected);
      const avgActual = avg(v.actual);
      buckets[zone] = {
        n: v.expected.length,
        avgExpectedSec: Math.round(avgExpected),
        avgActualSec: Math.round(avgActual),
        avgDeltaSec: Math.round(avgActual - avgExpected),
        fasterCount: v.faster,
      };
    }

    return { buckets, easyMeasured, easyTooFast };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Narrativa
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * A voz do coach. Recebe métricas e reajuste JÁ DECIDIDOS e só narra.
   *
   * Nunca derruba a geração: sem chave de API, com erro de rede ou com resposta
   * inutilizável, cai para um texto determinístico montado a partir dos mesmos
   * números.
   */
  private async generateNarrative(
    userId: string,
    metrics: PlanWeekMetrics,
    adjustment: SuggestedAdjustment,
  ): Promise<string> {
    if (!this.aiRouter.isAvailable)
      return this.fallbackNarrative(metrics, adjustment);

    const systemPrompt = `Você é um treinador de corrida da RunEasy comentando UMA semana de treino.

REGRAS INVIOLÁVEIS:
- Os números e a recomendação abaixo JÁ ESTÃO DECIDIDOS. Você NÃO recalcula, NÃO contradiz e NÃO propõe outra recomendação.
- Cite pelo menos dois números reais que recebeu.
- 2 a 3 frases, segunda pessoa, português do Brasil, tom direto e sem bajulação.
- Responda APENAS com JSON válido: {"narrative": "..."}`;

    const zonesLine = Object.entries(metrics.intensityAdherence)
      .map(
        ([z, b]) =>
          `${z}: ${b.n} treino(s), prescrito ${fmtPace(b.avgExpectedSec)}, executado ${fmtPace(b.avgActualSec)} (${b.avgDeltaSec > 0 ? '+' : ''}${b.avgDeltaSec}s/km)`,
      )
      .join('\n  ');

    const userPrompt = `SEMANA ${metrics.weekNumber} DO PLANO (${metrics.weekStart} a ${metrics.weekEnd})

ADERÊNCIA:
- Treinos: ${metrics.completedWorkouts} de ${metrics.plannedWorkouts} concluídos (${metrics.completionRate}%)
- Dias treinados: ${metrics.frequencyActualDays} (meta: ${metrics.frequencyTargetDays}/semana)
- Distância do plano: ${metrics.completedDistanceKm} km de ${metrics.plannedDistanceKm} km prescritos
- Nos treinos que fez, cumpriu ${metrics.executionRatioPercent}% da distância prescrita

TOTAL CORRIDO (inclui corrida livre, fora do plano):
- ${metrics.totalDistanceKm} km em ${metrics.totalRunsInPeriod} corrida(s); ${metrics.freeRunDistanceKm} km fora do plano

RITMO POR ZONA:
  ${zonesLine || '(sem treino com pace prescrito e executado)'}

RECOMENDAÇÃO JÁ DECIDIDA: ${ADJUSTMENT_LABELS[adjustment.code]} (motivo: ${adjustment.reason})

Escreva a narrativa explicando o que aconteceu na semana e por que essa é a recomendação.`;

    try {
      const result = await this.aiRouter.call<{ narrative: string }>({
        featureName: AI_FEATURES.WEEKLY_INSIGHT,
        userId,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 500,
      });

      const narrative = result.data?.narrative;
      if (typeof narrative === 'string' && narrative.trim().length > 0) {
        return narrative.trim();
      }
      this.logger.warn('[WeeklyInsight] IA devolveu narrativa vazia');
    } catch (err) {
      this.logger.error('[WeeklyInsight] Narrativa via IA falhou:', err);
    }

    return this.fallbackNarrative(metrics, adjustment);
  }

  /** Texto determinístico — mesmos números, sem rede. */
  private fallbackNarrative(
    metrics: PlanWeekMetrics,
    adjustment: SuggestedAdjustment,
  ): string {
    const parts: string[] = [];

    if (metrics.completedWorkouts === 0) {
      parts.push(
        `Na semana ${metrics.weekNumber} você não concluiu nenhum dos ${metrics.plannedWorkouts} treinos previstos.`,
      );
    } else {
      parts.push(
        `Na semana ${metrics.weekNumber} você concluiu ${metrics.completedWorkouts} de ${metrics.plannedWorkouts} treinos (${metrics.completionRate}%), somando ${metrics.completedDistanceKm} km do plano.`,
      );
    }

    if (metrics.freeRunDistanceKm > 0) {
      parts.push(
        `Fora do plano você correu mais ${metrics.freeRunDistanceKm} km.`,
      );
    }

    parts.push(
      `Sugestão para a próxima: ${ADJUSTMENT_LABELS[adjustment.code]}.`,
    );
    return parts.join(' ');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Notificação
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * ESTE SERVICE É O DONO DA NOTIFICAÇÃO — o cron não envia nada.
   *
   * Mesmo motivo estrutural da Fase 1A: o endpoint manual chama a geração
   * direto, sem passar pelo cron. Se o dono fosse o cron, geração manual não
   * notificaria ninguém; e se ambos enviassem, cada insight geraria dois pushes
   * (foi exatamente o bug que a 1A corrigiu na retrospectiva).
   */
  private async sendWeeklyInsightNotification(
    userId: string,
    insightId: string,
    planId: string,
    weekNumber: number,
  ): Promise<void> {
    const TITLE = `Semana ${weekNumber} fechada 📊`;
    const BODY =
      'Seu resumo da semana está pronto, com o que ajustar na próxima.';

    try {
      const created = await this.notificationService.createNotification(
        userId,
        'weekly_insight',
        TITLE,
        BODY,
        {
          weeklyInsightId: insightId,
          planId,
          weekNumber,
          screen: 'WeeklyInsight',
        },
      );
      if (!created) {
        this.logger.warn('[WeeklyInsight] createNotification devolveu null');
      }

      await this.notificationService.sendPushNotification(
        userId,
        TITLE,
        BODY,
        {
          type: 'weekly_insight',
          screen: 'WeeklyInsight',
          weeklyInsightId: insightId,
          weekNumber,
        },
        { channelId: 'reminders' },
      );
    } catch (err) {
      // Falha de notificação nunca derruba a geração — o insight já está gravado.
      this.logger.error('[WeeklyInsight] Erro notificando:', err);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Leitura + gatilho manual
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Último insight concluído — a ÚNICA seleção que o app usa.
   *
   * ── POR QUE NÃO EXISTE UM "getUnseen" ────────────────────────────────────
   *
   * Existia, e produzia um bug: ele buscava o mais recente ENTRE OS NÃO VISTOS.
   * Com a semana 2 já lida e a semana 1 (zerada) nunca aberta, o modal voltava
   * para a semana 1 — mostrando 0 km como se fosse novidade.
   *
   * A regra certa é "a semana fechada mais recente, e o modal só aparece se ELA
   * ainda não foi vista". Semana antiga não vista é histórico, não notificação.
   * Como isso é uma pergunta sobre a MESMA linha que o card já usa, o app
   * deriva de `seen_at` daqui em vez de pedir uma segunda seleção — assim card
   * e modal não têm como discordar.
   *
   * Ordena por `week_end` e não por `week_number`: entre planos diferentes o
   * número reinicia, a data não.
   */
  async getLatest(userId: string): Promise<WeeklyInsightRow | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_week_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('week_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(`[WeeklyInsight] getLatest falhou: ${error.message}`);
      return null;
    }
    return (data as WeeklyInsightRow | null) ?? null;
  }

  /**
   * Gatilho manual: gera para a última semana FECHADA e elegível do plano ativo.
   * Existe para validação em staging e para a UI poder forçar um retry.
   *
   * Aplica as mesmas regras do cron — última semana suprimida, cutoff, dedupe —
   * exceto que aqui só a semana mais recente elegível é processada.
   */
  async generateLatestClosedWeek(userId: string): Promise<{
    generated: boolean;
    weekNumber: number | null;
    insightId: string | null;
    reason?: string;
  }> {
    const supabase = this.supabaseService.getClient();
    const today = this.saoPauloTodayStr();

    const { data: planRow } = await supabase
      .from('training_plans')
      .select('id, frequency_per_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const plan = planRow as Pick<
      ActivePlanRow,
      'id' | 'frequency_per_week'
    > | null;
    if (!plan) {
      return {
        generated: false,
        weekNumber: null,
        insightId: null,
        reason: 'no_active_plan',
      };
    }

    const workouts = await this.fetchPlanWorkouts(plan.id);
    const weeks = derivePlanWeeks(workouts).filter(
      (w) => w.source === 'workouts',
    );
    if (weeks.length === 0) {
      return {
        generated: false,
        weekNumber: null,
        insightId: null,
        reason: 'no_workouts',
      };
    }

    const { data: existingRows } = await supabase
      .from('plan_week_insights')
      .select('week_number')
      .eq('plan_id', plan.id);
    const existing = new Set(
      (existingRows || []).map((r: { week_number: number }) => r.week_number),
    );

    const lastWeekNumber = weeks[weeks.length - 1].weekNumber;
    const eligible = weeks
      .filter(
        (w) =>
          w.weekNumber !== lastWeekNumber &&
          isPlanFinished(w, today) &&
          w.endStr >= this.startDate &&
          !existing.has(w.weekNumber),
      )
      .pop();

    if (!eligible) {
      return {
        generated: false,
        weekNumber: null,
        insightId: null,
        reason: 'no_eligible_week',
      };
    }

    const insight = await this.generateForWeek(
      userId,
      plan.id,
      eligible,
      weeks,
      workouts,
      plan.frequency_per_week,
    );

    return {
      generated: insight !== null,
      weekNumber: eligible.weekNumber,
      insightId: insight?.id ?? null,
      reason: insight ? undefined : 'generation_failed',
    };
  }

  /** Marca o insight como visto — desliga o modal de entrada, mantém o card. */
  async markSeen(userId: string, insightId: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('plan_week_insights')
      .update({ seen_at: new Date().toISOString() })
      .eq('id', insightId)
      // Filtrar por user_id no próprio UPDATE — sem isso, um id vazado
      // permitiria carimbar o insight de outra pessoa.
      .eq('user_id', userId)
      .is('seen_at', null)
      .select('id');

    if (error) {
      this.logger.warn(`[WeeklyInsight] markSeen falhou: ${error.message}`);
      return false;
    }
    // Zero linhas = já estava visto (ou não é dele). Idempotente de propósito.
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Aplica o reajuste de CLASSE `schedule` — re-ancora o plano a partir de hoje.
   *
   * ── POR QUE SÓ `schedule` ─────────────────────────────────────────────────
   *
   * `schedule` mexe só em data/status, e `plan_json` não guarda nem uma nem
   * outra — não há o que dessincronizar. `prescription` mexeria em volume/pace
   * prescritos, que seria o primeiro write a divergir `plan_json` de `workouts`;
   * isso é Fase 6. Este método RECUSA `prescription`, e não é defensivo por
   * excesso de zelo: é a diferença entre um conselho e uma cirurgia.
   *
   * ── REPETIR × ADIAR ───────────────────────────────────────────────────────
   *
   * `repetir_semana` passa `week_start` como `reclaimFromDate`, porque a semana
   * repetida tem treinos concluídos NO MEIO dela: sem abrir a fronteira, uma
   * sessão perdida na terça ficaria para trás quando a quarta foi cumprida.
   * `adiar_semana` só dispara em semana zerada, onde a fronteira já está na
   * semana anterior e tudo entra naturalmente.
   */
  async applyScheduleAdjustment(
    userId: string,
    insightId: string,
  ): Promise<{
    applied: boolean;
    reason?: string;
    code?: string;
    shifted?: number;
    deltaDays?: number;
  }> {
    const supabase = this.supabaseService.getClient();

    const { data: row } = await supabase
      .from('plan_week_insights')
      .select(
        'id, plan_id, user_id, week_start, week_number, status, suggested_adjustment, adjustment_applied_at',
      )
      .eq('id', insightId)
      .eq('user_id', userId)
      .maybeSingle();

    const insight = row as
      | (Pick<
          WeeklyInsightRow,
          'id' | 'plan_id' | 'week_start' | 'week_number' | 'status'
        > & {
          suggested_adjustment: SuggestedAdjustment | null;
          adjustment_applied_at: string | null;
        })
      | null;

    if (!insight) return { applied: false, reason: 'not_found' };
    if (insight.status !== 'completed') {
      return { applied: false, reason: 'not_completed' };
    }
    if (insight.adjustment_applied_at) {
      // Trava de idempotência: a ação move o calendário inteiro, e um segundo
      // toque empurraria o plano mais uma semana.
      return { applied: false, reason: 'already_applied' };
    }

    const adjustment = insight.suggested_adjustment;
    if (!adjustment || adjustment.class !== 'schedule') {
      return {
        applied: false,
        reason: 'not_actionable',
        code: adjustment?.code,
      };
    }

    // Repetir precisa reabrir a fronteira na semana repetida; adiar não.
    const reclaimFrom =
      adjustment.code === 'repetir_semana' ? insight.week_start : undefined;

    const result = await this.trainingService.reanchorRemainingWorkoutsToToday(
      userId,
      insight.plan_id,
      reclaimFrom,
    );

    if (result.shifted === 0) {
      // Nada a mover: o plano já retoma no futuro. Não carimba, para o usuário
      // poder tentar de novo quando a situação mudar.
      return {
        applied: false,
        reason: 'nothing_to_shift',
        code: adjustment.code,
        shifted: 0,
        deltaDays: result.deltaDays,
      };
    }

    await supabase
      .from('plan_week_insights')
      .update({ adjustment_applied_at: new Date().toISOString() })
      .eq('id', insightId);

    this.logger.log(
      `[WeeklyInsight] ${adjustment.code} aplicado no plano ${insight.plan_id}: ${result.shifted} treino(s) +${result.deltaDays}d`,
    );

    return {
      applied: true,
      code: adjustment.code,
      shifted: result.shifted,
      deltaDays: result.deltaDays,
    };
  }

  private mapRow(
    row: WeeklyInsightRow,
    metrics: PlanWeekMetrics,
    adjustment: SuggestedAdjustment,
  ): WeeklyInsight {
    return {
      id: row.id,
      planId: row.plan_id,
      weekNumber: row.week_number,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      metrics,
      suggestedAdjustment: adjustment,
      aiNarrative: row.ai_narrative ?? null,
      status: row.status,
      createdAt: row.created_at,
      processedAt: row.processed_at ?? null,
      notifiedAt: row.notified_at ?? null,
    };
  }
}

// ── Utilitários locais ───────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentual inteiro, com guarda de divisão por zero. */
function pct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function fmtPace(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
