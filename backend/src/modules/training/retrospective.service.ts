import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { TrainingService } from './training.service';
import { TrainingPlanRequest } from './training-ai.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';
import { paceValueToSecondsPerKm } from '../../common/pace-calculator';
import {
  derivePlanWindow,
  isPlanFinished,
  findLongestRun,
} from './helpers/plan-window.helper';
import { toSaoPauloDateStr } from './wellness/helpers/streak.helper';
import { resolveTargetFrequency } from './wellness/helpers/metrics.helper';

/**
 * Métricas do ciclo, em DOIS blocos que nunca se somam.
 *
 * ── ADERÊNCIA AO PLANO × TOTAL CORRIDO ────────────────────────────────────────
 *
 * Até a Fase 1A havia um só bloco, e ele misturava as duas coisas: o numerador
 * vinha de TODAS as `activities` do período (inclusive corrida livre) e o
 * denominador só do plano. Quem corresse por fora inflava a própria aderência.
 *
 * O escopo do plano não pode passar por `activities` — aquela tabela não tem
 * `plan_id`, só `workout_id`. A rota correta é `workouts`, que tem `plan_id` e
 * carrega as colunas de execução (`distance_run`, `time_run_seconds`) gravadas
 * na conclusão. Corrida livre grava `plan_id: null`, então o escopo a exclui
 * por construção.
 *
 * Os dois números continuam sendo mostrados — separados, e ambos vão para o
 * prompt da IA, que pode dizer "você correu 70 km, mas só 30 entraram no plano"
 * em vez de esconder a diferença atrás de um percentual.
 */
export interface RetrospectiveMetrics {
  // ── Aderência ao plano (escopo: workouts.plan_id = planId) ──
  totalDistancePlannedKm: number;
  /** Km executados DENTRO do plano. Numerador de `distanceVsGoalPercent`. */
  planDistanceCompletedKm: number;
  distanceVsGoalPercent: number;

  /** Σ time_run_seconds ÷ Σ distance_run dos treinos do plano concluídos. */
  avgPaceSeconds: number;
  targetPaceSeconds: number;
  paceVsGoalPercent: number;

  totalWorkoutsCompleted: number;
  totalWorkoutsPlanned: number;
  completionRate: number;

  /** Cadência semanal real vs. a declarada. Distinta de `completionRate`. */
  frequencyActualPerWeek: number;
  frequencyTargetPerWeek: number;
  frequencyVsGoalPercent: number;

  // ── Total corrido no período (escopo: tudo, inclusive corrida livre) ──
  /** NOME MANTIDO: continua significando "tudo o que correu no período". */
  totalDistanceKm: number;
  totalRunsInPeriod: number;
  freeRunDistanceKm: number;

  /**
   * Maior distância de UMA ÚNICA corrida no ciclo — o clímax da retrospectiva.
   *
   * Escopo deliberadamente DIFERENTE do resto do bloco de aderência: conta
   * TODAS as corridas da janela, do plano e livres. Recorde é conquista
   * pessoal, não medida de cumprimento de plano — quem bateu o recorde numa
   * corrida livre bateu o recorde do mesmo jeito.
   */
  longestRunKm: number;
  /** Dia (São Paulo) do recorde. `null` quando não houve corrida no período. */
  longestRunDate: string | null;

  // ── Contexto ──
  avgReadinessScore: number;
  readinessCheckIns: number;
  planWindowStart: string;
  planWindowEnd: string;
}

/**
 * AI-generated content for the retrospective
 */
export interface AIRetrospectiveContent {
  insights: string;
  suggestedNextGoal: string;
  suggestedNextGoalType: string;
}

/**
 * Complete retrospective data
 */
export interface Retrospective {
  id: string;
  userId: string;
  planId: string;

  // Metrics
  totalDistanceKm: number;
  totalWorkoutsCompleted: number;
  totalWorkoutsPlanned: number;
  avgPaceSeconds: number;
  targetPaceSeconds: number;
  completionRate: number;

  // Aderência ao plano (ver RetrospectiveMetrics)
  totalDistancePlannedKm: number;
  planDistanceCompletedKm: number;
  freeRunDistanceKm: number;
  totalRunsInPeriod: number;
  /** Maior corrida única do ciclo (plano OU livre) — o clímax dos stories. */
  longestRunKm: number;
  longestRunDate: string | null;
  frequencyActualPerWeek: number;
  frequencyTargetPerWeek: number;
  planWindowStart: string | null;
  planWindowEnd: string | null;

  // Comparisons
  distanceVsGoalPercent: number;
  paceVsGoalPercent: number;
  frequencyVsGoalPercent: number;

  // AI Content
  aiInsights: string;
  suggestedNextGoal: string;
  suggestedNextGoalType: string;

  /** Rótulo PT-BR da meta do ciclo ("10 Km", "Meia Maratona", nome da prova). */
  planGoalLabel: string | null;
  /** Duração do plano em semanas — contexto do card de abertura. */
  planDurationWeeks: number | null;

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  processedAt: string | null;
}

/** Rótulos PT-BR das metas de distância. Espelha os labels do TrainingAIService. */
const GOAL_LABELS: Record<string, string> = {
  '5k': '5 Km',
  '10k': '10 Km',
  half_marathon: 'Meia Maratona',
  marathon: 'Maratona',
  general_fitness: 'Condicionamento',
};

export interface CustomizePlanDto {
  distance_goal: string;
  time_goal: string;
  duration_weeks: number;
  training_days: string[]; // ['Dom', 'Seg'...]
  intense_day?: string;
  target_pace: string;
}

