import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../../database';
import { TrainingAIService, TrainingPlanRequest, GeneratedPlan, GeneratedWeek } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';

// Generation status types
export type GenerationStatus = 'partial' | 'generating' | 'complete' | 'failed';

// Plan creation response (returned immediately, before AI generation completes)
export interface QuickPlanResponse {
    plan_id: string;
    generation_status: GenerationStatus;
    planHeader: { objectiveShort: string; durationWeeks: string; frequencyWeekly: string };
    planHeadline: string;
    welcomeBadge: string;
    nextWorkout: { title: string; duration: string; paceEstimate: string; type: string };
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
     * Create a training plan using a SINGLE AI prompt (all weeks at once).
     * Returns plan_id immediately; full generation runs in background.
     * Frontend polls GET /plan/:id/status until generation_status === 'complete'.
     */
    async createQuickPlan(userId: string, onboardingData: TrainingPlanRequest): Promise<QuickPlanResponse> {
        try {
            this.logger.log(`[Plan] Starting single-prompt plan generation for user ${userId}`);

            // Deactivate any existing active plans to prevent duplicates
            const { error: deactivateError } = await this.supabaseService
                .from('training_plans')
                .update({ status: 'cancelled' })
                .eq('user_id', userId)
                .eq('status', 'active');

            if (deactivateError) {
                this.logger.warn(`[Plan] Failed to deactivate old plans: ${deactivateError.message}`);
            }

            // Create plan record with 'generating' status (no AI call yet)
            const { data: plan, error: planError } = await this.supabaseService
                .from('training_plans')
                .insert({
                    user_id: userId,
                    goal: onboardingData.goal,
                    duration_weeks: onboardingData.targetWeeks,
                    frequency_per_week: onboardingData.daysPerWeek,
                    plan_json: {},
                    status: 'active',
                    generation_status: 'generating',
                })
                .select()
                .single();

            if (planError) throw planError;

            this.logger.log(`[Plan] Created plan record ${plan.id}, triggering background generation`);

            // Fire-and-forget: generate full plan in background (single prompt)
            this.generateAndSaveFullPlan(plan.id, userId, onboardingData)
                .then(() => {
                    this.logger.log(`[Plan] Background generation completed for plan ${plan.id}`);
                })
                .catch((error) => {
                    this.logger.error(`[Plan] Background generation failed for plan ${plan.id}`, error);
                });

            // Return immediately — frontend polls for completion
            return {
                plan_id: plan.id,
                generation_status: 'generating',
                planHeader: {
                    objectiveShort: onboardingData.goal,
                    durationWeeks: `${onboardingData.targetWeeks} Sem`,
                    frequencyWeekly: `${onboardingData.daysPerWeek}x/Sem`,
                },
                planHeadline: '',
                welcomeBadge: '',
                nextWorkout: { title: '', duration: '', paceEstimate: '', type: 'run' },
                workouts_count: 0,
            };
        } catch (error) {
            this.logger.error('[Plan] Failed to create plan', error);
            throw error;
        }
    }

