import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../../database';
import { TrainingAIService, TrainingPlanRequest, GeneratedPlan, QuickPlanResult, GeneratedWeek } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';

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
    private readonly SAO_PAULO_OFFSET_HOURS = -3; // UTC-3 (BRT)

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly trainingAIService: TrainingAIService,
        private readonly gamificationService: GamificationService,
        @InjectQueue('feedback-queue') private feedbackQueue: Queue,
    ) { }

    /**
     * Get today's date in São Paulo timezone (UTC-3)
     * This ensures consistent date calculation regardless of server timezone
     */
    private getSaoPauloToday(): { date: Date; dateStr: string } {
        const nowUtc = new Date();
        // Convert to São Paulo local time
        const saoPauloNow = new Date(nowUtc.getTime() + (this.SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000));

        // Extract date components in São Paulo time
        const year = saoPauloNow.getUTCFullYear();
        const month = String(saoPauloNow.getUTCMonth() + 1).padStart(2, '0');
        const day = String(saoPauloNow.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Create Date object for comparison (at midnight São Paulo time)
        const date = new Date(`${dateStr}T00:00:00`);

        this.logger.debug(`[getSaoPauloToday] UTC: ${nowUtc.toISOString()}, São Paulo date: ${dateStr}`);

        return { date, dateStr };
    }

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

            // Use user's selected start date, fallback to today
            const planStartDate = onboardingData.startDate ? new Date(onboardingData.startDate) : new Date();

            // Create workouts for week 1 only
            const workoutsToInsert = this.createWorkoutsForWeek(
                plan.id,
                userId,
                quickResult.firstWeek,
                planStartDate,
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

            // Use user's selected start date, fallback to today
            const planStartDate = onboardingData.startDate ? new Date(onboardingData.startDate) : new Date();
            const allWorkoutsToInsert = [];

            for (const week of fullSchedule.weeks) {
                const weekWorkouts = this.createWorkoutsForWeek(planId, userId, week, planStartDate);
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
        const { dateStr: today } = this.getSaoPauloToday();

        this.logger.debug(`[getUpcomingWorkouts] Using São Paulo date: ${today}`);

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
     * Complete Workout and Save Route GeoSpatial Data
     */
    async completeWorkout(userId: string, workoutId: string, payload: import('./dto/workout-tracking.dto').CreateWorkoutTrackingDto) {
        const turf = await import('@turf/turf'); // Dynamic import to prevent initial load overhead

        // Validate workout
        const { data: workout, error: workoutError } = await this.supabaseService
            .from('workouts')
            .select('*')
            .eq('id', workoutId)
            .eq('user_id', userId)
            .single();

        if (workoutError || !workout) {
            throw new Error('Workout not found');
        }

        // Compute distance and geojson using Turf JS
        let turfDistanceLimit = 0;
        let routeWKT = null;

        if (payload.route_points && payload.route_points.length > 1) {
            const coordinates = payload.route_points.map(p => [p.longitude, p.latitude]);
            // Filter duplicated coordinates for cleaner geometry
            const uniqueCoords = coordinates.filter((c, i, a) => i === 0 || c[0] !== a[i-1][0] || c[1] !== a[i-1][1]);
            
            if (uniqueCoords.length > 1) {
                const line = turf.lineString(uniqueCoords);
                
                // Re-validate tracking distance via Turf (kilometers)
                turfDistanceLimit = turf.length(line, { units: 'kilometers' });
                
                // Build WKT (SRID=4326 for standard GPS)
                const coordsStr = uniqueCoords.map(c => `${c[0]} ${c[1]}`).join(', ');
                routeWKT = `SRID=4326;LINESTRING(${coordsStr})`;
            }
        }

        // Final Distance from App, or Turf calculation fallback
        const finalDistanceKm = payload.total_distance_meters 
            ? payload.total_distance_meters / 1000 
            : turfDistanceLimit;

        // Pace: mins per km (standard format for runners)
        const paceSeconds = payload.duration_seconds && finalDistanceKm > 0 
           ? payload.duration_seconds / finalDistanceKm 
           : 0;

        // 1. Update Workout Status
        const { error: updateError, data: updatedWorkout } = await this.supabaseService
            .from('workouts')
            .update({
                status: 'completed',
                distance_run: finalDistanceKm, // using existing or new column fallback
                time_run_seconds: payload.duration_seconds, // Note: You may need migrations if these columns differ
                pace_seconds_per_km: paceSeconds,
                completed_at: new Date().toISOString()
            })
            .eq('id', workoutId)
            .select()
            .single();

        if (updateError) {
             this.logger.error('Error updating workout completion', updateError);
             throw updateError;
        }

        // 2. Insert Route
        if (routeWKT) {
            const { error: routeError } = await this.supabaseService
                .from('workout_routes')
                .insert({
                    workout_id: workoutId,
                    route: routeWKT,
                    raw_data: payload.route_points
                });

            if (routeError) {
                this.logger.error(`Failed to save route for workout ${workoutId}`, routeError);
                // Non-blocking error, we still completed the workout
            }
        }

        // 3. Gamification: update streak and award XP
        try {
            await this.gamificationService.updateStreak(userId);
            await this.gamificationService.awardWorkoutXP(userId, {
                distance_km: finalDistanceKm,
                pace_seconds_per_km: paceSeconds,
                workoutId,
            });
        } catch (gamificationError) {
            this.logger.error(`Gamification error for workout ${workoutId}`, gamificationError);
            // Non-blocking: workout is already completed
        }

        // 4. Queue AI Feedback processing
        this.logger.log(`Enqueueing AI Feedback for Workout ${workoutId}`);
        await this.feedbackQueue.add(
            'generate',
            { userId, workoutId, activityId: workoutId },
            { delay: 1000 }
        );

        return updatedWorkout;
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

    /**
     * Get schedule with type and status for each day in a date range
     * Returns 'workout' or 'recovery' type, and 'completed', 'missed', or 'pending' status
     * Days outside the plan period return type: null
     */
    async getScheduleWithStatus(userId: string, startDate: string, endDate: string): Promise<ScheduleDay[]> {
        // Use São Paulo timezone for consistent date calculation
        const { date: today, dateStr: todayStr } = this.getSaoPauloToday();

        this.logger.debug(`[getScheduleWithStatus] Today: ${todayStr}, range: ${startDate} to ${endDate}`);

        // Get the active plan to determine date boundaries
        const { data: activePlan, error: planError } = await this.supabaseService
            .from('training_plans')
            .select('id, created_at, duration_weeks')
            .eq('user_id', userId)
            .eq('status', 'active')
            .single();

        // Calculate plan start and end dates
        let planStartDate: Date | null = null;
        let planEndDate: Date | null = null;

        if (activePlan && !planError) {
            planStartDate = new Date(activePlan.created_at);
            planStartDate.setHours(0, 0, 0, 0);

            planEndDate = new Date(planStartDate);
            planEndDate.setDate(planEndDate.getDate() + (activePlan.duration_weeks * 7) - 1);
        }

        // Get all workouts in range
        const { data: workouts, error: workoutsError } = await this.supabaseService
            .from('workouts')
            .select('*')
            .eq('user_id', userId)
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate)
            .order('scheduled_date', { ascending: true });

        if (workoutsError) throw workoutsError;

        // Create a map of workouts by date
        const workoutsByDate = new Map<string, any>();
        for (const workout of workouts || []) {
            workoutsByDate.set(workout.scheduled_date, workout);
        }

        // Generate schedule for each day in range
        const schedule: ScheduleDay[] = [];
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const workout = workoutsByDate.get(dateStr);
            const isPast = d < today;
            const isToday = dateStr === todayStr;

            // Check if this date is within the plan period
            const isWithinPlan = planStartDate && planEndDate
                ? (d >= planStartDate && d <= planEndDate)
                : false;

            if (workout) {
                // Determine workout status
                let status: 'completed' | 'missed' | 'pending';

                if (workout.status === 'completed') {
                    status = 'completed';
                } else if (isPast && workout.status !== 'completed') {
                    // Past workout not completed = missed (retroactive check)
                    status = 'missed';

                    // Update database to mark as missed if still pending
                    if (workout.status === 'pending') {
                        await this.supabaseService
                            .from('workouts')
                            .update({ status: 'missed' })
                            .eq('id', workout.id);
                    }
                } else {
                    status = 'pending';
                }

                schedule.push({
                    date: dateStr,
                    type: 'workout',
                    status,
                    workout: {
                        id: workout.id,
                        type: workout.type,
                        distance_km: workout.distance_km,
                        objective: workout.objective,
                        instructions_json: workout.instructions_json,
                        tips: workout.tips,
                    },
                    is_today: isToday,
                    is_past: isPast,
                });
            } else if (isWithinPlan) {
                // No workout but within plan = recovery day
                schedule.push({
                    date: dateStr,
                    type: 'recovery',
                    status: isPast ? 'completed' : 'pending',
                    workout: null,
                    is_today: isToday,
                    is_past: isPast,
                });
            } else {
                // Outside plan period = no type (empty day)
                schedule.push({
                    date: dateStr,
                    type: null,
                    status: null,
                    workout: null,
                    is_today: isToday,
                    is_past: isPast,
                });
            }
        }

        return schedule;
    }

    /**
     * Get the next upcoming workout (type: 'workout' only)
     * Returns the next pending workout AFTER today (not including today)
     */
    async getNextWorkout(userId: string): Promise<any | null> {
        // Use São Paulo timezone for consistent date calculation
        const { dateStr: today } = this.getSaoPauloToday();

        this.logger.debug(`[getNextWorkout] Searching for workouts after ${today} (São Paulo) for user ${userId}`);

        const { data, error } = await this.supabaseService
            .from('workouts')
            .select('*')
            .eq('user_id', userId)
            .gt('scheduled_date', today)  // gt = strictly after today
            .in('status', ['pending'])
            .order('scheduled_date', { ascending: true })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        this.logger.debug(`[getNextWorkout] Found: ${data ? data.scheduled_date : 'none'}`);
        return data || null;
    }
}

// Type definitions
export interface ScheduleDay {
    date: string;
    type: 'workout' | 'recovery' | null;
    status: 'completed' | 'missed' | 'pending' | null;
    workout: {
        id: string;
        type: string;
        distance_km: number;
        objective: string | null;
        instructions_json: any[];
        tips: string | null;
    } | null;
    is_today: boolean;
    is_past: boolean;
}


