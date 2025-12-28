import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';

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
    private anthropic: Anthropic;

    constructor(
        private configService: ConfigService,
        private supabaseService: SupabaseService,
        @Inject(forwardRef(() => NotificationService))
        private notificationService: NotificationService,
    ) {
        const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        this.anthropic = new Anthropic({ apiKey });
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
            .from('strava_activities')
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

        // 3. Generate feedback with Claude
        const feedback = await this.callClaudeForFeedback(comparison, workout.type);

        // 4. Save feedback to database
        const { data: savedFeedback, error } = await this.supabaseService
            .from('ai_feedbacks')
            .insert({
                user_id: userId,
                workout_id: workoutId,
                strava_activity_id: activityId,
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
     * Call Claude API to generate workout feedback
     */
    private async callClaudeForFeedback(
        comparison: WorkoutComparison,
        workoutType: string,
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
            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            });

            const textContent = message.content.find((block) => block.type === 'text');
            if (!textContent || textContent.type !== 'text') {
                throw new Error('No text content in AI response');
            }

            return this.extractJSON(textContent.text);
        } catch (error) {
            this.logger.error('Failed to generate feedback with Claude', error);
            throw error;
        }
    }

    /**
     * Get user's feedback history
     */
    async getFeedbackHistory(userId: string, limit = 10) {
        const { data, error } = await this.supabaseService
            .from('ai_feedbacks')
            .select('*, workouts(*), strava_activities(*)')
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
            .select('*, workouts(*), strava_activities(*)')
            .eq('id', feedbackId)
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        return data;
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
     * Get workout history with feedback status for Training History screen
     */
    async getWorkoutHistory(userId: string, limit = 20, offset = 0) {
        try {
            // 1. Fetch Strava activities for the user
            const { data: activities, error: activitiesError } = await this.supabaseService
                .from('strava_activities')
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

            // 2. Fetch feedback for these activities
            const activityIds = activities.map(a => a.id);
            const { data: feedbacks } = await this.supabaseService
                .from('ai_feedbacks')
                .select('id, strava_activity_id, hero_message, hero_tone, created_at')
                .in('strava_activity_id', activityIds);

            // Create a map of activity_id -> feedback
            const feedbackMap = new Map();
            if (feedbacks) {
                feedbacks.forEach(f => {
                    feedbackMap.set(f.strava_activity_id, {
                        id: f.id,
                        hero_message: f.hero_message,
                        hero_tone: f.hero_tone,
                    });
                });
            }

            // 3. Calculate summary stats
            const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
            const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);

            // 4. Group by month
            const monthGroups = new Map<string, any[]>();

            activities.forEach((activity) => {
                const date = new Date(activity.start_date);
                const monthKey = `${date.toLocaleString('pt-BR', { month: 'long' })} ${date.getFullYear()}`;

                if (!monthGroups.has(monthKey)) {
                    monthGroups.set(monthKey, []);
                }

                // Format workout data
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

            // 5. Convert to array format
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

    private extractJSON(text: string): GeneratedFeedback {
        let cleaned = text.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        return JSON.parse(cleaned);
    }
}