    /**
     * Generate the FULL training plan in background (single AI prompt for ALL weeks).
     * Updates the plan record and creates all workout rows when done.
     */
    private async generateAndSaveFullPlan(
        planId: string,
        userId: string,
        onboardingData: TrainingPlanRequest,
    ): Promise<void> {
        try {
            this.logger.log(`[FullGen] Starting full plan generation for plan ${planId} (${onboardingData.targetWeeks} weeks)`);
            this.logger.log(`[FullGen] Onboarding data: goal=${onboardingData.goal}, level=${onboardingData.level}, daysPerWeek=${onboardingData.daysPerWeek}, pace=${onboardingData.currentPace5k}`);
            const startTime = Date.now();

            // STEP 1: Call AI to generate the full plan
            this.logger.log(`[FullGen] STEP 1: Calling AI (generateTrainingPlan)...`);
            const fullPlan = await this.trainingAIService.generateTrainingPlan(onboardingData);
            this.logger.log(`[FullGen] STEP 1 DONE: AI returned ${fullPlan.weeks?.length || 0} weeks, duration_weeks=${fullPlan.duration_weeks}, frequency=${fullPlan.frequency_per_week} (${Date.now() - startTime}ms)`);

            if (!fullPlan.weeks || fullPlan.weeks.length === 0) {
                throw new Error('AI returned empty weeks array');
            }

            // STEP 2: Update plan record with complete data
            this.logger.log(`[FullGen] STEP 2: Updating plan record in DB...`);
            const { error: updateError } = await this.supabaseService
                .from('training_plans')
                .update({
                    plan_json: fullPlan,
                    duration_weeks: fullPlan.duration_weeks || onboardingData.targetWeeks,
                    frequency_per_week: fullPlan.frequency_per_week || onboardingData.daysPerWeek,
                    generation_status: 'complete',
                })
                .eq('id', planId);

            if (updateError) {
                this.logger.error(`[FullGen] STEP 2 FAILED: DB update error: ${updateError.message}`, updateError);
                throw updateError;
            }
            this.logger.log(`[FullGen] STEP 2 DONE: Plan record updated successfully`);

            // STEP 3: Create ALL workouts at once
            this.logger.log(`[FullGen] STEP 3: Creating workout rows...`);
            const planStartDate = onboardingData.startDate ? new Date(onboardingData.startDate) : new Date();
            const allWorkoutsToInsert: any[] = [];

            for (const week of fullPlan.weeks) {
                const weekWorkouts = this.createWorkoutsForWeek(planId, userId, week, planStartDate);
                allWorkoutsToInsert.push(...weekWorkouts);
            }

            this.logger.log(`[FullGen] STEP 3: Inserting ${allWorkoutsToInsert.length} workouts in batches...`);
            if (allWorkoutsToInsert.length > 0) {
                // Insert in batches of 100 to avoid payload limits
                const BATCH_SIZE = 100;
                for (let i = 0; i < allWorkoutsToInsert.length; i += BATCH_SIZE) {
                    const batch = allWorkoutsToInsert.slice(i, i + BATCH_SIZE);
                    const { error: workoutsError } = await this.supabaseService
                        .from('workouts')
                        .insert(batch);

                    if (workoutsError) {
                        this.logger.error(`[FullGen] STEP 3 FAILED: Workout batch insert error (batch ${i / BATCH_SIZE + 1}): ${workoutsError.message}`, workoutsError);
                        throw workoutsError;
                    }
                }
            }

            const elapsed = Date.now() - startTime;
            this.logger.log(`[FullGen] ✅ Plan ${planId}: generated ${fullPlan.weeks.length} weeks, ${allWorkoutsToInsert.length} workouts in ${elapsed}ms`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[FullGen] ❌ Failed for plan ${planId}: ${errorMsg}`, error);

            // Mark as failed and store error message for debugging
            await this.supabaseService
                .from('training_plans')
                .update({
                    generation_status: 'failed',
                    plan_json: { error: errorMsg, failed_at: new Date().toISOString() },
                })
                .eq('id', planId);
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
        const paceMinPerKm = paceSeconds / 60;

        // Compute elevation gain from GPS altitudes (best-effort)
        let elevationGain = 0;
        if (payload.route_points && payload.route_points.length > 1) {
            for (let i = 1; i < payload.route_points.length; i++) {
                const prev = payload.route_points[i - 1]?.altitude;
                const curr = payload.route_points[i]?.altitude;
                if (typeof prev === 'number' && typeof curr === 'number') {
                    const diff = curr - prev;
                    if (diff > 0) elevationGain += diff;
                }
            }
        }

        // 1. Create the matching `activities` row (source='phone').
        // This is the canonical "executed run" record consumed by the feedback
        // generator, the HomeScreen coach card (getLatestActivityWithFeedback),
        // history, gamification, etc. Without it the entire downstream pipeline
        // is invisible to the user.
        const completedAtIso = new Date().toISOString();
        const startDateIso = new Date(
            Date.now() - (payload.duration_seconds || 0) * 1000,
        ).toISOString();

        const { data: insertedActivity, error: activityError } = await this.supabaseService
            .from('activities')
            .insert({
                user_id: userId,
                external_id: `phone_${workoutId}`,
                source: 'phone',
                name: workout.title || 'Corrida RunEasy',
                type: 'Run',
                start_date: startDateIso,
                distance: finalDistanceKm * 1000, // meters
                moving_time: payload.duration_seconds || 0,
                elapsed_time: payload.duration_seconds || 0,
                average_pace: paceMinPerKm || null,
                max_pace: paceMinPerKm || null,
                elevation_gain: elevationGain,
                gps_route: payload.route_points || null,
            })
            .select()
            .single();

        if (activityError) {
            this.logger.error(
                `Failed to create activity row for workout ${workoutId}: ${activityError.message}`,
                activityError,
            );
            // Non-blocking: we still want to mark the workout completed even if
            // the activity insert fails. The feedback pipeline will degrade
            // gracefully and the user can see the workout in the calendar.
        }

        const activityId: string | null = insertedActivity?.id ?? null;

        // 2. Update Workout Status (and link to the new activity row)
        const { error: updateError, data: updatedWorkout } = await this.supabaseService
            .from('workouts')
            .update({
                status: 'completed',
                distance_run: finalDistanceKm, // using existing or new column fallback
                time_run_seconds: payload.duration_seconds, // Note: You may need migrations if these columns differ
                pace_seconds_per_km: paceSeconds,
                completed_at: completedAtIso,
                ...(activityId ? { activity_id: activityId } : {}),
            })
            .eq('id', workoutId)
            .select()
            .single();

        if (updateError) {
             this.logger.error('Error updating workout completion', updateError);
             throw updateError;
        }

        // 3. Insert Route (PostGIS LINESTRING)
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

        // 4. Gamification: update streak, award XP and check badges
        try {
            await this.gamificationService.updateStreak(userId);
            await this.gamificationService.awardWorkoutXP(userId, {
                distance_km: finalDistanceKm,
                pace_seconds_per_km: paceSeconds,
                workoutId,
                elevation_gain: elevationGain,
            });

            const averageSpeedMs = payload.duration_seconds > 0
                ? (finalDistanceKm * 1000) / payload.duration_seconds
                : 0;

            await this.gamificationService.checkBadges(userId, {
                distance: finalDistanceKm * 1000,
                average_speed: averageSpeedMs,
                elapsed_time: payload.duration_seconds,
                moving_time: payload.duration_seconds,
                total_elevation_gain: elevationGain,
                start_date: startDateIso,
            });
        } catch (gamificationError) {
            this.logger.error(`Gamification error for workout ${workoutId}`, gamificationError);
            // Non-blocking: workout is already completed
        }

        // 5. Queue AI Feedback processing — only for plan-generated workouts.
        // Manual and free workouts have no AI coach, so we skip the enqueue
        // (and skip when the activity row failed to insert, since the feedback
        // service has nothing to read from).
        if (activityId && workout.source === 'plan') {
            this.logger.log(
                `Enqueueing AI Feedback for Workout ${workoutId} / Activity ${activityId}`,
            );
            await this.feedbackQueue.add(
                'generate',
                { userId, workoutId, activityId },
                { delay: 1000 },
            );
        } else if (!activityId) {
            this.logger.warn(
                `Skipping AI feedback enqueue for workout ${workoutId}: activity row was not created`,
            );
        } else {
            this.logger.log(
                `Skipping AI feedback for workout ${workoutId}: source=${workout.source} (no AI coach for manual/free)`,
            );
        }

        return updatedWorkout;
    }

    /**
     * Create a user-defined manual workout (no AI plan). The workout is saved
     * with status='pending' and a single 'main' instruction block so that the
     * existing real-time goals UI (useWorkoutGoals) shows the user's targets
     * during the run.
     */
    async createManualWorkout(
        userId: string,
        dto: import('./dto/create-manual-workout.dto').CreateManualWorkoutDto,
    ) {
        const paceMinutes = dto.target_pace_seconds / 60;

        const { data, error } = await this.supabaseService
            .from('workouts')
            .insert({
                user_id: userId,
                plan_id: null,
                source: 'manual',
                title: dto.title,
                type: dto.type,
                week_number: null,
                scheduled_date: dto.scheduled_date,
                scheduled_time: dto.scheduled_time ?? '05:00:00',
                distance_km: dto.distance_km,
                target_pace_seconds: dto.target_pace_seconds,
                target_duration_seconds: dto.target_duration_seconds,
                instructions_json: [
                    {
                        type: 'main',
                        distance_km: dto.distance_km,
                        pace_min: paceMinutes,
                        pace_max: paceMinutes,
                    },
                ],
                objective: dto.title,
                tips: [],
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to create manual workout for user ${userId}: ${error.message}`, error);
            throw error;
        }

        return data;
    }

