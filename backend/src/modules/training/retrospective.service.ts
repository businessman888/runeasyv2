import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../database';
import Anthropic from '@anthropic-ai/sdk';

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

@Injectable()
export class RetrospectiveService {
    private readonly logger = new Logger(RetrospectiveService.name);
    private readonly SAO_PAULO_OFFSET_HOURS = -3;
    private anthropic: Anthropic;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
    ) {
        const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        if (apiKey) {
            this.anthropic = new Anthropic({ apiKey });
        }
    }

    /**
     * Get São Paulo date for consistent timezone handling
     */
    private getSaoPauloToday(): { date: Date; dateStr: string } {
        const nowUtc = new Date();
        const saoPauloNow = new Date(nowUtc.getTime() + (this.SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000));

        const year = saoPauloNow.getUTCFullYear();
        const month = String(saoPauloNow.getUTCMonth() + 1).padStart(2, '0');
        const day = String(saoPauloNow.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const date = new Date(`${dateStr}T00:00:00`);
        return { date, dateStr };
    }

    /**
     * Check for plans that have ended and need retrospective generation
     * Called by scheduler at midnight São Paulo time
     */
    async checkForCompletedPlans(): Promise<void> {
        const { dateStr: today } = this.getSaoPauloToday();
        this.logger.log(`[Retrospective] Checking for completed plans on ${today} (São Paulo)`);

        try {
            const supabase = this.supabaseService.getClient();

            // Find active plans where end_date has passed
            const { data: completedPlans, error } = await supabase
                .from('training_plans')
                .select('id, user_id, created_at, duration_weeks')
                .eq('status', 'active')
                .not('id', 'in',
                    supabase.from('plan_retrospectives').select('plan_id')
                );

            if (error) {
                this.logger.error('[Retrospective] Error fetching plans:', error);
                return;
            }

            for (const plan of completedPlans || []) {
                // Calculate plan end date
                const startDate = new Date(plan.created_at);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + (plan.duration_weeks * 7));

                const endDateStr = endDate.toISOString().split('T')[0];

                if (endDateStr <= today) {
                    this.logger.log(`[Retrospective] Plan ${plan.id} has ended (${endDateStr}), generating retrospective...`);
                    await this.generateRetrospective(plan.user_id, plan.id);
                }
            }
        } catch (error) {
            this.logger.error('[Retrospective] Error in checkForCompletedPlans:', error);
        }
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

            this.logger.log(`[Retrospective] Successfully generated for plan ${planId}`);
            return this.mapToRetrospective(updated);

        } catch (error) {
            this.logger.error('[Retrospective] Error generating:', error);
            return null;
        }
    }

    /**
     * Calculate metrics by comparing planned workouts with Strava activities
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

        // Get Strava activities for this period
        const { data: activities } = await supabase
            .from('strava_activities')
            .select('*')
            .eq('user_id', userId)
            .gte('start_date', planStart.toISOString())
            .lte('start_date', planEnd.toISOString())
            .eq('type', 'Run');

        // Calculate actual distance from Strava
        const totalDistanceKm = activities?.reduce((sum, a) => sum + ((a.distance || 0) / 1000), 0) || 0;

        // Calculate average pace from Strava (seconds per km)
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
        // Fallback if no API key
        if (!this.anthropic) {
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

            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1000,
                temperature: 0.7,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            });

            const textContent = message.content.find(block => block.type === 'text');
            if (textContent && textContent.type === 'text') {
                const result = this.extractJSON<AIRetrospectiveContent>(textContent.text);
                return result;
            }
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
     */
    async acceptSuggestion(userId: string, retrospectiveId: string): Promise<any> {
        const supabase = this.supabaseService.getClient();

        const { data: retro } = await supabase
            .from('plan_retrospectives')
            .select('*')
            .eq('id', retrospectiveId)
            .eq('user_id', userId)
            .single();

        if (!retro) {
            throw new Error('Retrospective not found');
        }

        // Return the suggested goal info for the frontend to start onboarding
        return {
            suggestedGoal: retro.suggested_next_goal,
            suggestedGoalType: retro.suggested_next_goal_type,
            message: 'Use this info to pre-fill the onboarding for next plan',
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
    private extractJSON<T>(text: string): T {
        let cleaned = text.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        return JSON.parse(cleaned.trim()) as T;
    }

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
}
