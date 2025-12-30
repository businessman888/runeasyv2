import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { TrainingAIService, TrainingPlanRequest, GeneratedPlan, QuickPlanResult, GeneratedWeek } from './training-ai.service';

// Generation status types
export type GenerationStatus = 'partial' | 'generating' | 'complete' | 'failed';

// Quick plan response for fast frontend rendering
export interface QuickPlanResponse {
    plan_id: string;
    generation_status: GenerationStatus;
    planHeader: QuickPlanResult['planHeader'];
    planHeadline: string;
    welcomeBadge: string;
    nextWorkout: QuickPlanResult['nextWorkout'];
    workouts_count: number;
}

@Injectable()
export class TrainingService {
    private readonly logger = new Logger(TrainingService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly trainingAIService: TrainingAIService,
    ) { }

    /**
     * Create a quick training plan (Prompt 1 only) - Fast response ~3-5s
     * Triggers background generation for remaining weeks
     */
    async createQuickPlan(userId: string, onboardingData: TrainingPlanRequest): Promise<QuickPlanResponse> {
        try {
            this.logger.log(`[Quick Plan] Starting fast plan generation for user ${userId}`);
            const startTime = Date.now();

            // PROMPT 1: Generate only first workout (fast ~3-5s)
            const quickResult = await this.trainingAIService.generateFirstWorkout(onboardingData);

            // Save training plan to database with partial status
            const { data: plan, error: planError } = await this.supabaseService
                .from('training_plans')
                .insert({
                    user_id: userId,
                    goal: onboardingData.goal,
                    duration_weeks: quickResult.duration_weeks,
                    frequency_per_week: quickResult.frequency_per_week,
                    plan_json: {
                        ...quickResult,
                        weeks: [quickResult.firstWeek], // Only first week initially
                    },
                    status: 'active',
                    generation_status: 'partial',
                    first_workout_json: quickResult.nextWorkout,
                })
                .select()
                .single();

            if (planError) throw planError;

            // Create workouts for week 1 only
            const workoutsToInsert = this.createWorkoutsForWeek(
                plan.id,
                userId,
                quickResult.firstWeek,
                new Date(),
            );

            const { error: workoutsError } = await this.supabaseService
                .from('workouts')
                .insert(workoutsToInsert);

            if (workoutsError) throw workoutsError;

            const elapsed = Date.now() - startTime;
            this.logger.log(`[Quick Plan] Created plan ${plan.id} with ${workoutsToInsert.length} workouts in ${elapsed}ms`);

            // TRIGGER BACKGROUND GENERATION (non-blocking)
            this.triggerBackgroundGeneration(
                plan.id,
                userId,
                onboardingData,
                quickResult.firstWeek,
            );

            // Return immediately with partial plan
            return {
                plan_id: plan.id,
                generation_status: 'partial',
                planHeader: quickResult.planHeader,
                planHeadline: quickResult.planHeadline,
                welcomeBadge: quickResult.welcomeBadge,
                nextWorkout: quickResult.nextWorkout,
                workouts_count: workoutsToInsert.length,
            };
        } catch (error) {
            this.logger.error('[Quick Plan] Failed to create quick plan', error);
            throw error;
        }
    }

    /**
     * Trigger background generation for remaining weeks (Prompt 2)
     * This runs asynchronously and doesn't block the response
     */
    private async triggerBackgroundGeneration(
        planId: string,
        userId: string,
        onboardingData: TrainingPlanRequest,
        firstWeek: GeneratedWeek,
    ): Promise<void> {
        // Update status to generating
        await this.supabaseService
            .from('training_plans')
            .update({ generation_status: 'generating' })
            .eq('id', planId);

        // Run in background (not awaited)
        this.completeFullSchedule(planId, userId, onboardingData, firstWeek)
            .then(() => {
                this.logger.log(`[Background] Completed full schedule for plan ${planId}`);
            })
            .catch((error) => {
                this.logger.error(`[Background] Failed to complete schedule for plan ${planId}`, error);
            });
    }

    /**
     * Complete the full schedule generation (Prompt 2)
     * Called in background after quick plan creation
     */
    async completeFullSchedule(
        planId: string,
        userId: string,
        onboardingData: TrainingPlanRequest,
        firstWeek: GeneratedWeek,
    ): Promise<void> {
        try {
            this.logger.log(`[Prompt 2] Starting full schedule generation for plan ${planId}`);
            const startTime = Date.now();

            // PROMPT 2: Generate remaining weeks
            const fullSchedule = await this.trainingAIService.generateRemainingSchedule(
                onboardingData,
                firstWeek,
            );

            // Get existing plan
            const { data: existingPlan, error: fetchError } = await this.supabaseService
                .from('training_plans')
                .select('plan_json')
                .eq('id', planId)
                .single();

            if (fetchError) throw fetchError;

            // Merge first week with remaining weeks
            const allWeeks = [firstWeek, ...fullSchedule.weeks];

            // Update plan with complete schedule
            const { error: updateError } = await this.supabaseService
                .from('training_plans')
                .update({
                    plan_json: {
                        ...existingPlan.plan_json,
                        weeks: allWeeks,
                    },
                    generation_status: 'complete',
                })
                .eq('id', planId);

            if (updateError) throw updateError;

            // Create workouts for weeks 2-N
            const today = new Date();
            const allWorkoutsToInsert = [];

            for (const week of fullSchedule.weeks) {
                const weekWorkouts = this.createWorkoutsForWeek(planId, userId, week, today);
                allWorkoutsToInsert.push(...weekWorkouts);
            }

            if (allWorkoutsToInsert.length > 0) {
                const { error: workoutsError } = await this.supabaseService
                    .from('workouts')
                    .insert(allWorkoutsToInsert);

                if (workoutsError) throw workoutsError;
            }

            const elapsed = Date.now() - startTime;
            this.logger.log(`[Prompt 2] Added ${allWorkoutsToInsert.length} workouts in ${elapsed}ms`);
        } catch (error) {
            this.logger.error(`[Prompt 2] Failed for plan ${planId}`, error);

            // Mark as failed
            await this.supabaseService
                .from('training_plans')
                .update({ generation_status: 'failed' })
                .eq('id', planId);

            throw error;
        }
    }

