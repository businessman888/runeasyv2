import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { TrainingService } from './training.service';
import { TrainingPlanRequest } from './training-ai.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';

/**
 * Metrics calculated from comparing planned vs actual performance
 */
export interface RetrospectiveMetrics {
    totalDistanceKm: number;
    totalDistancePlannedKm: number;
    distanceVsGoalPercent: number;

    avgPaceSeconds: number;
    targetPaceSeconds: number;
    paceVsGoalPercent: number;

    totalWorkoutsCompleted: number;
    totalWorkoutsPlanned: number;
    completionRate: number;
    frequencyVsGoalPercent: number;

    // Readiness data for AI context
    avgReadinessScore: number;
    readinessCheckIns: number;
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
    completionRate: number;

    // Comparisons
    distanceVsGoalPercent: number;
    paceVsGoalPercent: number;
    frequencyVsGoalPercent: number;

    // AI Content
    aiInsights: string;
    suggestedNextGoal: string;
    suggestedNextGoalType: string;

    // Status
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    processedAt: string | null;
}

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
            day: '2-digit'
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
    async checkForCompletedPlans(): Promise<Array<{ userId: string, retroId: string }>> {
        const { dateStr: today } = this.getSaoPauloToday();
        this.logger.log(`[Retrospective] Checking for completed plans on ${today} (São Paulo)`);

        const generatedRetros: Array<{ userId: string, retroId: string }> = [];

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

            // Check each plan to see if it has ended and needs retrospective
            for (const plan of activePlans || []) {
                // Check if retrospective already exists
                const { data: existingRetro } = await supabase
                    .from('plan_retrospectives')
                    .select('id')
                    .eq('plan_id', plan.id)
                    .maybeSingle();

                if (existingRetro) {
                    continue; // Skip if retrospective already exists
                }

                // Calculate plan end date
                const startDate = new Date(plan.created_at);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + (plan.duration_weeks * 7));

                const endDateStr = endDate.toISOString().split('T')[0];

                if (endDateStr <= today) {
                    this.logger.log(`[Retrospective] Plan ${plan.id} has ended (${endDateStr}), generating retrospective...`);
                    const retro = await this.generateRetrospective(plan.user_id, plan.id);
                    if (retro) {
                        generatedRetros.push({ userId: plan.user_id, retroId: retro.id });
                    }
                }
            }
        } catch (error) {
            this.logger.error('[Retrospective] Error in checkForCompletedPlans:', error);
        }

        return generatedRetros;
    }

    /**
     * Generate a complete retrospective for a training plan
     */
    async generateRetrospective(userId: string, planId: string): Promise<Retrospective | null> {
        this.logger.log(`[Retrospective] Starting generation for user ${userId}, plan ${planId}`);

        try {
            const supabase = this.supabaseService.getClient();

            // Create pending retrospective record
            const { data: retro, error: createError } = await supabase
                .from('plan_retrospectives')
                .insert({
                    user_id: userId,
                    plan_id: planId,
                    status: 'processing',
                })
                .select()
                .single();

            if (createError) {
                this.logger.error('[Retrospective] Failed to create record:', createError);
                return null;
            }

            // Calculate metrics
            const metrics = await this.calculateMetrics(userId, planId);
            this.logger.log(`[Retrospective] Metrics calculated:`, JSON.stringify(metrics));

            // Generate AI insights
            const aiContent = await this.generateAIInsights(metrics, userId);
            this.logger.log(`[Retrospective] AI content generated`);

            // Update retrospective with results
            const { data: updated, error: updateError } = await supabase
                .from('plan_retrospectives')
                .update({
                    total_distance_km: metrics.totalDistanceKm,
                    total_workouts_completed: metrics.totalWorkoutsCompleted,
                    total_workouts_planned: metrics.totalWorkoutsPlanned,
                    avg_pace_seconds: metrics.avgPaceSeconds,
                    completion_rate: metrics.completionRate,
                    distance_vs_goal_percent: metrics.distanceVsGoalPercent,
                    pace_vs_goal_percent: metrics.paceVsGoalPercent,
                    frequency_vs_goal_percent: metrics.frequencyVsGoalPercent,
                    ai_insights: aiContent.insights,
                    suggested_next_goal: aiContent.suggestedNextGoal,
                    suggested_next_goal_type: aiContent.suggestedNextGoalType,
                    status: 'completed',
                    processed_at: new Date().toISOString(),
                })
                .eq('id', retro.id)
                .select()
                .single();

            if (updateError) {
                this.logger.error('[Retrospective] Failed to update record:', updateError);
                return null;
            }

            // Mark plan as completed
            await supabase
                .from('training_plans')
                .update({ status: 'completed' })
                .eq('id', planId);

            // Send push notification and create notification record
            await this.sendRetrospectiveNotification(userId, updated.id);

            this.logger.log(`[Retrospective] Successfully generated for plan ${planId}`);
            return this.mapToRetrospective(updated);

        } catch (error) {
            this.logger.error('[Retrospective] Error generating:', error);
            return null;
        }
    }

    /**
     * Calculate metrics by comparing planned workouts with recorded activities
     */
    private async calculateMetrics(userId: string, planId: string): Promise<RetrospectiveMetrics> {
        const supabase = this.supabaseService.getClient();

        // Get plan info
        const { data: plan } = await supabase
            .from('training_plans')
            .select('created_at, duration_weeks')
            .eq('id', planId)
            .single();

        const planStart = new Date(plan?.created_at || new Date());
        const planEnd = new Date(planStart);
        planEnd.setDate(planEnd.getDate() + ((plan?.duration_weeks || 4) * 7));

        // Get planned workouts
        const { data: workouts } = await supabase
            .from('workouts')
            .select('*')
            .eq('plan_id', planId);

        const totalWorkoutsPlanned = workouts?.length || 0;
        const completedWorkouts = workouts?.filter(w => w.status === 'completed') || [];
        const totalWorkoutsCompleted = completedWorkouts.length;

        // Calculate planned distance
        const totalDistancePlannedKm = workouts?.reduce((sum, w) => sum + (w.distance_km || 0), 0) || 0;

        // Get activities for this period
        const { data: activities } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', userId)
            .gte('start_date', planStart.toISOString())
            .lte('start_date', planEnd.toISOString())
            .eq('type', 'Run');

        // Calculate actual distance from activities
        const totalDistanceKm = activities?.reduce((sum, a) => sum + ((a.distance || 0) / 1000), 0) || 0;

        // Calculate average pace from activities (seconds per km)
        let avgPaceSeconds = 0;
        if (activities && activities.length > 0) {
            const totalTime = activities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
            const totalDist = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
            if (totalDist > 0) {
                avgPaceSeconds = Math.round((totalTime / totalDist) * 1000);
            }
        }

        // Get target pace from workouts (average of planned paces)
        let targetPaceSeconds = 360; // Default 6:00/km
        if (workouts && workouts.length > 0) {
            const pacesSum = workouts.reduce((sum, w) => {
                if (w.instructions_json && Array.isArray(w.instructions_json)) {
                    const mainSegment = w.instructions_json.find((s: any) => s.type === 'main');
                    if (mainSegment && mainSegment.pace_min) {
                        return sum + (mainSegment.pace_min * 60);
                    }
                }
                return sum + 360;
            }, 0);
            targetPaceSeconds = Math.round(pacesSum / workouts.length);
        }

        // Get readiness data for AI context
        const { data: readinessHistory } = await supabase
            .from('readiness_history')
            .select('score')
            .eq('user_id', userId)
            .gte('created_at', planStart.toISOString())
            .lte('created_at', planEnd.toISOString());

        const avgReadinessScore = readinessHistory && readinessHistory.length > 0
            ? readinessHistory.reduce((sum, r) => sum + (r.score || 0), 0) / readinessHistory.length
            : 0;

        // Calculate percentages
        const distanceVsGoalPercent = totalDistancePlannedKm > 0
            ? Math.round((totalDistanceKm / totalDistancePlannedKm) * 100)
            : 0;

        const paceVsGoalPercent = targetPaceSeconds > 0 && avgPaceSeconds > 0
            ? Math.round((targetPaceSeconds / avgPaceSeconds) * 100) // Lower pace = better
            : 0;

        const completionRate = totalWorkoutsPlanned > 0
            ? Math.round((totalWorkoutsCompleted / totalWorkoutsPlanned) * 100)
            : 0;

        const frequencyVsGoalPercent = completionRate;

        return {
            totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
            totalDistancePlannedKm,
            distanceVsGoalPercent,
            avgPaceSeconds,
            targetPaceSeconds,
            paceVsGoalPercent,
            totalWorkoutsCompleted,
            totalWorkoutsPlanned,
            completionRate,
            frequencyVsGoalPercent,
            avgReadinessScore: Math.round(avgReadinessScore * 10) / 10,
            readinessCheckIns: readinessHistory?.length || 0,
        };
    }

    /**
     * Generate AI-powered insights and next goal suggestion
     */
    private async generateAIInsights(
        metrics: RetrospectiveMetrics,
        userId: string
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

            const userPrompt = `Métricas do Ciclo:
- Distância Total: ${metrics.totalDistanceKm}km (${metrics.distanceVsGoalPercent}% da meta de ${metrics.totalDistancePlannedKm}km)
- Pace Médio: ${this.formatPace(metrics.avgPaceSeconds)} (meta era ${this.formatPace(metrics.targetPaceSeconds)})
- Taxa de Conclusão: ${metrics.completionRate}% (${metrics.totalWorkoutsCompleted}/${metrics.totalWorkoutsPlanned} treinos)
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
                systemPrompt: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
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
    private getFallbackInsights(metrics: RetrospectiveMetrics): AIRetrospectiveContent {
        const performanceLevel = metrics.completionRate >= 80 ? 'excelente' :
            metrics.completionRate >= 60 ? 'bom' : 'moderado';

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

        const { data, error } = await supabase
            .from('plan_retrospectives')
            .select('*')
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
    async acceptSuggestion(userId: string, retrospectiveId: string): Promise<any> {
        const supabase = this.supabaseService.getClient();

        this.logger.log(`[AcceptSuggestion] Starting for user ${userId}, retro ${retrospectiveId}`);

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

        this.logger.log(`[AcceptSuggestion] Found retro with goal: ${retro.suggested_next_goal_type}`);

        // 2. Archive retrospective
        await supabase
            .from('plan_retrospectives')
            .update({ status: 'archived' })
            .eq('id', retrospectiveId);

        // 3. Get old plan to inherit some parameters
        const { data: oldPlan } = await supabase
            .from('training_plans')
            .select('id, goal, level, days_per_week, target_pace, duration_weeks')
            .eq('id', retro.plan_id)
            .single();

        // Archive old plan
        if (oldPlan) {
            await supabase
                .from('training_plans')
                .update({ status: 'archived' })
                .eq('id', oldPlan.id);

            this.logger.log(`[AcceptSuggestion] Archived old plan ${oldPlan.id}`);
        }

        // 4. Build TrainingPlanRequest from suggestion + old plan params
        const newGoalType = retro.suggested_next_goal_type || oldPlan?.goal || '5k';
        const level = oldPlan?.level || 'intermediate';
        const daysPerWeek = oldPlan?.days_per_week || 3;

        // Use avg pace from retrospective as current pace
        const currentPace5k = retro.avg_pace_seconds
            ? retro.avg_pace_seconds / 60 // Convert to minutes
            : null;

        const planRequest: TrainingPlanRequest = {
            goal: newGoalType,
            level: level,
            daysPerWeek: daysPerWeek,
            currentPace5k: currentPace5k,
            targetWeeks: 8, // Standard cycle
            limitations: null,
            preferredDays: [], // Will be filled by AI
        };

        this.logger.log(`[AcceptSuggestion] Creating new plan with: goal=${newGoalType}, level=${level}, days=${daysPerWeek}`);

        // 5. Generate new plan
        const newPlan = await this.trainingService.createQuickPlan(userId, planRequest);

        this.logger.log(`[AcceptSuggestion] New plan created: ${newPlan.plan_id}`);

        // 6. Delete notifications related to this retrospective
        await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .or(`type.eq.retrospective_ready,metadata->>retrospectiveId.eq.${retrospectiveId}`);

        this.logger.log(`[AcceptSuggestion] Deleted related notifications`);

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
    async customizePlan(userId: string, retrospectiveId: string, params: CustomizePlanDto): Promise<any> {
        const supabase = this.supabaseService.getClient();
        this.logger.log(`[CustomizePlan] Starting for user ${userId}, retro ${retrospectiveId}`);

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

        // 3. Archive old plan
        if (retro.plan_id) {
            await supabase
                .from('training_plans')
                .update({ status: 'archived' })
                .eq('id', retro.plan_id);
        }

        // 4. Map Params to TrainingPlanRequest
        // Map simplified days ["Dom", "Seg"] to number[] [0, 1]
        const dayMap: Record<string, number> = { 'Dom': 0, 'Seg': 1, 'Ter': 2, 'Qua': 3, 'Qui': 4, 'Sex': 5, 'Sáb': 6 };
        const preferredDays = params.training_days.map(d => dayMap[d] ?? 0);

        // Parse pace "5:30" -> pace number if needed, but AI takes text description in prompts better sometimes
        // Actually, TrainingPlanRequest expects currentPace5k as number, but we added optional targetPace as string.
        // We will pass the manual targetPace string directly.

        const planRequest: TrainingPlanRequest = {
            goal: params.distance_goal, // '5k', '10k', '21km', '42km'
            level: 'intermediate', // Default or infer? Let's keep 'intermediate' or try to fetch from user stats if possible. For now intermediate is safe.
            daysPerWeek: params.training_days.length,
            currentPace5k: null, // Let AI rely on targetPace
            targetWeeks: params.duration_weeks,
            limitations: null,
            preferredDays: preferredDays,
            targetTime: params.time_goal,
            targetPace: params.target_pace,
        };

        this.logger.log(`[CustomizePlan] Creating plan with target pace: ${params.target_pace}`);

        // 5. Generate new plan
        const newPlan = await this.trainingService.createQuickPlan(userId, planRequest);

        // 6. Delete notifications
        await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            // Cleanup both retro ready and generic notifications for this flow
            .or(`type.eq.retrospective_ready`);

        return {
            success: true,
            newPlanId: newPlan.plan_id,
            planHeader: newPlan.planHeader,
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
        return {
            id: data.id,
            userId: data.user_id,
            planId: data.plan_id,
            totalDistanceKm: data.total_distance_km,
            totalWorkoutsCompleted: data.total_workouts_completed,
            totalWorkoutsPlanned: data.total_workouts_planned,
            avgPaceSeconds: data.avg_pace_seconds,
            completionRate: data.completion_rate,
            distanceVsGoalPercent: data.distance_vs_goal_percent,
            paceVsGoalPercent: data.pace_vs_goal_percent,
            frequencyVsGoalPercent: data.frequency_vs_goal_percent,
            aiInsights: data.ai_insights,
            suggestedNextGoal: data.suggested_next_goal,
            suggestedNextGoalType: data.suggested_next_goal_type,
            status: data.status,
            createdAt: data.created_at,
            processedAt: data.processed_at,
        };
    }

    /**
     * Send push notification and create notification record when retrospective is ready
     */
    private async sendRetrospectiveNotification(userId: string, retrospectiveId: string): Promise<void> {
        try {
            const supabase = this.supabaseService.getClient();

            // Create notification record in the database
            const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: 'recovery_analysis',
                    title: 'Sua retrospectiva está pronta! 🏆',
                    description: 'Veja como foi seu desempenho no ciclo e receba sugestões para o próximo plano.',
                    is_read: false,
                    metadata: {
                        retrospectiveId,
                        screen: 'Retrospective',
                        type: 'retrospective_ready',
                    },
                });

            if (notifError) {
                this.logger.warn('[Retrospective] Failed to create notification record:', notifError);
            } else {
                this.logger.log('[Retrospective] Notification record created');
            }

            // Send push notification
            const pushSent = await this.notificationService.sendPushNotification(
                userId,
                'Sua retrospectiva está pronta! 🏆',
                'Veja como foi seu desempenho no ciclo e receba sugestões para o próximo plano.',
                {
                    type: 'retrospective_ready',
                    screen: 'Retrospective',
                    retrospectiveId,
                },
                { channelId: 'reminders' }
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