@Injectable()
export class RetrospectiveService {
  private readonly logger = new Logger(RetrospectiveService.name);
  private readonly hasAIRouter: boolean;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => TrainingService))
    private readonly trainingService: TrainingService,
    private readonly aiRouter: AIRouterService,
  ) {
    this.hasAIRouter = this.aiRouter.isAvailable;
  }

  /**
   * Get São Paulo date for consistent timezone handling
   * Uses Intl.DateTimeFormat for correct DST handling
   */
  private getSaoPauloToday(): { date: Date; dateStr: string } {
    const now = new Date();

    // Use Intl.DateTimeFormat for proper timezone conversion (handles DST automatically)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // en-CA locale gives us YYYY-MM-DD format directly
    const dateStr = formatter.format(now);

    const date = new Date(`${dateStr}T00:00:00`);
    this.logger.debug(`[Retrospective] São Paulo today: ${dateStr}`);
    return { date, dateStr };
  }

  /**
   * Check for plans that have ended and need retrospective generation
   * Called by scheduler at midnight São Paulo time
   * Returns array of {userId, retroId} for notification dispatch
   */
  async checkForCompletedPlans(): Promise<
    Array<{ userId: string; retroId: string }>
  > {
    const { dateStr: today } = this.getSaoPauloToday();
    this.logger.log(
      `[Retrospective] Checking for completed plans on ${today} (São Paulo)`,
    );

    const generatedRetros: Array<{ userId: string; retroId: string }> = [];

    try {
      const supabase = this.supabaseService.getClient();

      // Find active plans where end_date has passed
      // Also check that no retrospective already exists for this plan
      const { data: activePlans, error } = await supabase
        .from('training_plans')
        .select('id, user_id, created_at, duration_weeks')
        .eq('status', 'active');

      if (error) {
        this.logger.error('[Retrospective] Error fetching plans:', error);
        return generatedRetros;
      }

      // Pause plan aging for owners who are not currently Pro. A lapsed/Free
      // user's plan must not auto-complete + spawn a retrospective in the
      // background while they aren't paying — its remaining workouts are
      // re-anchored when they reactivate (TrainingService.reanchorPendingWorkoutsToToday).
      // handleExpiration() already downgrades plan→'free', so gating on
      // subscription_plan='pro' is enough (covers cancelled-but-active too).
      const planUserIds = Array.from(
        new Set((activePlans || []).map((p) => p.user_id)),
      );
      const proUserIds = new Set<string>();
      if (planUserIds.length > 0) {
        const { data: subs } = await supabase
          .from('users')
          .select('id, subscription_plan')
          .in('id', planUserIds);
        for (const u of subs || []) {
          if ((u.subscription_plan ?? 'free') === 'pro') proUserIds.add(u.id);
        }
      }

      // Check each plan to see if it has ended and needs retrospective
      for (const plan of activePlans || []) {
        if (!proUserIds.has(plan.user_id)) {
          continue; // owner not Pro — freeze the plan instead of completing it
        }

        // Check if retrospective already exists
        const { data: existingRetro } = await supabase
          .from('plan_retrospectives')
          .select('id')
          .eq('plan_id', plan.id)
          .maybeSingle();

        if (existingRetro) {
          continue; // Skip if retrospective already exists
        }

        // Fim do plano derivado do ÚLTIMO TREINO AGENDADO, não de
        // `created_at + duration_weeks*7`. A re-âncora empurra
        // `workouts.scheduled_date` sem tocar em `created_at`, então a fórmula
        // antiga marcava como "terminado" um plano cujos treinos ainda estavam
        // no futuro. Ver plan-window.helper.ts.
        const { data: lastWorkout } = await supabase
          .from('workouts')
          .select('scheduled_date')
          .eq('plan_id', plan.id)
          .order('scheduled_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Só `endStr` é consumido aqui — passar apenas o último treino deixa
        // `startStr`/`weeks` sem significado, e é de propósito: o gatilho não
        // precisa deles. `calculateMetrics` monta a janela completa.
        const window = derivePlanWindow(
          { created_at: plan.created_at, duration_weeks: plan.duration_weeks },
          lastWorkout?.scheduled_date ? [lastWorkout.scheduled_date] : [],
        );

        if (isPlanFinished(window, today)) {
          this.logger.log(
            `[Retrospective] Plan ${plan.id} has ended (${window.endStr}, source=${window.source}), generating retrospective...`,
          );
          const retro = await this.generateRetrospective(plan.user_id, plan.id);
          if (retro) {
            generatedRetros.push({ userId: plan.user_id, retroId: retro.id });
          }
        }
      }
    } catch (error) {
      this.logger.error(
        '[Retrospective] Error in checkForCompletedPlans:',
        error,
      );
    }

    return generatedRetros;
  }

  /**
   * Gera a retrospectiva completa de um plano.
   *
   * IDEMPOTÊNCIA: `plan_retrospectives` tem `UNIQUE (plan_id)`. Uma segunda
   * chamada para o mesmo plano falha no INSERT abaixo e retorna `null` ANTES de
   * chegar à notificação — é essa constraint, e não um dedupe em código, que
   * garante um único push por plano.
   *
   * ESTE MÉTODO É O DONO DA NOTIFICAÇÃO. O cron não envia nada (ver
   * training-scheduler.service.ts): os dois gatilhos — cron e o endpoint manual
   * `POST /training/retrospective/generate` — passam por aqui, então centralizar
   * o envio aqui é o que garante disparo único E notificação na geração manual.
   */
  async generateRetrospective(
    userId: string,
    planId: string,
  ): Promise<Retrospective | null> {
    this.logger.log(
      `[Retrospective] Starting generation for user ${userId}, plan ${planId}`,
    );

    const supabase = this.supabaseService.getClient();

    // Placeholder. Se algo falhar daqui pra frente, ele PRECISA ser removido —
    // a checagem de existência em checkForCompletedPlans ignora `status`, então
    // uma linha 'processing' órfã bloquearia o plano para sempre.
    const { data: retro, error: createError } = await supabase
      .from('plan_retrospectives')
      .insert({
        user_id: userId,
        plan_id: planId,
        status: 'processing',
      })
      .select()
      .single();

    if (createError || !retro) {
      this.logger.error(
        '[Retrospective] Failed to create record:',
        createError,
      );
      return null;
    }

    try {
      const metrics = await this.calculateMetrics(userId, planId);
      this.logger.log(
        `[Retrospective] Metrics calculated:`,
        JSON.stringify(metrics),
      );

      const aiContent = await this.generateAIInsights(metrics, userId);
      this.logger.log(`[Retrospective] AI content generated`);

      const { data: updated, error: updateError } = await supabase
        .from('plan_retrospectives')
        .update({
          // Total corrido no período (inclui corrida livre)
          total_distance_km: metrics.totalDistanceKm,
          total_runs_in_period: metrics.totalRunsInPeriod,
          free_run_distance_km: metrics.freeRunDistanceKm,
          longest_run_km: metrics.longestRunKm,
          longest_run_date: metrics.longestRunDate,
          // Aderência ao plano
          total_distance_planned_km: metrics.totalDistancePlannedKm,
          plan_distance_completed_km: metrics.planDistanceCompletedKm,
          total_workouts_completed: metrics.totalWorkoutsCompleted,
          total_workouts_planned: metrics.totalWorkoutsPlanned,
          avg_pace_seconds: metrics.avgPaceSeconds,
          target_pace_seconds: metrics.targetPaceSeconds,
          completion_rate: this.clampPercent(metrics.completionRate),
          distance_vs_goal_percent: this.clampPercent(
            metrics.distanceVsGoalPercent,
          ),
          pace_vs_goal_percent: this.clampPercent(metrics.paceVsGoalPercent),
          frequency_vs_goal_percent: this.clampPercent(
            metrics.frequencyVsGoalPercent,
          ),
          frequency_actual_per_week: metrics.frequencyActualPerWeek,
          frequency_target_per_week: metrics.frequencyTargetPerWeek,
          // Janela efetivamente usada (respeita a re-âncora)
          plan_window_start: metrics.planWindowStart,
          plan_window_end: metrics.planWindowEnd,
          // Conteúdo da IA
          ai_insights: aiContent.insights,
          suggested_next_goal: aiContent.suggestedNextGoal,
          suggested_next_goal_type: aiContent.suggestedNextGoalType,
          status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', retro.id)
        .select()
        .single();

      if (updateError || !updated) {
        this.logger.error(
          '[Retrospective] Failed to update record:',
          updateError,
        );
        await this.deleteOrphanRetro(retro.id);
        return null;
      }

      // Encerra o plano. `completed_at` datou o fim do ciclo — antes ficava
      // NULL, e é o campo que as Fases 2/4 usam para ordenar ciclos.
      await supabase
        .from('training_plans')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', planId);

      await this.sendRetrospectiveNotification(userId, updated.id);

      this.logger.log(
        `[Retrospective] Successfully generated for plan ${planId}`,
      );
      return this.mapToRetrospective(updated);
    } catch (error) {
      this.logger.error('[Retrospective] Error generating:', error);
      await this.deleteOrphanRetro(retro.id);
      return null;
    }
  }

  /**
   * Remove o placeholder 'processing' quando a geração falha. Sem isso o plano
   * fica envenenado: `checkForCompletedPlans` só verifica a EXISTÊNCIA da linha
   * (ignora `status`), então uma falha transitória de IA/rede impediria qualquer
   * nova tentativa para sempre.
   */
  private async deleteOrphanRetro(retroId: string): Promise<void> {
    try {
      await this.supabaseService
        .getClient()
        .from('plan_retrospectives')
        .delete()
        .eq('id', retroId);
      this.logger.log(
        `[Retrospective] Cleaned up orphan placeholder ${retroId}`,
      );
    } catch (err) {
      this.logger.error(
        `[Retrospective] FAILED to clean up placeholder ${retroId} — this plan is now blocked from retrying`,
        err,
      );
    }
  }

  /**
   * Guarda de persistência dos percentuais. As colunas são `numeric(7,2)`
   * (alargadas de 5,2 na Fase 1A), então o teto é 99999.99; um valor acima
   * abortaria o UPDATE inteiro com erro 22003.
   *
   * NÃO é o cap de EXIBIÇÃO — mostrar "9999%" numa tela é problema de UI e fica
   * para a Fase 1B. Aqui só se garante que o dado entra no banco.
   */
  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-9999, Math.min(9999, value));
  }

  /**
   * Calcula as métricas do ciclo em dois blocos independentes: ADERÊNCIA AO
   * PLANO (só `workouts` do plano) e TOTAL CORRIDO no período (todas as
   * `activities` da janela). Ver a nota extensa em `RetrospectiveMetrics`.
   *
   * A janela vem de `derivePlanWindow`, não de `created_at + duration_weeks*7`
   * — assim ela acompanha a re-âncora (ver plan-window.helper.ts).
   */
  private async calculateMetrics(
    userId: string,
    planId: string,
  ): Promise<RetrospectiveMetrics> {
    const supabase = this.supabaseService.getClient();

    const { data: plan } = await supabase
      .from('training_plans')
      .select('created_at, duration_weeks, frequency_per_week')
      .eq('id', planId)
      .single();

    // Todos os treinos do plano — a fonte da aderência E das datas da janela.
    const { data: workoutsRaw } = await supabase
      .from('workouts')
      .select('*')
      .eq('plan_id', planId);
    const workouts = workoutsRaw ?? [];

    // Janela efetiva. Sem query extra: os `scheduled_date` já vieram acima.
    const window = derivePlanWindow(
      {
        created_at: plan?.created_at ?? new Date().toISOString(),
        duration_weeks: plan?.duration_weeks ?? null,
      },
      workouts.map((w) => w.scheduled_date as string),
    );

    // ── Bloco 1 — ADERÊNCIA AO PLANO ────────────────────────────────────────
    const totalWorkoutsPlanned = workouts.length;
    const completedWorkouts = workouts.filter((w) => w.status === 'completed');
    const totalWorkoutsCompleted = completedWorkouts.length;

    const totalDistancePlannedKm = workouts.reduce(
      (sum, w) => sum + (Number(w.distance_km) || 0),
      0,
    );

    // `distance_run` é gravado na conclusão; `distance_km` (o planejado) é o
    // fallback para linhas legadas concluídas antes daquela coluna existir —
    // mesmo padrão de StatsService.getPeriodSummary (scope=workouts).
    const planDistanceCompletedKm = completedWorkouts.reduce(
      (sum, w) => sum + (Number(w.distance_run ?? w.distance_km) || 0),
      0,
    );

    // Pace do PLANO (não de tudo que correu): comparar pace de corrida livre
    // com o pace prescrito seria a mesma mistura que esta fase está desfazendo.
    const planSeconds = completedWorkouts.reduce(
      (sum, w) => sum + (Number(w.time_run_seconds) || 0),
      0,
    );
    const avgPaceSeconds =
      planDistanceCompletedKm > 0 && planSeconds > 0
        ? Math.round(planSeconds / planDistanceCompletedKm)
        : 0;

    const targetPaceSeconds = this.deriveTargetPaceSeconds(workouts);

    // ── Bloco 2 — TOTAL CORRIDO NO PERÍODO ──────────────────────────────────
    // Bounds cientes de São Paulo + filtro pós-query pelo dia local, porque a
    // janela em UTC sangra um dia nas bordas (padrão de StatsService).
    const { data: activitiesRaw } = await supabase
      .from('activities')
      .select('start_date, distance')
      .eq('user_id', userId)
      .gte('start_date', `${window.startStr}T00:00:00-03:00`)
      .lte('start_date', `${window.endStr}T23:59:59-03:00`);

    // Sem filtro por `type`: StatsService não filtra, e o filtro fazia o total
    // da retrospectiva ficar menor que o do Calendário para linhas com `type`
    // nulo (importações antigas). `activities` só guarda corrida neste app.
    const activities = (activitiesRaw ?? []).filter((a) => {
      const day = toSaoPauloDateStr(a.start_date as string);
      return day >= window.startStr && day <= window.endStr;
    });

    const totalDistanceKm = activities.reduce(
      (sum, a) => sum + (Number(a.distance) || 0) / 1000,
      0,
    );

    // Quanto correu FORA do plano. Piso em 0: activities pode não cobrir um
    // treino concluído manualmente sem linha correspondente.
    const freeRunDistanceKm = Math.max(
      0,
      totalDistanceKm - planDistanceCompletedKm,
    );

    // Recorde do ciclo — a maior corrida ÚNICA. Sai do mesmo array já
    // carregado (zero query extra) e cobre plano + corrida livre de propósito.
    const longest = findLongestRun(activities);

    // ── Contexto ────────────────────────────────────────────────────────────
    const { data: readinessHistory } = await supabase
      .from('readiness_history')
      .select('score')
      .eq('user_id', userId)
      .gte('created_at', `${window.startStr}T00:00:00-03:00`)
      .lte('created_at', `${window.endStr}T23:59:59-03:00`);

    const avgReadinessScore =
      readinessHistory && readinessHistory.length > 0
        ? readinessHistory.reduce((sum, r) => sum + (r.score || 0), 0) /
          readinessHistory.length
        : 0;

    // ── Percentuais ─────────────────────────────────────────────────────────
    // Numerador é o do PLANO. Antes era `totalDistanceKm` (tudo), o que fazia
    // corrida livre inflar a aderência contra um denominador só do plano.
    const distanceVsGoalPercent =
      totalDistancePlannedKm > 0
        ? Math.round((planDistanceCompletedKm / totalDistancePlannedKm) * 100)
        : 0;

    const paceVsGoalPercent =
      targetPaceSeconds > 0 && avgPaceSeconds > 0
        ? Math.round((targetPaceSeconds / avgPaceSeconds) * 100) // menor pace = melhor
        : 0;

    const completionRate =
      totalWorkoutsPlanned > 0
        ? Math.round((totalWorkoutsCompleted / totalWorkoutsPlanned) * 100)
        : 0;

    // Frequência é CADÊNCIA SEMANAL contra a disponibilidade declarada — não é
    // `completionRate` (que é por sessão), embora até a Fase 1A fosse uma cópia
    // literal dele. Divergem em semanas de taper/prova e, sobretudo, quando a
    // re-âncora estica o calendário: as mesmas 9 sessões em 8 semanas em vez de
    // 4 deixam `completionRate` intacto e derrubam a frequência pela metade.
    const frequencyActualPerWeek =
      window.weeks > 0
        ? Math.round((totalWorkoutsCompleted / window.weeks) * 100) / 100
        : 0;

    const frequencyTargetPerWeek = resolveTargetFrequency(
      plan?.frequency_per_week,
      totalWorkoutsPlanned,
      window.weeks,
    );

    const frequencyVsGoalPercent =
      frequencyTargetPerWeek > 0
        ? Math.round((frequencyActualPerWeek / frequencyTargetPerWeek) * 100)
        : 0;

    return {
      totalDistancePlannedKm: Math.round(totalDistancePlannedKm * 10) / 10,
      planDistanceCompletedKm: Math.round(planDistanceCompletedKm * 10) / 10,
      distanceVsGoalPercent,
      avgPaceSeconds,
      targetPaceSeconds,
      paceVsGoalPercent,
      totalWorkoutsCompleted,
      totalWorkoutsPlanned,
      completionRate,
      frequencyActualPerWeek,
      frequencyTargetPerWeek,
      frequencyVsGoalPercent,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalRunsInPeriod: activities.length,
      freeRunDistanceKm: Math.round(freeRunDistanceKm * 10) / 10,
      longestRunKm: longest.km,
      longestRunDate: longest.date,
      avgReadinessScore: Math.round(avgReadinessScore * 10) / 10,
      readinessCheckIns: readinessHistory?.length || 0,
      planWindowStart: window.startStr,
      planWindowEnd: window.endStr,
    };
  }

  /**
   * Pace-alvo médio do plano (segundos/km), lido do bloco principal de cada
   * treino — `main` num contínuo, `repeat.work` num intervalado.
   */
  private deriveTargetPaceSeconds(workouts: any[]): number {
    if (workouts.length === 0) return 360; // 6:00/km
    const pacesSum = workouts.reduce((sum, w) => {
      if (w.instructions_json && Array.isArray(w.instructions_json)) {
        const seg = w.instructions_json.find((s: any) => s.type === 'main');
        const repeat = w.instructions_json.find(
          (s: any) => s.type === 'repeat',
        );
        const paceRaw = seg?.pace_min ?? repeat?.work?.pace_min;
        // pace_min pode estar em segundos/km (novo) ou decimal min/km (antigo).
        const paceSec = paceValueToSecondsPerKm(paceRaw);
        if (paceSec != null) return sum + paceSec;
      }
      return sum + 360;
    }, 0);
    return Math.round(pacesSum / workouts.length);
  }

  /**
   * Generate AI-powered insights and next goal suggestion
   */
  private async generateAIInsights(
    metrics: RetrospectiveMetrics,
    userId: string,
  ): Promise<AIRetrospectiveContent> {
    // Fallback if no API key configured
    if (!this.hasAIRouter) {
      return this.getFallbackInsights(metrics);
    }

    try {
      // Get user profile for context
      const supabase = this.supabaseService.getClient();
      const { data: onboarding } = await supabase
        .from('user_onboarding')
        .select('goal, level')
        .eq('user_id', userId)
        .single();

      const systemPrompt = `Você é um treinador de corrida da RunEasy. Analise as métricas do ciclo de treino e gere insights personalizados.

REGRA: Responda APENAS com JSON válido neste formato:
{
  "insights": "String com 2-3 frases analisando o desempenho, mencionando pontos positivos e áreas de melhoria",
  "suggestedNextGoal": "String com a próxima meta sugerida (ex: '10km Confortável')",
  "suggestedNextGoalType": "String (5k, 10k, half_marathon, pace_improvement)"
}`;

      // Os DOIS números vão para o prompt de propósito: quem correu muito fora
      // do plano tem aderência baixa com volume alto, e o coach precisa poder
      // dizer isso ("correu 70 km, mas só 30 entraram no plano") em vez de
      // apresentar um percentual baixo sem explicação.
      const userPrompt = `Métricas do Ciclo (${metrics.planWindowStart} a ${metrics.planWindowEnd}):

ADERÊNCIA AO PLANO:
- Distância do plano executada: ${metrics.planDistanceCompletedKm}km de ${metrics.totalDistancePlannedKm}km planejados (${metrics.distanceVsGoalPercent}%)
- Pace Médio nos treinos do plano: ${this.formatPace(metrics.avgPaceSeconds)} (meta era ${this.formatPace(metrics.targetPaceSeconds)})
- Taxa de Conclusão: ${metrics.completionRate}% (${metrics.totalWorkoutsCompleted}/${metrics.totalWorkoutsPlanned} treinos)
- Frequência: ${metrics.frequencyActualPerWeek} treinos/semana (meta: ${metrics.frequencyTargetPerWeek}/semana)

TOTAL CORRIDO NO PERÍODO (inclui corridas livres, fora do plano):
- Distância Total: ${metrics.totalDistanceKm}km em ${metrics.totalRunsInPeriod} corridas
- Fora do plano: ${metrics.freeRunDistanceKm}km
- Maior corrida única: ${metrics.longestRunKm}km${metrics.longestRunDate ? ` (em ${metrics.longestRunDate})` : ''}

- Score Médio de Prontidão: ${metrics.avgReadinessScore}/100 (${metrics.readinessCheckIns} check-ins)

Objetivo Original: ${onboarding?.goal || '5k'}
Nível: ${onboarding?.level || 'beginner'}

Gere insights destacando:
1. A consistência do atleta nos treinos
2. Evolução de pace (se melhorou ou piorou em relação à meta)
3. Próxima meta realista baseada no progresso

Responda APENAS com JSON.`;

      const result = await this.aiRouter.call<AIRetrospectiveContent>({
        featureName: AI_FEATURES.RETROSPECTIVE,
        userId,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 1000,
      });

      return result.data;
    } catch (error) {
      this.logger.error('[Retrospective] AI generation failed:', error);
    }

    return this.getFallbackInsights(metrics);
  }

  /**
   * Fallback insights when AI is unavailable
   */
  private getFallbackInsights(
    metrics: RetrospectiveMetrics,
  ): AIRetrospectiveContent {
    const performanceLevel =
      metrics.completionRate >= 80
        ? 'excelente'
        : metrics.completionRate >= 60
          ? 'bom'
          : 'moderado';

    let insights = `Seu desempenho foi ${performanceLevel} neste ciclo. `;

    if (metrics.distanceVsGoalPercent >= 100) {
      insights += `Você superou a meta de distância em ${metrics.distanceVsGoalPercent - 100}%! `;
    }

    if (metrics.avgReadinessScore >= 70) {
      insights += `Sua consistência nos check-ins de prontidão (${metrics.readinessCheckIns} dias) contribuiu para um bom monitoramento.`;
    }

    // Suggest next goal based on performance
    let suggestedNextGoal = '10km Confortável';
    let suggestedNextGoalType = '10k';

    if (metrics.totalDistanceKm > 80 && metrics.completionRate >= 75) {
      suggestedNextGoal = 'Meia Maratona';
      suggestedNextGoalType = 'half_marathon';
    } else if (metrics.totalDistanceKm > 40) {
      suggestedNextGoal = '10km Confortável';
      suggestedNextGoalType = '10k';
    } else {
      suggestedNextGoal = '5km com Pace Melhor';
      suggestedNextGoalType = 'pace_improvement';
    }

    return { insights, suggestedNextGoal, suggestedNextGoalType };
  }

  /**
   * Get the latest retrospective for a user
   */
  async getLatestRetrospective(userId: string): Promise<Retrospective | null> {
    const supabase = this.supabaseService.getClient();

    // Embed do plano (FK plan_retrospectives_plan_id_fkey) numa query só. O card
    // de abertura dos stories precisa da META e da DURAÇÃO do ciclo, que vivem
    // em `training_plans` — sem isso ele não tem o que contextualizar.
    const { data, error } = await supabase
      .from('plan_retrospectives')
      .select(
        '*, training_plans(goal, goal_type, race_name, race_distance, duration_weeks)',
      )
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToRetrospective(data);
  }

  /**
   * Check if user has a pending/ready retrospective
   */
  async hasReadyRetrospective(userId: string): Promise<boolean> {
    const latest = await this.getLatestRetrospective(userId);
    if (!latest) return false;

    // Check if it was created in the last 7 days (still "fresh")
    const createdAt = new Date(latest.createdAt);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return createdAt > sevenDaysAgo;
  }

  /**
   * Accept AI suggestion and create new plan
   * 1. Get retrospective with suggested goal
   * 2. Archive retrospective
   * 3. Get and archive old plan
   * 4. Generate new plan based on suggestion
   * 5. Delete notification
   */
  async acceptSuggestion(
    userId: string,
    retrospectiveId: string,
  ): Promise<any> {
    const supabase = this.supabaseService.getClient();

    this.logger.log(
      `[AcceptSuggestion] Starting for user ${userId}, retro ${retrospectiveId}`,
    );

    // 1. Get retrospective
    const { data: retro, error: retroError } = await supabase
      .from('plan_retrospectives')
      .select('*')
      .eq('id', retrospectiveId)
      .eq('user_id', userId)
      .single();

    if (retroError || !retro) {
      throw new Error('Retrospective not found');
    }

    this.logger.log(
      `[AcceptSuggestion] Found retro with goal: ${retro.suggested_next_goal_type}`,
    );

    // 2. Archive retrospective
    await supabase
      .from('plan_retrospectives')
      .update({ status: 'archived' })
      .eq('id', retrospectiveId);

    // 3. Parâmetros do plano antigo.
    //
    // ⚠️ NÃO adicione `level`, `days_per_week` ou `target_pace` a este select —
    // essas colunas NÃO existem em `training_plans`. Até a Fase 1A elas estavam
    // aqui, o PostgREST devolvia 42703, o erro não era checado e `oldPlan` vinha
    // `null` em 100% das execuções: todo plano regenerado saía com os fallbacks
    // ('intermediate', 3 dias, 8 semanas). A frequência mora em
    // `frequency_per_week`; nível e dias vêm de `user_onboarding`.
    const { data: oldPlan, error: oldPlanError } = await supabase
      .from('training_plans')
      .select('id, goal, duration_weeks, frequency_per_week, goal_type')
      .eq('id', retro.plan_id)
      .maybeSingle();

    if (oldPlanError) {
      this.logger.warn(
        `[AcceptSuggestion] Failed to read old plan ${retro.plan_id}: ${oldPlanError.message} — falling back to onboarding only`,
      );
    }

    // NOTA: o plano antigo NÃO é arquivado aqui. `generateRetrospective` já o
    // deixou em `status='completed'`, `createQuickPlan` cancela ativos por conta
    // própria, e nada no repo lê `'archived'` — sobrescrever o 'completed'
    // quebraria o endpoint de reset, que procura por ele.

    // 4. Monta o request com os dados REAIS do usuário.
    const onboarding = await this.loadPlanInputsFromOnboarding(userId);

    const newGoalType = retro.suggested_next_goal_type || oldPlan?.goal || '5k';
    const level = onboarding.level ?? 'intermediate';
    const daysPerWeek =
      oldPlan?.frequency_per_week ?? onboarding.daysPerWeek ?? 3;
    const targetWeeks = oldPlan?.duration_weeks ?? onboarding.targetWeeks ?? 8;

    // O pace do ciclo recém-terminado é a evidência mais fresca; o onboarding é
    // o fallback. `avg_pace_seconds` está em segundos/km → min/km decimal.
    const currentPace5k = retro.avg_pace_seconds
      ? retro.avg_pace_seconds / 60
      : onboarding.currentPace5k;

    const planRequest: TrainingPlanRequest = {
      goal: newGoalType,
      level,
      daysPerWeek,
      currentPace5k,
      targetWeeks,
      limitations: onboarding.limitations,
      preferredDays: onboarding.preferredDays,
      // Sinais de capacidade da Fase A/B. Sem eles o motor de volume cai no
      // fallback por nível e o plano regenerado perde a calibração.
      calculatedPace: onboarding.calculatedPace,
      recentDistanceKm: onboarding.recentDistanceKm,
      recentFrequency: onboarding.recentFrequency,
      currentWeeklyKm: onboarding.currentWeeklyKm,
    };

    this.logger.log(
      `[AcceptSuggestion] Creating new plan with: goal=${newGoalType}, level=${level}, ` +
        `days=${daysPerWeek}, weeks=${targetWeeks}, preferredDays=${JSON.stringify(onboarding.preferredDays)}`,
    );

    // 5. Generate new plan
    const newPlan = await this.trainingService.createQuickPlan(
      userId,
      planRequest,
    );

    this.logger.log(`[AcceptSuggestion] New plan created: ${newPlan.plan_id}`);

    // 6. Remove a notificação desta retrospectiva.
    await this.deleteRetrospectiveNotifications(userId, retrospectiveId);

    return {
      success: true,
      message: 'Novo plano gerado com sucesso!',
      newPlanId: newPlan.plan_id,
      planHeader: newPlan.planHeader,
      planHeadline: newPlan.planHeadline,
      nextWorkout: newPlan.nextWorkout,
    };
  }

  /**
   * Customize new plan with manual parameters
   */
  async customizePlan(
    userId: string,
    retrospectiveId: string,
    params: CustomizePlanDto,
  ): Promise<any> {
    const supabase = this.supabaseService.getClient();
    this.logger.log(
      `[CustomizePlan] Starting for user ${userId}, retro ${retrospectiveId}`,
    );

    // 1. Get retrospective
    const { data: retro, error: retroError } = await supabase
      .from('plan_retrospectives')
      .select('*')
      .eq('id', retrospectiveId)
      .eq('user_id', userId)
      .single();

    if (retroError || !retro) {
      throw new Error('Retrospective not found');
    }

    // 2. Archive retrospective
    await supabase
      .from('plan_retrospectives')
      .update({ status: 'archived' })
      .eq('id', retrospectiveId);

    // 3. O plano antigo já ficou 'completed' em generateRetrospective — não
    //    sobrescrever com 'archived' (mesmo motivo documentado em acceptSuggestion).

    // 4. Map Params to TrainingPlanRequest
    // Map simplified days ["Dom", "Seg"] to number[] [0, 1]
    const dayMap: Record<string, number> = {
      Dom: 0,
      Seg: 1,
      Ter: 2,
      Qua: 3,
      Qui: 4,
      Sex: 5,
      Sáb: 6,
    };
    const preferredDays = params.training_days.map((d) => dayMap[d] ?? 0);

    const onboarding = await this.loadPlanInputsFromOnboarding(userId);

    // `params` vence o onboarding em dias/semanas/frequência: são a escolha
    // EXPLÍCITA do usuário nesta tela. O onboarding entra só no que a tela não
    // pergunta (nível, limitações, pace atual, sinais de capacidade).
    const planRequest: TrainingPlanRequest = {
      goal: params.distance_goal, // '5k', '10k', '21km', '42km'
      level: onboarding.level ?? 'intermediate',
      daysPerWeek: params.training_days.length,
      // `targetPace` (abaixo) continua sendo o alvo explícito; este é o ponto de
      // partida real do atleta, que o motor de volume usa para calibrar.
      currentPace5k: onboarding.currentPace5k,
      targetWeeks: params.duration_weeks,
      limitations: onboarding.limitations,
      preferredDays: preferredDays,
      targetTime: params.time_goal,
      targetPace: params.target_pace,
      calculatedPace: onboarding.calculatedPace,
      recentDistanceKm: onboarding.recentDistanceKm,
      recentFrequency: onboarding.recentFrequency,
      currentWeeklyKm: onboarding.currentWeeklyKm,
    };

    this.logger.log(
      `[CustomizePlan] Creating plan with target pace: ${params.target_pace}, ` +
        `level=${planRequest.level}, days=${planRequest.daysPerWeek}, weeks=${planRequest.targetWeeks}`,
    );

    // 5. Generate new plan
    const newPlan = await this.trainingService.createQuickPlan(
      userId,
      planRequest,
    );

    // 6. Remove a notificação desta retrospectiva.
    await this.deleteRetrospectiveNotifications(userId, retrospectiveId);

    return {
      success: true,
      newPlanId: newPlan.plan_id,
      planHeader: newPlan.planHeader,
    };
  }

  /**
   * Remove a notificação de "retrospectiva pronta" depois que o usuário agiu
   * sobre ela (aceitou ou personalizou).
   *
   * Casa por `metadata->>retrospectiveId`, não por `type`. Até a Fase 1A o
   * filtro era `type.eq.retrospective_ready` — mas `retrospective_ready` nunca
   * foi o valor da COLUNA `type` (é `recovery_analysis`; `retrospective_ready`
   * só aparece dentro do metadata). Resultado: `customizePlan` não deletava
   * nada, e o usuário ficava com uma notificação fantasma apontando para uma
   * retrospectiva já arquivada.
   */
  private async deleteRetrospectiveNotifications(
    userId: string,
    retrospectiveId: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('metadata->>retrospectiveId', retrospectiveId);

    if (error) {
      this.logger.warn(
        `[Retrospective] Failed to delete notifications for retro ${retrospectiveId}: ${error.message}`,
      );
    } else {
      this.logger.log(
        `[Retrospective] Deleted notifications for retro ${retrospectiveId}`,
      );
    }
  }

  /**
   * Lê os dados REAIS do usuário para regenerar um plano.
   *
   * Existe porque `acceptSuggestion` e `customizePlan` hardcodavam
   * `level:'intermediate'`, `targetWeeks:8` e `preferredDays:[]` — um iniciante
   * recebia um plano calibrado como intermediário, em dias que nunca escolheu.
   *
   * Precedência de dias: `available_days` ganha de `preferred_days`. É a mesma
   * regra de `training.controller.ts` — o mobile popula `available_days` na
   * AvailableDaysScreen e nunca escreve em `preferred_days` (campo legado).
   */
  private async loadPlanInputsFromOnboarding(userId: string): Promise<{
    level: string | null;
    daysPerWeek: number | null;
    targetWeeks: number | null;
    limitations: string | null;
    preferredDays: number[];
    currentPace5k: number | null;
    calculatedPace: number | null;
    recentDistanceKm: number | null;
    recentFrequency: string | null;
    currentWeeklyKm: string | null;
  }> {
    const empty = {
      level: null,
      daysPerWeek: null,
      targetWeeks: null,
      limitations: null,
      preferredDays: [] as number[],
      currentPace5k: null,
      calculatedPace: null,
      recentDistanceKm: null,
      recentFrequency: null,
      currentWeeklyKm: null,
    };

    // Literal único de propósito: o supabase-js parseia a string do `select()`
    // no nível de TIPO, e concatenação quebra a inferência (a linha vira
    // GenericStringError). Não fatiar em várias strings.
    const { data, error } = await this.supabaseService
      .getClient()
      .from('user_onboarding')
      .select(
        'level, days_per_week, target_weeks, has_limitations, limitations, preferred_days, available_days, current_pace_5k, calculated_pace, recent_distance, recent_frequency, current_weekly_km',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      this.logger.warn(
        `[Retrospective] No onboarding for user ${userId} (${error?.message ?? 'not found'}) — regenerated plan will use defaults`,
      );
      return empty;
    }

    const available = Array.isArray(data.available_days)
      ? (data.available_days as number[])
      : [];
    const preferred = Array.isArray(data.preferred_days)
      ? (data.preferred_days as number[])
      : [];

    return {
      level: data.level ?? null,
      daysPerWeek: data.days_per_week ?? null,
      targetWeeks: data.target_weeks ?? null,
      // Não arrastar texto de limitação obsoleto quando a flag foi desmarcada.
      limitations: data.has_limitations ? (data.limitations ?? null) : null,
      preferredDays: available.length > 0 ? available : preferred,
      currentPace5k: data.current_pace_5k ?? null,
      calculatedPace: data.calculated_pace ?? null,
      recentDistanceKm: data.recent_distance ?? null,
      recentFrequency: data.recent_frequency ?? null,
      currentWeeklyKm: data.current_weekly_km ?? null,
    };
  }

  /**
   * Format pace from seconds to min:sec string
   */
  private formatPace(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}/km`;
  }

  /**
   * Extract JSON from text (may contain markdown)
   */
  /**
   * Map database row to Retrospective interface
   */
  private mapToRetrospective(data: any): Retrospective {
    const num = (v: unknown): number => Number(v) || 0;

    // `training_plans` só vem quando a query pediu o embed (getLatestRetrospective).
    // No caminho de geração é `undefined`, e os campos ficam null — a UI degrada.
    const plan = data.training_plans ?? null;
    const goalLabel = plan
      ? plan.goal_type === 'race' && plan.race_name
        ? plan.race_name
        : (GOAL_LABELS[plan.goal] ??
          (plan.race_distance ? `${plan.race_distance} Km` : null))
      : null;

    return {
      id: data.id,
      userId: data.user_id,
      planId: data.plan_id,
      // Total corrido no período (inclui corrida livre)
      totalDistanceKm: num(data.total_distance_km),
      totalRunsInPeriod: num(data.total_runs_in_period),
      freeRunDistanceKm: num(data.free_run_distance_km),
      longestRunKm: num(data.longest_run_km),
      longestRunDate: data.longest_run_date ?? null,
      // Aderência ao plano
      totalDistancePlannedKm: num(data.total_distance_planned_km),
      planDistanceCompletedKm: num(data.plan_distance_completed_km),
      totalWorkoutsCompleted: num(data.total_workouts_completed),
      totalWorkoutsPlanned: num(data.total_workouts_planned),
      avgPaceSeconds: num(data.avg_pace_seconds),
      targetPaceSeconds: num(data.target_pace_seconds),
      completionRate: num(data.completion_rate),
      frequencyActualPerWeek: num(data.frequency_actual_per_week),
      frequencyTargetPerWeek: num(data.frequency_target_per_week),
      planWindowStart: data.plan_window_start ?? null,
      planWindowEnd: data.plan_window_end ?? null,
      // Comparações
      distanceVsGoalPercent: num(data.distance_vs_goal_percent),
      paceVsGoalPercent: num(data.pace_vs_goal_percent),
      frequencyVsGoalPercent: num(data.frequency_vs_goal_percent),
      aiInsights: data.ai_insights,
      suggestedNextGoal: data.suggested_next_goal,
      suggestedNextGoalType: data.suggested_next_goal_type,
      planGoalLabel: goalLabel,
      planDurationWeeks: plan?.duration_weeks ?? null,
      status: data.status,
      createdAt: data.created_at,
      processedAt: data.processed_at,
    };
  }

  /**
   * Notificação de retrospectiva pronta — DISPARO ÚNICO.
   *
   * Até a Fase 1A o cron também enviava a sua (training-scheduler.service.ts),
   * então cada retrospectiva gerava 2 linhas em `notifications` e 2 pushes, com
   * títulos e tipos diferentes. O envio do scheduler foi removido; este método é
   * o único caminho.
   *
   * `type: 'recovery_analysis'` é o que NotificationsScreen mapeia para o card
   * de "insight" — trocar mudaria o visual, o que é escopo da Fase 1B.
   *
   * `metadata.retrospectiveId` (camelCase) é a chave por onde `acceptSuggestion`
   * e `customizePlan` encontram esta notificação para removê-la. Não renomear.
   */
  private async sendRetrospectiveNotification(
    userId: string,
    retrospectiveId: string,
  ): Promise<void> {
    const TITLE = 'Sua retrospectiva está pronta! 🏆';
    const BODY =
      'Veja como foi seu desempenho no ciclo e receba sugestões para o próximo plano.';

    try {
      // Via NotificationService (padrão do repo) em vez de INSERT cru — ganha o
      // logging e o tratamento de erro centralizados.
      const created = await this.notificationService.createNotification(
        userId,
        'recovery_analysis',
        TITLE,
        BODY,
        {
          retrospectiveId,
          screen: 'Retrospective',
          type: 'retrospective_ready',
        },
      );

      if (!created) {
        this.logger.warn(
          '[Retrospective] Failed to create notification record',
        );
      } else {
        this.logger.log('[Retrospective] Notification record created');
      }

      const pushSent = await this.notificationService.sendPushNotification(
        userId,
        TITLE,
        BODY,
        {
          type: 'retrospective_ready',
          screen: 'Retrospective',
          retrospectiveId,
        },
        { channelId: 'reminders' },
      );

      if (pushSent) {
        this.logger.log('[Retrospective] Push notification sent successfully');
      } else {
        this.logger.warn('[Retrospective] Failed to send push notification');
      }
    } catch (error) {
      this.logger.error('[Retrospective] Error sending notification:', error);
      // Don't throw - notification failure shouldn't fail retrospective generation
    }
  }
}
