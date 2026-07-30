import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';
import {
  formatPaceLabel,
  formatPaceRangeLabel,
  paceValueToSecondsPerKm,
} from '../../common/pace-calculator';

/** Lifecycle state of an AI coach feedback row. Persisted on ai_feedbacks. */
export type FeedbackStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'none';

export interface FeedbackStatusResult {
  status: FeedbackStatus;
  feedbackId: string | null;
  workoutId: string | null;
  activityId: string | null;
  reason: string | null;
}

export interface WorkoutComparison {
  planned: {
    distance_km: number;
    type: string;
    segments: Array<{
      type: string;
      distance_km: number;
      pace_min: number;
      pace_max: number;
    }>;
    objective: string;
  };
  executed: {
    distance: number;
    moving_time: number;
    /** Segundos por km (unidade canônica — ver pace-format.ts). */
    average_pace: number;
    /** Segundos por km (unidade canônica — ver pace-format.ts). */
    max_pace: number;
    elevation_gain: number;
    average_heartrate?: number;
    splits_metric?: Array<{
      split: number;
      average_speed: number;
      elevation_difference: number;
    }>;
    environment?: 'outdoor' | 'treadmill';
    treadmill_data?: {
      is_smart?: boolean;
      device_name?: string;
      avg_speed_kmh?: number;
      max_speed_kmh?: number;
      avg_incline?: number;
      total_calories?: number;
    } | null;
  };
}

export interface GeneratedFeedback {
  hero_message: string;
  hero_tone: 'celebration' | 'encouragement' | 'improvement' | 'caution';
  metrics_comparison: {
    distance: { planned: number; executed: number; diff_percent: number };
    pace: { planned: string; executed: string; diff_percent: number };
    elevation?: { executed: number };
    heartrate?: { average: number; max: number };
  };
  strengths: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  improvements: Array<{
    title: string;
    description: string;
    tip: string;
    icon: string;
  }>;
  progression_impact: string;
}

@Injectable()
export class FeedbackAIService {
  private readonly logger = new Logger(FeedbackAIService.name);

