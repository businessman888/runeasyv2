import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';

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
        average_pace: number;
        max_pace: number;
        elevation_gain: number;
        average_heartrate?: number;
        splits_metric?: Array<{
            split: number;
            average_speed: number;
            elevation_difference: number;
        }>;
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
    ) {}

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
            },
        };

        // 3. Generate feedback with AI Router
        const feedback = await this.callAIForFeedback(comparison, workout.type, userId);

        // 4. Save feedback to database
        const { data: savedFeedback, error } = await this.supabaseService
            .from('ai_feedbacks')
            .insert({
                user_id: userId,
                workout_id: workoutId,
                activity_id: activityId,
                hero_message: feedback.hero_message,
                hero_tone: feedback.hero_tone,
                metrics_comparison: feedback.metrics_comparison,
                strengths: feedback.strengths,
                improvements: feedback.improvements,
                progression_impact: feedback.progression_impact,
            })
            .select()
            .single();

        if (error) {
            this.logger.error('Failed to save feedback', error);
            throw error;
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
        const plannedPaceRange = comparison.planned.segments.length > 0
            ? `${comparison.planned.segments[0].pace_min?.toFixed(1) || '?'}-${comparison.planned.segments[0].pace_max?.toFixed(1) || '?'} min/km`
            : 'não especificado';

        const distanceDiff = ((executedDistanceKm - comparison.planned.distance_km) / comparison.planned.distance_km) * 100;

        const userPrompt = `Analise este treino e gere um feedback detalhado:

TREINO PLANEJADO:
- Tipo: ${this.getWorkoutTypeName(workoutType)}
- Distância: ${comparison.planned.distance_km} km
- Pace alvo: ${plannedPaceRange}
- Objetivo: ${comparison.planned.objective}

TREINO EXECUTADO:
- Distância: ${executedDistanceKm.toFixed(2)} km (${distanceDiff > 0 ? '+' : ''}${distanceDiff.toFixed(1)}%)
- Pace médio: ${comparison.executed.average_pace?.toFixed(2) || 'N/A'} min/km
- Pace máximo: ${comparison.executed.max_pace?.toFixed(2) || 'N/A'} min/km
- Tempo total: ${Math.floor(comparison.executed.moving_time / 60)} minutos
- Elevação: ${comparison.executed.elevation_gain?.toFixed(0) || 0}m
${comparison.executed.average_heartrate ? `- FC média: ${comparison.executed.average_heartrate} bpm` : ''}

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
      "executed": "${comparison.executed.average_pace?.toFixed(2) || 'N/A'} min/km",
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
                systemPrompt: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
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
    async getLatestActivityWithFeedback(userId: string) {
        // 1. Get latest activity
        const { data: latestActivity, error: activityError } = await this.supabaseService
            .from('activities')
            .select('*')
            .eq('user_id', userId)
            .order('start_date', { ascending: false })
            .limit(1)
            .single();

        if (activityError || !latestActivity) {
            return { activity: null, feedback: null, efficiency_percent: 0, conquest: null };
        }

        // 2. Get associated feedback if exists
        const { data: feedback } = await this.supabaseService
            .from('ai_feedbacks')
            .select('id, hero_message, hero_tone, strengths, improvements, metrics_comparison, workout_id')
            .eq('activity_id', latestActivity.id)
            .single();

        // 3. Get linked workout to check goal
        const { data: linkedWorkout } = await this.supabaseService
            .from('workouts')
            .select('id, distance_km, type')
            .eq('activity_id', latestActivity.id)
            .single();

        // 4. Calculate if goal was met (distance comparison)
        let goalMet = false;
        let plannedDistanceKm = 0;
        let executedDistanceKm = latestActivity.distance / 1000;

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
        const isYesterday = activityDate.toDateString() === yesterday.toDateString();

        let dateLabel = activityDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        if (isToday) dateLabel = 'hoje';
        else if (isYesterday) dateLabel = 'ontem';

        // 8. Format pace (min:sec per km)
        const paceMinPerKm = latestActivity.average_pace || 0;
        const paceMinutes = Math.floor(paceMinPerKm);
        const paceSeconds = Math.round((paceMinPerKm - paceMinutes) * 60);
        const formattedPace = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;

        // 9. Calculate VO2 Max estimate
        const vo2Estimate = this.calculateVO2MaxEstimate(
            latestActivity.average_pace || 0,
            latestActivity.average_heartrate,
            latestActivity.distance,
            latestActivity.moving_time
        );

        // 10. Check if workout was interrupted (from hero_message)
        const isInterrupted = feedback?.hero_message?.toLowerCase().includes('interrompido') ||
            feedback?.hero_message?.toLowerCase().includes('incompleto') ||
            feedback?.hero_tone === 'caution';

        // 11. Get VO2 Max trend (only if workout completed properly)
        let vo2Trend = { trend_percent: 0, previous_value: null as number | null };
        if (vo2Estimate.isValid && !isInterrupted) {
            vo2Trend = await this.getVO2MaxTrend(userId, vo2Estimate.value);
        }

        // Build VO2 Max response object
        const vo2Max = vo2Estimate.isValid ? {
            current_value: vo2Estimate.value,
            trend_percent: isInterrupted ? 0 : vo2Trend.trend_percent,
            previous_value: vo2Trend.previous_value,
            is_valid: true,
            is_interrupted: isInterrupted,
            has_heartrate: !!latestActivity.average_heartrate,
            message: isInterrupted
                ? 'Treino interrompido - sem evolução'
                : (!latestActivity.average_heartrate ? 'Estimativa baseada apenas no pace' : null)
        } : {
            current_value: 0,
            trend_percent: 0,
            previous_value: null,
            is_valid: false,
            is_interrupted: false,
            has_heartrate: false,
            message: 'Dados insuficientes para cálculo'
        };

        return {
            activity: {
                id: latestActivity.id,
                name: latestActivity.name,
                distance: latestActivity.distance,
                distance_km: executedDistanceKm.toFixed(1),
                moving_time: latestActivity.moving_time,
                average_pace: latestActivity.average_pace,
                formatted_pace: formattedPace,
                elevation_gain: latestActivity.elevation_gain || 0,
                average_heartrate: latestActivity.average_heartrate,
                start_date: latestActivity.start_date,
                date_label: dateLabel,
            },
            feedback: feedback ? {
                id: feedback.id,
                hero_message: feedback.hero_message,
                hero_tone: feedback.hero_tone,
                strengths: feedback.strengths || [],
                improvements: feedback.improvements || [],
            } : null,
            efficiency_percent: Math.round(efficiencyPercent * 10) / 10,
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
        averagePaceMinPerKm: number,
        averageHeartrate: number | null,
        distanceMeters: number,
        movingTimeSeconds: number
    ): { value: number; isValid: boolean; method: string } {
        if (distanceMeters < 1000 || movingTimeSeconds < 300) {
            return { value: 0, isValid: false, method: 'insufficient_data' };
        }

        const velocityMPerMin = 1000 / averagePaceMinPerKm;
        const vo2FromPace = -4.60 + (0.182258 * velocityMPerMin) + (0.000104 * Math.pow(velocityMPerMin, 2));

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
            method
        };
    }

    /**
     * Get VO2 Max trend by comparing with previous estimates
     */
    async getVO2MaxTrend(userId: string, currentVO2: number): Promise<{ trend_percent: number; previous_value: number | null }> {
        const { data: previousActivities } = await this.supabaseService
            .from('activities')
            .select('average_pace, average_heartrate, distance, moving_time, start_date')
            .eq('user_id', userId)
            .not('average_heartrate', 'is', null)
            .gte('distance', 1000)
            .order('start_date', { ascending: false })
            .limit(5);

        if (!previousActivities || previousActivities.length < 2) {
            return { trend_percent: 0, previous_value: null };
        }

        const prevActivity = previousActivities[1];
        const prevVO2 = this.calculateVO2MaxEstimate(
            prevActivity.average_pace,
            prevActivity.average_heartrate,
            prevActivity.distance,
            prevActivity.moving_time
        );

        if (!prevVO2.isValid) {
            return { trend_percent: 0, previous_value: null };
        }

        const trendPercent = ((currentVO2 - prevVO2.value) / prevVO2.value) * 100;

        return {
            trend_percent: Math.round(trendPercent * 10) / 10,
            previous_value: prevVO2.value
        };
    }

    /**
     * Get workout history with feedback status for Training History screen
     */
    async getWorkoutHistory(userId: string, limit = 20, offset = 0) {
        try {
            const { data: activities, error: activitiesError } = await this.supabaseService
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

            const activityIds = activities.map(a => a.id);
            const { data: feedbacks } = await this.supabaseService
                .from('ai_feedbacks')
                .select('id, activity_id, hero_message, hero_tone, created_at')
                .in('activity_id', activityIds);

            const feedbackMap = new Map();
            if (feedbacks) {
                feedbacks.forEach(f => {
                    feedbackMap.set(f.activity_id, {
                        id: f.id,
                        hero_message: f.hero_message,
                        hero_tone: f.hero_tone,
                    });
                });
            }

            const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
            const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);

            const monthGroups = new Map<string, any[]>();

            activities.forEach((activity) => {
                const date = new Date(activity.start_date);
                const monthKey = `${date.toLocaleString('pt-BR', { month: 'long' })} ${date.getFullYear()}`;

                if (!monthGroups.has(monthKey)) {
                    monthGroups.set(monthKey, []);
                }

                const workout = {
                    id: activity.id,
                    date: activity.start_date,
                    day: date.getDate(),
                    day_of_week: date.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase(),
                    type: activity.type,
                    name: activity.name,
                    distance: activity.distance,
                    moving_time: activity.moving_time,
                    average_speed: activity.average_speed,
                    pace: activity.average_speed > 0
                        ? (1000 / activity.average_speed / 60).toFixed(2)
                        : null,
                    elevation_gain: activity.total_elevation_gain || 0,
                    feedback: feedbackMap.get(activity.id) || null,
                };

                monthGroups.get(monthKey)!.push(workout);
            });

            const months = Array.from(monthGroups.entries()).map(([month, workouts]) => ({
                month,
                workouts,
            }));

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
            'easy_run': 'Corrida Leve',
            'long_run': 'Long Run',
            'intervals': 'Treino Intervalado',
            'tempo': 'Tempo Run',
            'recovery': 'Corrida de Recuperação',
        };
        return types[type] || type;
    }

    private formatSplits(splits?: Array<{ split: number; average_speed: number }>) {
        if (!splits || splits.length === 0) return 'Não disponível';

        return splits.slice(0, 10).map((s) => {
            const paceMinPerKm = s.average_speed > 0 ? 1000 / s.average_speed / 60 : 0;
            return `- Km ${s.split}: ${paceMinPerKm.toFixed(2)} min/km`;
        }).join('\n');
    }
}