    /**
     * Persist a free run (no pre-existing workout). Creates a workout row with
     * source='free', then delegates to completeWorkout so the route, activity,
     * gamification and pending-id all flow through the same code path.
     */
    async completeFreeWorkout(
        userId: string,
        payload: import('./dto/complete-free-workout.dto').CompleteFreeWorkoutDto,
    ) {
        const startedAt = payload.started_at ? new Date(payload.started_at) : new Date(Date.now() - payload.duration_seconds * 1000);
        const scheduledDate = startedAt.toISOString().split('T')[0];
        const distanceKm = (payload.total_distance_meters || 0) / 1000;

        const titleByHour = (date: Date): string => {
            // São Paulo local hour (UTC-3)
            const localHour = (date.getUTCHours() + 24 + this.SAO_PAULO_OFFSET_HOURS) % 24;
            if (localHour >= 5 && localHour < 12) return 'Corrida da manhã';
            if (localHour >= 12 && localHour < 18) return 'Corrida da tarde';
            return 'Corrida da noite';
        };

        const { data: workout, error: insertError } = await this.supabaseService
            .from('workouts')
            .insert({
                user_id: userId,
                plan_id: null,
                source: 'free',
                title: titleByHour(startedAt),
                type: 'free_run',
                week_number: null,
                scheduled_date: scheduledDate,
                distance_km: distanceKm,
                instructions_json: [],
                objective: null,
                tips: [],
                status: 'pending',
            })
            .select()
            .single();

        if (insertError) {
            this.logger.error(`Failed to create free workout row for user ${userId}: ${insertError.message}`, insertError);
            throw insertError;
        }

        // Reuse the full completion pipeline (activity insert, route, gamification).
        // AI feedback is automatically skipped because workout.source !== 'plan'.
        return this.completeWorkout(userId, workout.id, {
            route_points: payload.route_points,
            total_distance_meters: payload.total_distance_meters,
            duration_seconds: payload.duration_seconds,
        });
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

        // Enrich with activity data (gps_route + execution metrics) for the
        // RunSummary screen when the user opens a saved workout from
        // Home/History — the route is stored on `activities`, not `workouts`.
        let activity: any = null;
        if (data?.activity_id) {
            const { data: act } = await this.supabaseService
                .from('activities')
                .select(
                    'id, name, distance, moving_time, elapsed_time, average_pace, average_speed, total_elevation_gain, elevation_gain, start_date, gps_route',
                )
                .eq('id', data.activity_id)
                .single();
            activity = act ?? null;
        }

        return { ...data, activity };
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