  constructor(
    private supabaseService: SupabaseService,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
    private aiRouter: AIRouterService,
    @InjectQueue('feedback-queue') private feedbackQueue: Queue,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // Feedback lifecycle status (processing → completed / failed / skipped)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Upsert the single ai_feedbacks row for a (workout, activity) pair.
   * There is no DB unique constraint (historical duplicates exist), so we
   * find-then-update the most recent row, or insert when none exists. This
   * keeps exactly one live row per completion and lets status transitions
   * (processing → completed/failed) update in place.
   */
  private async persistFeedbackRow(
    userId: string,
    workoutId: string,
    activityId: string,
    patch: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const { data: existing } = await this.supabaseService
      .from('ai_feedbacks')
      .select('id')
      .eq('user_id', userId)
      .eq('workout_id', workoutId)
      .eq('activity_id', activityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await this.supabaseService
        .from('ai_feedbacks')
        .update(patch)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await this.supabaseService
      .from('ai_feedbacks')
      .insert({
        user_id: userId,
        workout_id: workoutId,
        activity_id: activityId,
        ...patch,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }

  /** Mark generation as in-flight (placeholder row, no content yet). */
  async markProcessing(userId: string, workoutId: string, activityId: string) {
    return this.persistFeedbackRow(userId, workoutId, activityId, {
      status: 'processing',
      status_reason: null,
    });
  }

  /** Mark generation as intentionally skipped (quota / no activity). */
  async markSkipped(
    userId: string,
    workoutId: string,
    activityId: string,
    reason: string,
  ) {
    return this.persistFeedbackRow(userId, workoutId, activityId, {
      status: 'skipped',
      status_reason: reason,
    });
  }

  /** Mark generation as failed (worker threw / retries exhausted). */
  async markFailed(
    userId: string,
    workoutId: string,
    activityId: string,
    reason: string,
  ) {
    return this.persistFeedbackRow(userId, workoutId, activityId, {
      status: 'failed',
      status_reason: reason,
    });
  }

  /**
   * Mark processing and enqueue the BullMQ generation job. Used both by the
   * completion flow and by the "Tentar novamente" retry endpoint.
   */
  async enqueueGeneration(
    userId: string,
    workoutId: string,
    activityId: string,
  ) {
    await this.markProcessing(userId, workoutId, activityId);
    await this.feedbackQueue.add(
      'generate',
      { userId, workoutId, activityId },
      { delay: 1000 },
    );
  }

  /**
   * Resolve the current feedback lifecycle for a workout/activity. Prefers a
   * completed row (returns its id for navigation); otherwise reports the
   * latest non-completed state (processing/failed/skipped) or 'none'.
   */
  async getFeedbackStatus(
    userId: string,
    params: { workoutId?: string; activityId?: string },
  ): Promise<FeedbackStatusResult> {
    const { workoutId, activityId } = params;
    if (!workoutId && !activityId) {
      return {
        status: 'none',
        feedbackId: null,
        workoutId: workoutId ?? null,
        activityId: activityId ?? null,
        reason: null,
      };
    }

    let query = this.supabaseService
      .from('ai_feedbacks')
      .select('id, status, status_reason, workout_id, activity_id, created_at')
      .eq('user_id', userId);
    // activity_id is the canonical key (survives orphan/duplicate workouts).
    if (activityId) query = query.eq('activity_id', activityId);
    else if (workoutId) query = query.eq('workout_id', workoutId);

    const { data: rows } = await query.order('created_at', {
      ascending: false,
    });

    if (!rows || rows.length === 0) {
      return {
        status: 'none',
        feedbackId: null,
        workoutId: workoutId ?? null,
        activityId: activityId ?? null,
        reason: null,
      };
    }

    const completed = rows.find((r: any) => r.status === 'completed');
    const chosen = completed ?? rows[0];
    return {
      status: chosen.status as FeedbackStatus,
      feedbackId: completed?.id ?? null,
      workoutId: chosen.workout_id ?? workoutId ?? null,
      activityId: chosen.activity_id ?? activityId ?? null,
      reason: chosen.status_reason ?? null,
    };
  }

  /**
   * Generate post-workout feedback using Claude AI
   */
  async generateFeedback(
    userId: string,
    workoutId: string,
    activityId: string,
  ): Promise<GeneratedFeedback> {
    // 1. Fetch workout and activity data
    const { data: workout } = await this.supabaseService
      .from('workouts')
      .select('*, training_plans(*)')
      .eq('id', workoutId)
      .single();

    const { data: activity } = await this.supabaseService
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .single();

    if (!workout || !activity) {
      throw new Error('Workout or activity not found');
    }

    // 2. Prepare comparison data
    const comparison: WorkoutComparison = {
      planned: {
        distance_km: workout.distance_km,
        type: workout.type,
        segments: workout.instructions_json || [],
        objective: workout.objective,
      },
      executed: {
        distance: activity.distance,
        moving_time: activity.moving_time,
        average_pace: activity.average_pace,
        max_pace: activity.max_pace,
        elevation_gain: activity.elevation_gain,
        average_heartrate: activity.average_heartrate,
        splits_metric: activity.splits_metric,
        environment: activity.environment ?? 'outdoor',
        treadmill_data: activity.treadmill_data ?? null,
      },
    };

    // 3. Generate feedback with AI Router
    const feedback = await this.callAIForFeedback(
      comparison,
      workout.type,
      userId,
    );

    // 4. Save feedback to database. Updates the 'processing' placeholder row
    //    created at enqueue time (or inserts if absent) and flips it to
    //    'completed' so the home card / status endpoint see it as ready.
    const savedFeedback = await this.persistFeedbackRow(
      userId,
      workoutId,
      activityId,
      {
        hero_message: feedback.hero_message,
        hero_tone: feedback.hero_tone,
        metrics_comparison: feedback.metrics_comparison,
        strengths: feedback.strengths,
        improvements: feedback.improvements,
        progression_impact: feedback.progression_impact,
        status: 'completed',
        status_reason: null,
      },
    );

    if (!savedFeedback) {
      throw new Error('Failed to persist feedback row');
    }

    // 5. Send push notification to user
    try {
      await this.notificationService.sendFeedbackReadyNotification(
        userId,
        savedFeedback.id,
        workout.type,
      );
    } catch (notifError) {
      // Log but don't fail the whole operation
      this.logger.warn('Failed to send feedback notification', notifError);
    }

    this.logger.log(`Generated feedback for workout ${workoutId}`);
    return feedback;
  }

  /**
   * Call AI Router to generate workout feedback
   */
  private async callAIForFeedback(
    comparison: WorkoutComparison,
    workoutType: string,
    userId: string,
  ): Promise<GeneratedFeedback> {
    const systemPrompt = `Você é um treinador de corrida experiente e motivador, especializado em dar feedback construtivo e personalizado.

Seu estilo é:
- Empático e encorajador
- Técnico quando necessário, mas acessível
- Focado em progresso, não perfeição
- Usa linguagem brasileira informal mas profissional

IMPORTANTE: Responda APENAS com um JSON válido, sem texto adicional.`;

    const executedDistanceKm = comparison.executed.distance / 1000;
    const plannedPaceRange =
      comparison.planned.segments.length > 0
        ? `${formatPaceRangeLabel(
            comparison.planned.segments[0].pace_min,
            comparison.planned.segments[0].pace_max,
          )}/km`
        : 'não especificado';

    const distanceDiff =
      ((executedDistanceKm - comparison.planned.distance_km) /
        comparison.planned.distance_km) *
      100;

    const isTreadmill = comparison.executed.environment === 'treadmill';
    const tm = comparison.executed.treadmill_data;

    const treadmillContext = isTreadmill
      ? `

⚠️ AMBIENTE: ESTEIRA
- Este treino foi feito em esteira (${tm?.is_smart ? `Smart Treadmill conectada via Bluetooth — ${tm?.device_name ?? 'esteira'}` : 'modo manual'}).
- NÃO comente sobre elevação real, terreno, GPS, rota, vento ou condições climáticas.
- A "elevação" exibida não é altitude — é a inclinação configurada na esteira.
- Inclinação média da esteira: ${tm?.avg_incline != null ? tm.avg_incline.toFixed(1) + '%' : 'plana'}.
${tm?.avg_speed_kmh != null ? `- Velocidade média na esteira: ${tm.avg_speed_kmh.toFixed(1)} km/h` : ''}
${tm?.max_speed_kmh != null ? `- Velocidade máxima na esteira: ${tm.max_speed_kmh.toFixed(1)} km/h` : ''}`
      : '';

    const userPrompt = `Analise este treino e gere um feedback detalhado:

TREINO PLANEJADO:
- Tipo: ${this.getWorkoutTypeName(workoutType)}
- Distância: ${comparison.planned.distance_km} km
- Pace alvo: ${plannedPaceRange}
- Objetivo: ${comparison.planned.objective}

TREINO EXECUTADO:
- Distância: ${executedDistanceKm.toFixed(2)} km (${distanceDiff > 0 ? '+' : ''}${distanceDiff.toFixed(1)}%)
- Pace médio: ${formatPaceLabel(comparison.executed.average_pace)}/km
- Pace máximo: ${formatPaceLabel(comparison.executed.max_pace)}/km
- Tempo total: ${Math.floor(comparison.executed.moving_time / 60)} minutos
${isTreadmill ? '' : `- Elevação: ${comparison.executed.elevation_gain?.toFixed(0) || 0}m\n`}${comparison.executed.average_heartrate ? `- FC média: ${comparison.executed.average_heartrate} bpm` : ''}${treadmillContext}

SPLITS (km):
${this.formatSplits(comparison.executed.splits_metric)}

Gere um feedback seguindo este formato JSON exato:
{
  "hero_message": "Mensagem principal curta e impactante (máx 100 chars)",
  "hero_tone": "celebration|encouragement|improvement|caution",
  "metrics_comparison": {
    "distance": {
      "planned": ${comparison.planned.distance_km},
      "executed": ${executedDistanceKm.toFixed(2)},
      "diff_percent": ${distanceDiff.toFixed(1)}
    },
    "pace": {
      "planned": "${plannedPaceRange}",
      "executed": "${formatPaceLabel(comparison.executed.average_pace)}/km",
      "diff_percent": 0
    }
  },
  "strengths": [
    {
      "title": "Título do ponto forte",
      "description": "Descrição detalhada do que foi bem",
      "icon": "emoji relevante"
    }
  ],
  "improvements": [
    {
      "title": "Área de melhoria",
      "description": "O que pode melhorar",
      "tip": "Dica prática e específica",
      "icon": "emoji relevante"
    }
  ],
  "progression_impact": "Parágrafo explicando como este treino contribui para o objetivo geral do corredor"
}

Regras:
- hero_tone: "celebration" se superou metas, "encouragement" se completou bem, "improvement" se há espaço para melhorar, "caution" se precisa de atenção
- strengths: 2-3 pontos fortes baseados nos dados
- improvements: 1-2 áreas de melhoria com dicas práticas
- Seja específico aos dados, não genérico`;

    try {
      const result = await this.aiRouter.call<GeneratedFeedback>({
        featureName: AI_FEATURES.FEEDBACK,
        userId,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 2000,
      });

      return result.data;
    } catch (error) {
      this.logger.error('Failed to generate feedback with AI', error);
      throw error;
    }
  }

  /**
   * Get user's feedback history
   */
  async getFeedbackHistory(userId: string, limit = 10) {
    const { data, error } = await this.supabaseService
      .from('ai_feedbacks')
      .select('*, workouts(*), activities(*)')
      .eq('user_id', userId)
      // Only ready feedback belongs in history — hide processing/failed/skipped
      // placeholder rows so they don't render as empty coach cards.
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Get a specific feedback by ID
   */
  async getFeedback(userId: string, feedbackId: string) {
    const { data, error } = await this.supabaseService
      .from('ai_feedbacks')
      .select('*, workouts(*), activities(*)')
      .eq('id', feedbackId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get latest activity with feedback for home screen AI card
   */
  async getLatestActivityWithFeedback(
    userId: string,
    scope?: 'plan' | 'activity',
  ) {
    const empty = {
      activity: null,
      feedback: null,
      feedback_status: 'none' as FeedbackStatus,
      feedback_status_reason: null as string | null,
      efficiency_percent: 0,
      conquest: null,
    };

    // 1. Resolve the latest activity for the requested scope.
    //    - no scope        → most recent activity overall (legacy behaviour)
    //    - scope='plan'     → most recent activity linked to a plan workout
    //    - scope='activity' → most recent activity linked to a manual/free workout
    let latestActivity: any = null;
    // Hint passado para buildLatestActivityResponse: garante workout_id
    // mesmo quando há múltiplas linhas em `workouts` apontando para a mesma
    // activity (caso degradado: workout órfão + recompletion). Sem isso o
    // `.maybeSingle()` lá embaixo pode retornar null e o card abre o
    // RunSummary com workoutId undefined → tela vazia, sem cold-start
    // loading. Esse hint é o "último workout escopeado" para essa activity.
    let scopedWorkoutIdHint: string | null = null;

    if (scope === 'plan' || scope === 'activity') {
      const sourceValues = scope === 'plan' ? ['plan'] : ['manual', 'free'];

      const { data: scopedWorkouts } = await this.supabaseService
        .from('workouts')
        .select('id, activity_id')
        .eq('user_id', userId)
        .in('source', sourceValues)
        .not('activity_id', 'is', null);

      const activityIds = Array.from(
        new Set(
          (scopedWorkouts ?? []).map((w: any) => w.activity_id).filter(Boolean),
        ),
      );

      if (activityIds.length === 0) return empty;

      const { data, error } = await this.supabaseService
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .in('id', activityIds)
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return empty;
      latestActivity = data;

      // Pega a row de workouts do scope para essa activity (qualquer uma,
      // se houver múltiplas) — usada como fallback robusto do workout_id
      // quando o lookup por activity_id devolver múltiplas linhas.
      const scopedRow = (scopedWorkouts ?? []).find(
        (w: any) => w.activity_id === latestActivity.id,
      );
      scopedWorkoutIdHint = scopedRow?.id ?? null;
    } else {
      const { data, error } = await this.supabaseService
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return empty;
      latestActivity = data;
    }

    return this.buildLatestActivityResponse(
      userId,
      latestActivity,
      scopedWorkoutIdHint,
    );
  }

  /**
   * Build the rich home-screen activity payload (feedback, linked workout,
   * conquest, VO2 estimate) from an already-selected activity row.
   *
   * `scopedWorkoutIdHint` é o workout id pré-resolvido pela query de escopo
   * (Treinos/Atividades). Quando o lookup por activity_id devolver múltiplas
   * rows (workout órfão + recompletion → `.maybeSingle()` retorna null) ou
   * nenhuma, usamos esse hint para garantir que o card sempre tenha um
   * workout_id navegável.
   */
  private async buildLatestActivityResponse(
    userId: string,
    latestActivity: any,
    scopedWorkoutIdHint: string | null = null,
  ) {
    // 2. Get associated feedback if exists.
    //    Fetch ALL rows for this activity ordered newest-first (there can be
    //    duplicates from orphan workout + recompletion, plus a 'processing'
    //    placeholder alongside a later 'completed' row). Prefer the completed
    //    one; expose the lifecycle status so the card can render
    //    processing/failed/skipped states instead of a permanent "em preparo".
    const { data: feedbackRows } = await this.supabaseService
      .from('ai_feedbacks')
      .select(
        'id, hero_message, hero_tone, strengths, improvements, metrics_comparison, workout_id, status, status_reason',
      )
      .eq('activity_id', latestActivity.id)
      .order('created_at', { ascending: false });

    const rows = Array.isArray(feedbackRows) ? feedbackRows : [];
    const completedFeedback = rows.find((r: any) => r.status === 'completed');
    const latestFeedbackRow = rows[0] ?? null;
    // Only surface `feedback` content when it is actually ready.
    const feedback = completedFeedback ?? null;
    const feedbackStatus: FeedbackStatus = completedFeedback
      ? 'completed'
      : (latestFeedbackRow?.status as FeedbackStatus) ?? 'none';
    const feedbackStatusReason: string | null =
      latestFeedbackRow?.status_reason ?? null;

    // 3. Get linked workout to check goal.
    // Usar .maybeSingle() em vez de .single() — .single() retornava erro
    // (e data:null) quando havia múltiplas rows em workouts apontando para
    // a mesma activity (cenário real: workout órfão + recompletion via
    // upsert). Com null, `workout_id` caía para null e o RunSummary abria
    // em estado vazio sem cold-start loading, parecendo "clique sem ação".
    // Pegamos a row mais recente como representante quando há duplicatas.
    const { data: linkedWorkouts } = await this.supabaseService
      .from('workouts')
      .select(
        'id, distance_km, type, source, title, target_pace_seconds, target_duration_seconds, created_at',
      )
      .eq('activity_id', latestActivity.id)
      .order('created_at', { ascending: false });

    const linkedWorkout =
      Array.isArray(linkedWorkouts) && linkedWorkouts.length > 0
        ? linkedWorkouts[0]
        : null;

    // 4. Calculate if goal was met (distance comparison)
    let goalMet = false;
    let plannedDistanceKm = 0;
    const executedDistanceKm = latestActivity.distance / 1000;

    if (linkedWorkout) {
      plannedDistanceKm = linkedWorkout.distance_km || 0;
      // Goal is met if executed distance is at least 90% of planned
      goalMet = executedDistanceKm >= plannedDistanceKm * 0.9;
    }

    // 5. Get XP earned for this activity (from points_history)
    const { data: pointsRecord } = await this.supabaseService
      .from('points_history')
      .select('points, reason')
      .eq('reference_type', 'activity')
      .eq('reference_id', latestActivity.id)
      .single();

    const xpEarned = goalMet && pointsRecord ? pointsRecord.points : 0;

    // 6. Calculate efficiency (based on pace execution vs typical target)
    let efficiencyPercent = 0;
    if (feedback?.metrics_comparison?.pace?.diff_percent) {
      efficiencyPercent = -feedback.metrics_comparison.pace.diff_percent;
    }

    // 7. Format activity date
    const activityDate = new Date(latestActivity.start_date);
    const today = new Date();
    const isToday = activityDate.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      activityDate.toDateString() === yesterday.toDateString();

    let dateLabel = activityDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
    if (isToday) dateLabel = 'hoje';
    else if (isYesterday) dateLabel = 'ontem';

    // 8. Format pace (m:ss per km). `average_pace` é segundos/km — o helper
    //    formata e ainda normaliza o decimal min/km legado.
    const formattedPace = formatPaceLabel(latestActivity.average_pace);

    // 9. Calculate VO2 Max estimate
    const vo2Estimate = this.calculateVO2MaxEstimate(
      latestActivity.average_pace || 0,
      latestActivity.average_heartrate,
      latestActivity.distance,
      latestActivity.moving_time,
    );

    // 10. Check if workout was interrupted (from hero_message)
    const isInterrupted =
      feedback?.hero_message?.toLowerCase().includes('interrompido') ||
      feedback?.hero_message?.toLowerCase().includes('incompleto') ||
      feedback?.hero_tone === 'caution';

    // 11. Get VO2 Max trend (only if workout completed properly)
    let vo2Trend = { trend_percent: 0, previous_value: null as number | null };
    if (vo2Estimate.isValid && !isInterrupted) {
      vo2Trend = await this.getVO2MaxTrend(userId, vo2Estimate.value);
    }

    // Build VO2 Max response object
    const vo2Max = vo2Estimate.isValid
      ? {
          current_value: vo2Estimate.value,
          trend_percent: isInterrupted ? 0 : vo2Trend.trend_percent,
          previous_value: vo2Trend.previous_value,
          is_valid: true,
          is_interrupted: isInterrupted,
          has_heartrate: !!latestActivity.average_heartrate,
          message: isInterrupted
            ? 'Treino interrompido - sem evolução'
            : !latestActivity.average_heartrate
              ? 'Estimativa baseada apenas no pace'
              : null,
        }
      : {
          current_value: 0,
          trend_percent: 0,
          previous_value: null,
          is_valid: false,
          is_interrupted: false,
          has_heartrate: false,
          message: 'Dados insuficientes para cálculo',
        };

    return {
      activity: {
        id: latestActivity.id,
        name: latestActivity.name,
        distance: latestActivity.distance,
        distance_km: executedDistanceKm.toFixed(1),
        moving_time: latestActivity.moving_time,
        // Segundos/km — normalizado para o mobile nunca receber o decimal
        // min/km legado neste payload.
        average_pace: paceValueToSecondsPerKm(latestActivity.average_pace),
        formatted_pace: formattedPace,
        elevation_gain: latestActivity.elevation_gain || 0,
        average_heartrate: latestActivity.average_heartrate,
        start_date: latestActivity.start_date,
        date_label: dateLabel,
        // Surface treadmill metadata to the Home AI card so it can hide
        // outdoor-only chrome (elevation/route mentions) for indoor runs.
        environment: latestActivity.environment ?? 'outdoor',
        treadmill_data: latestActivity.treadmill_data ?? null,
      },
      feedback: feedback
        ? {
            id: feedback.id,
            hero_message: feedback.hero_message,
            hero_tone: feedback.hero_tone,
            strengths: feedback.strengths || [],
            improvements: feedback.improvements || [],
          }
        : null,
      // Lifecycle so the coach card can distinguish "em preparo" (processing)
      // from "falhou → tentar novamente" (failed/skipped) and self-heal.
      feedback_status: feedbackStatus,
      feedback_status_reason: feedbackStatusReason,
      efficiency_percent: Math.round(efficiencyPercent * 10) / 10,
      // Cadeia de fallback do workout_id: lookup direto → feedback → hint
      // pré-resolvido pelo escopo. Garante que o card sempre tenha um id
      // navegável; sem isso, o RunSummary abre vazio (clique "sem ação").
      workout_id:
        linkedWorkout?.id ||
        feedback?.workout_id ||
        scopedWorkoutIdHint ||
        null,
      workout_source: linkedWorkout?.source || null,
      workout_title: linkedWorkout?.title || null,
      target_pace_seconds: linkedWorkout?.target_pace_seconds || null,
      target_duration_seconds: linkedWorkout?.target_duration_seconds || null,
      conquest: {
        goal_met: goalMet,
        planned_distance_km: plannedDistanceKm,
        executed_distance_km: executedDistanceKm,
        xp_earned: xpEarned,
        has_linked_workout: !!linkedWorkout,
      },
      vo2_max: vo2Max,
    };
  }

  /**
   * Rate a feedback
   */
  async rateFeedback(userId: string, feedbackId: string, rating: number) {
    const { data, error } = await this.supabaseService
      .from('ai_feedbacks')
      .update({ feedback_rating: rating })
      .eq('id', feedbackId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Calculate estimated VO2 Max based on running performance
   */
  calculateVO2MaxEstimate(
    /**
     * Pace em SEGUNDOS por km (unidade canônica de `activities.average_pace`).
     * Aceita o decimal min/km legado — `paceValueToSecondsPerKm` normaliza pelo
     * limiar documentado em pace-format.ts, então linhas antigas não produzem
     * um VO₂ 60× errado.
     */
    averagePaceSecondsPerKm: number,
    averageHeartrate: number | null,
    distanceMeters: number,
    movingTimeSeconds: number,
  ): { value: number; isValid: boolean; method: string } {
    if (distanceMeters < 1000 || movingTimeSeconds < 300) {
      return { value: 0, isValid: false, method: 'insufficient_data' };
    }
    // Pace ausente/zero (ex.: activity vinda do Strava sem average_speed
    // ou treino só-telefone com bug no cálculo) explodiria a divisão
    // abaixo em Infinity → 80 capado, gerando trend falso.
    const paceSecPerKm = paceValueToSecondsPerKm(averagePaceSecondsPerKm);
    if (paceSecPerKm == null) {
      return { value: 0, isValid: false, method: 'invalid_pace' };
    }

    // m/min = (1000 m / seg-por-km) × 60 seg
    const velocityMPerMin = (1000 / paceSecPerKm) * 60;
    const vo2FromPace =
      -4.6 +
      0.182258 * velocityMPerMin +
      0.000104 * Math.pow(velocityMPerMin, 2);

    let finalVO2 = vo2FromPace;
    let method = 'pace_based';

    if (averageHeartrate && averageHeartrate > 100 && averageHeartrate < 220) {
      const typicalHR = 165;
      const hrEfficiencyFactor = typicalHR / averageHeartrate;
      const adjustment = Math.min(Math.max(hrEfficiencyFactor - 1, -0.1), 0.1);
      finalVO2 = vo2FromPace * (1 + adjustment);
      method = 'pace_hr_combined';
    }

    finalVO2 = Math.min(Math.max(finalVO2, 30), 80);

    return {
      value: Math.round(finalVO2 * 10) / 10,
      isValid: true,
      method,
    };
  }

  /**
   * Get VO2 Max trend by comparing with previous estimates
   */
  async getVO2MaxTrend(
    userId: string,
    currentVO2: number,
  ): Promise<{ trend_percent: number; previous_value: number | null }> {
    // Buscamos as últimas atividades válidas para corrida (>= 1km, >= 5min)
    // e selecionamos a primeira anterior à atual cuja estimativa de VO²
    // seja válida. Antes filtrávamos por average_heartrate IS NOT NULL,
    // o que zerava a tendência para usuários só-telefone (sem monitor
    // cardíaco) — agora calculamos pace_based quando HR não existe,
    // exatamente como no cálculo do valor atual.
    const { data: previousActivities } = await this.supabaseService
      .from('activities')
      .select(
        'average_pace, average_heartrate, distance, moving_time, start_date',
      )
      .eq('user_id', userId)
      .gte('distance', 1000)
      .gte('moving_time', 300)
      .order('start_date', { ascending: false })
      .limit(10);

    if (!previousActivities || previousActivities.length < 2) {
      return { trend_percent: 0, previous_value: null };
    }

    // [0] é a atividade atual; procuramos a próxima cuja estimativa seja válida.
    for (let i = 1; i < previousActivities.length; i++) {
      const prev = previousActivities[i];
      const prevVO2 = this.calculateVO2MaxEstimate(
        prev.average_pace,
        prev.average_heartrate,
        prev.distance,
        prev.moving_time,
      );
      if (!prevVO2.isValid) continue;

      const trendPercent = ((currentVO2 - prevVO2.value) / prevVO2.value) * 100;
      return {
        trend_percent: Math.round(trendPercent * 10) / 10,
        previous_value: prevVO2.value,
      };
    }

    return { trend_percent: 0, previous_value: null };
  }

  /**
   * Get workout history with feedback status for Training History screen
   */
  async getWorkoutHistory(userId: string, limit = 20, offset = 0) {
    try {
      const { data: activities, error: activitiesError } =
        await this.supabaseService
          .from('activities')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'Run')
          .order('start_date', { ascending: false })
          .range(offset, offset + limit - 1);

      if (activitiesError) {
        this.logger.error('Failed to fetch workout history', activitiesError);
        throw activitiesError;
      }

      if (!activities || activities.length === 0) {
        return {
          summary: {
            total_distance: 0,
            total_activities: 0,
            total_elevation: 0,
          },
          months: [],
          hasMore: false,
        };
      }

      const activityIds = activities.map((a) => a.id);
      const { data: feedbacks } = await this.supabaseService
        .from('ai_feedbacks')
        .select('id, activity_id, hero_message, hero_tone, created_at')
        .in('activity_id', activityIds);

      const feedbackMap = new Map();
      if (feedbacks) {
        feedbacks.forEach((f) => {
          feedbackMap.set(f.activity_id, {
            id: f.id,
            hero_message: f.hero_message,
            hero_tone: f.hero_tone,
          });
        });
      }

      // Map source ('plan' | 'manual' | 'free') by activity_id so the
      // mobile history can route free/manual workouts to RunSummary
      // instead of the coach analysis screen.
      const { data: linkedWorkouts } = await this.supabaseService
        .from('workouts')
        .select('id, activity_id, source, title')
        .in('activity_id', activityIds);

      const workoutInfoMap = new Map<
        string,
        { workout_id: string; source: string | null; title: string | null }
      >();
      if (linkedWorkouts) {
        linkedWorkouts.forEach((w) => {
          if (w.activity_id) {
            workoutInfoMap.set(w.activity_id, {
              workout_id: w.id,
              source: w.source ?? null,
              title: w.title ?? null,
            });
          }
        });
      }

      const totalDistance =
        activities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
      const totalElevation = activities.reduce(
        (sum, a) => sum + (a.total_elevation_gain || 0),
        0,
      );

      const monthGroups = new Map<string, any[]>();

      activities.forEach((activity) => {
        const date = new Date(activity.start_date);
        const monthKey = `${date.toLocaleString('pt-BR', { month: 'long' })} ${date.getFullYear()}`;

        if (!monthGroups.has(monthKey)) {
          monthGroups.set(monthKey, []);
        }

        const linked = workoutInfoMap.get(activity.id);
        const workout = {
          id: activity.id,
          date: activity.start_date,
          day: date.getDate(),
          day_of_week: date
            .toLocaleDateString('pt-BR', { weekday: 'short' })
            .toUpperCase(),
          type: activity.type,
          name: activity.name,
          distance: activity.distance,
          moving_time: activity.moving_time,
          average_speed: activity.average_speed,
          pace:
            activity.average_speed > 0
              ? (1000 / activity.average_speed / 60).toFixed(2)
              : null,
          elevation_gain: activity.total_elevation_gain || 0,
          // Surface treadmill flag so the history → RunSummary navigation can
          // pre-select the right layout without waiting for re-hydration.
          environment: activity.environment ?? 'outdoor',
          feedback: feedbackMap.get(activity.id) || null,
          workout_id: linked?.workout_id ?? null,
          source: linked?.source ?? null,
          title: linked?.title ?? null,
        };

        monthGroups.get(monthKey).push(workout);
      });

      const months = Array.from(monthGroups.entries()).map(
        ([month, workouts]) => ({
          month,
          workouts,
        }),
      );

      return {
        summary: {
          total_distance: parseFloat(totalDistance.toFixed(1)),
          total_activities: activities.length,
          total_elevation: parseFloat(totalElevation.toFixed(0)),
        },
        months,
        hasMore: activities.length === limit,
      };
    } catch (error) {
      this.logger.error('Error in getWorkoutHistory', error);
      throw error;
    }
  }

  private getWorkoutTypeName(type: string): string {
    const types: Record<string, string> = {
      easy_run: 'Corrida Leve',
      long_run: 'Long Run',
      intervals: 'Treino Intervalado',
      tempo: 'Tempo Run',
      recovery: 'Corrida de Recuperação',
    };
    return types[type] || type;
  }

  private formatSplits(
    splits?: Array<{ split: number; average_speed: number }>,
  ) {
    if (!splits || splits.length === 0) return 'Não disponível';

    return splits
      .slice(0, 10)
      .map((s) => {
        const paceMinPerKm =
          s.average_speed > 0 ? 1000 / s.average_speed / 60 : 0;
        return `- Km ${s.split}: ${paceMinPerKm.toFixed(2)} min/km`;
      })
      .join('\n');
  }
}