    /**
     * Get the generation status of a plan
     */
    async getPlanGenerationStatus(planId: string): Promise<{ status: GenerationStatus; workouts_count: number }> {
        const { data: plan, error: planError } = await this.supabaseService
            .from('training_plans')
            .select('generation_status')
            .eq('id', planId)
            .single();

        if (planError) throw planError;

        const { count, error: countError } = await this.supabaseService
            .from('workouts')
            .select('*', { count: 'exact', head: true })
            .eq('plan_id', planId);

        if (countError) throw countError;

        return {
            status: plan.generation_status || 'partial',
            workouts_count: count || 0,
        };
    }

    /**
     * Helper: Create workout records for a single week
     */
    private createWorkoutsForWeek(
        planId: string,
        userId: string,
        week: GeneratedWeek,
        baseDate: Date,
    ): any[] {
        const workoutsToInsert = [];

        for (const workout of week.workouts) {
            // Calculate workout date based on week number and day of week
            const weekStart = new Date(baseDate);
            weekStart.setDate(baseDate.getDate() + (week.week_number - 1) * 7);

            const workoutDate = new Date(weekStart);
            const currentDay = workoutDate.getDay();
            const targetDay = workout.day_of_week;
            const daysToAdd = (targetDay - currentDay + 7) % 7;
            workoutDate.setDate(workoutDate.getDate() + daysToAdd);

            workoutsToInsert.push({
                plan_id: planId,
                user_id: userId,
                week_number: week.week_number,
                scheduled_date: workoutDate.toISOString().split('T')[0],
                type: workout.type,
                distance_km: workout.distance_km,
                instructions_json: workout.segments,
                objective: workout.objective,
                tips: workout.tips,
                status: 'pending',
            });
        }

        return workoutsToInsert;
    }

    /**
     * Create a new training plan for a user (LEGACY - full generation)
     * @deprecated Use createQuickPlan for better UX
     */
    async createTrainingPlan(userId: string, onboardingData: TrainingPlanRequest): Promise<any> {
        try {
            // Generate plan using AI
            const generatedPlan = await this.trainingAIService.generateTrainingPlan(onboardingData);

            // Save training plan to database
            const { data: plan, error: planError } = await this.supabaseService
                .from('training_plans')
                .insert({
                    user_id: userId,
                    goal: onboardingData.goal,
                    duration_weeks: generatedPlan.duration_weeks,
                    frequency_per_week: generatedPlan.frequency_per_week,
                    plan_json: generatedPlan,
                    status: 'active',
                    generation_status: 'complete',
                })
                .select()
                .single();

            if (planError) throw planError;

            // Create individual workouts
            const workoutsToInsert = [];
            const today = new Date();

            for (const week of generatedPlan.weeks) {
                const weekWorkouts = this.createWorkoutsForWeek(plan.id, userId, week, today);
                workoutsToInsert.push(...weekWorkouts);
            }

            // Insert all workouts
            const { error: workoutsError } = await this.supabaseService
                .from('workouts')
                .insert(workoutsToInsert);

            if (workoutsError) throw workoutsError;

            this.logger.log(`Created training plan ${plan.id} with ${workoutsToInsert.length} workouts`);

            // Return plan data including preview for frontend
            return {
                plan,
                workoutsCount: workoutsToInsert.length,
                // Include plan preview data from AI response
                planPreview: {
                    planHeader: generatedPlan.planHeader,
                    planHeadline: generatedPlan.planHeadline,
                    welcomeBadge: generatedPlan.welcomeBadge,
                    nextWorkout: generatedPlan.nextWorkout,
                    fullSchedulePreview: generatedPlan.fullSchedulePreview,
                },
            };
        } catch (error) {
            this.logger.error('Failed to create training plan', error);
            throw error;
        }
    }

    /**
     * Get user's active training plan
     */
    async getActivePlan(userId: string) {
        const { data, error } = await this.supabaseService
            .from('training_plans')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    /**
     * Get workouts for a specific month
     */
    async getWorkouts(userId: string, startDate: string, endDate: string) {
        const { data, error } = await this.supabaseService
            .from('workouts')
            .select('*')
            .eq('user_id', userId)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate)
            .order('scheduled_date', { ascending: true });

        if (error) throw error;
        return data;
    }

    /**
     * Get upcoming workouts
     */
    async getUpcomingWorkouts(userId: string, limit = 7) {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await this.supabaseService
            .from('workouts')
            .select('*')
            .eq('user_id', userId)
            .gte('scheduled_date', today)
            .eq('status', 'pending')
            .order('scheduled_date', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data;
    }

    /**
     * Mark a workout as skipped
     */
    async skipWorkout(userId: string, workoutId: string, reason: string) {
        const { data, error } = await this.supabaseService
            .from('workouts')
            .update({
                status: 'skipped',
                skip_reason: reason,
            })
            .eq('id', workoutId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get a single workout by ID
     */
    async getWorkout(userId: string, workoutId: string) {
        const { data, error } = await this.supabaseService
            .from('workouts')
            .select('*, training_plans(*)')
            .eq('id', workoutId)
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        return data;
    }
}

