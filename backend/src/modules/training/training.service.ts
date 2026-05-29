import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../../database';
import {
  TrainingAIService,
  TrainingPlanRequest,
  GeneratedPlan,
  GeneratedWeek,
} from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';
import {
  PlanOverviewResponseDto,
  PlanWeekDto,
  PlanWorkoutDto,
  WeekPhase,
} from './dto/plan-overview.dto';

// Generation status types
export type GenerationStatus = 'partial' | 'generating' | 'complete' | 'failed';

// Plan creation response (returned immediately, before AI generation completes)
export interface QuickPlanResponse {
  plan_id: string;
  generation_status: GenerationStatus;
  planHeader: {
    objectiveShort: string;
    durationWeeks: string;
    frequencyWeekly: string;
  };
  planHeadline: string;
  welcomeBadge: string;
  nextWorkout: {
    title: string;
    duration: string;
    paceEstimate: string;
    type: string;
  };
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
  ) {}

  /**
   * Get today's date in São Paulo timezone (UTC-3)
   * This ensures consistent date calculation regardless of server timezone
   */
  private getSaoPauloToday(): { date: Date; dateStr: string } {
    const nowUtc = new Date();
    // Convert to São Paulo local time
    const saoPauloNow = new Date(
      nowUtc.getTime() + this.SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );

    // Extract date components in São Paulo time
    const year = saoPauloNow.getUTCFullYear();
    const month = String(saoPauloNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(saoPauloNow.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Create Date object for comparison (at midnight São Paulo time)
    const date = new Date(`${dateStr}T00:00:00`);

    this.logger.debug(
      `[getSaoPauloToday] UTC: ${nowUtc.toISOString()}, São Paulo date: ${dateStr}`,
    );

    return { date, dateStr };
  }

  /**
   * Create a training plan using a SINGLE AI prompt (all weeks at once).
   * Returns plan_id immediately; full generation runs in background.
   * Frontend polls GET /plan/:id/status until generation_status === 'complete'.
   */
  async createQuickPlan(
    userId: string,
    onboardingData: TrainingPlanRequest,
  ): Promise<QuickPlanResponse> {
    try {
      this.logger.log(
        `[Plan] Starting single-prompt plan generation for user ${userId}`,
      );

      // Deactivate any existing active plans to prevent duplicates
      const { error: deactivateError } = await this.supabaseService
        .from('training_plans')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (deactivateError) {
        this.logger.warn(
          `[Plan] Failed to deactivate old plans: ${deactivateError.message}`,
        );
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

      this.logger.log(
        `[Plan] Created plan record ${plan.id}, triggering background generation`,
      );

      // Fire-and-forget: generate full plan in background (single prompt)
      this.generateAndSaveFullPlan(plan.id, userId, onboardingData)
        .then(() => {
          this.logger.log(
            `[Plan] Background generation completed for plan ${plan.id}`,
          );
        })
        .catch((error) => {
          this.logger.error(
            `[Plan] Background generation failed for plan ${plan.id}`,
            error,
          );
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
      this.logger.log(
        `[FullGen] Starting full plan generation for plan ${planId} (${onboardingData.targetWeeks} weeks)`,
      );
      this.logger.log(
        `[FullGen] Onboarding data: goal=${onboardingData.goal}, level=${onboardingData.level}, ` +
          `daysPerWeek=${onboardingData.daysPerWeek}, pace=${onboardingData.currentPace5k}, ` +
          `preferredDays=${JSON.stringify(onboardingData.preferredDays)}`,
      );
      const startTime = Date.now();

      // STEP 1: Call AI to generate the full plan
      this.logger.log(`[FullGen] STEP 1: Calling AI (generateTrainingPlan)...`);
      const fullPlan =
        await this.trainingAIService.generateTrainingPlan(onboardingData);
      this.logger.log(
        `[FullGen] STEP 1 DONE: AI returned ${fullPlan.weeks?.length || 0} weeks, duration_weeks=${fullPlan.duration_weeks}, frequency=${fullPlan.frequency_per_week} (${Date.now() - startTime}ms)`,
      );

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
          frequency_per_week:
            fullPlan.frequency_per_week || onboardingData.daysPerWeek,
          generation_status: 'complete',
        })
        .eq('id', planId);

      if (updateError) {
        this.logger.error(
          `[FullGen] STEP 2 FAILED: DB update error: ${updateError.message}`,
          updateError,
        );
        throw updateError;
      }
      this.logger.log(
        `[FullGen] STEP 2 DONE: Plan record updated successfully`,
      );

      // STEP 3: Create ALL workouts at once
      this.logger.log(`[FullGen] STEP 3: Creating workout rows...`);
      const planStartDate = this.parsePlanStartAsUTC(onboardingData.startDate);
      this.logger.log(
        `[FullGen] STEP 3: planStartDate=${planStartDate.toISOString()} (input startDate=${onboardingData.startDate ?? 'null'})`,
      );
      const allWorkoutsToInsert: any[] = [];

      // Defense-in-depth: even when the prompt asks for specific days, the
      // AI sometimes returns its own defaults (Mon/Tue/Thu/Sat). Force the
      // workouts onto the user's actual selection so the calendar matches
      // what they picked in onboarding.
      const enforcedDays = this.normalizePreferredDays(
        onboardingData.preferredDays,
        onboardingData.daysPerWeek,
      );
      this.logger.log(
        `[FullGen] STEP 3: enforcedDays=${JSON.stringify(enforcedDays)} (from preferredDays=${JSON.stringify(onboardingData.preferredDays)})`,
      );

      for (const week of fullPlan.weeks) {
        const weekWorkouts = this.createWorkoutsForWeek(
          planId,
          userId,
          week,
          planStartDate,
          enforcedDays,
        );
        allWorkoutsToInsert.push(...weekWorkouts);
      }

      this.logger.log(
        `[FullGen] STEP 3: Inserting ${allWorkoutsToInsert.length} workouts in batches...`,
      );
      if (allWorkoutsToInsert.length > 0) {
        // Insert in batches of 100 to avoid payload limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < allWorkoutsToInsert.length; i += BATCH_SIZE) {
          const batch = allWorkoutsToInsert.slice(i, i + BATCH_SIZE);
          const { error: workoutsError } = await this.supabaseService
            .from('workouts')
            .insert(batch);

          if (workoutsError) {
            this.logger.error(
              `[FullGen] STEP 3 FAILED: Workout batch insert error (batch ${i / BATCH_SIZE + 1}): ${workoutsError.message}`,
              workoutsError,
            );
            throw workoutsError;
          }
        }
      }

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `[FullGen] ✅ Plan ${planId}: generated ${fullPlan.weeks.length} weeks, ${allWorkoutsToInsert.length} workouts in ${elapsed}ms`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[FullGen] ❌ Failed for plan ${planId}: ${errorMsg}`,
        error,
      );

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
  async getPlanGenerationStatus(
    planId: string,
  ): Promise<{ status: GenerationStatus; workouts_count: number }> {
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
   * Parse a date input into a UTC-midnight Date. Critical for scheduling:
   * `new Date("YYYY-MM-DD")` already parses as UTC midnight, but a Date built
   * from `new Date()` (the "no startDate" fallback) carries the server's
   * wall-clock time, which makes `.getDay()` and `.setDate()` return values
   * that depend on the deployment's TZ. Anchoring everything at UTC midnight
   * lets us use the UTC getters/setters and `toISOString()` consistently,
   * making the math timezone-independent.
   */
  private parsePlanStartAsUTC(startDate: string | null | undefined): Date {
    if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)) {
      // "YYYY-MM-DD" or full ISO — keep the calendar date the user picked
      const datePart = startDate.slice(0, 10);
      return new Date(`${datePart}T00:00:00Z`);
    }
    // Fallback: today in São Paulo — what the rest of the app considers
    // "today" via getSaoPauloToday(). Use the same YYYY-MM-DD so the AI
    // schedule and the calendar agree on the start day.
    const { dateStr } = this.getSaoPauloToday();
    return new Date(`${dateStr}T00:00:00Z`);
  }

  /**
   * Sanitize the user's selected weekdays. Returns sorted, deduped values
   * in [0..6] (0=Sunday ... 6=Saturday, matching JS Date.getDay()), or null
   * when the input is missing/invalid so callers fall back to the AI's
   * own day_of_week assignment (legacy behaviour).
   */
  private normalizePreferredDays(
    preferredDays: number[] | undefined | null,
    daysPerWeek: number,
  ): number[] | null {
    if (!preferredDays || !Array.isArray(preferredDays)) return null;
    const cleaned = Array.from(
      new Set(
        preferredDays
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ).sort((a, b) => a - b);
    if (cleaned.length === 0) return null;
    if (cleaned.length !== daysPerWeek) {
      this.logger.warn(
        `[Plan] preferredDays length (${cleaned.length}) does not match daysPerWeek (${daysPerWeek}); using provided selection anyway`,
      );
    }
    return cleaned;
  }

  /**
   * Helper: Create workout records for a single week.
   *
   * When `enforcedDays` is provided, each workout's day_of_week is overridden
   * by the user's selected days (in sorted order, paired by index). This is
   * the deterministic guarantee that the calendar matches the onboarding
   * selection — the AI is asked nicely in the prompt, but here we make sure.
   */
  private createWorkoutsForWeek(
    planId: string,
    userId: string,
    week: GeneratedWeek,
    baseDate: Date,
    enforcedDays?: number[] | null,
  ): any[] {
    const workoutsToInsert = [];

    // CRITICAL: every getter and setter here MUST be the UTC variant.
    // `baseDate` is anchored at UTC midnight by parsePlanStartAsUTC; mixing
    // local-time methods (.getDay/.getDate/.setDate) with .toISOString()
    // (UTC) reintroduces the +1-day shift this code path historically had.
    for (let i = 0; i < week.workouts.length; i++) {
      const workout = week.workouts[i];

      const weekStart = new Date(baseDate);
      weekStart.setUTCDate(baseDate.getUTCDate() + (week.week_number - 1) * 7);

      const workoutDate = new Date(weekStart);
      const currentDay = workoutDate.getUTCDay();
      // Prefer the user's selected day at this index; fall back to the
      // AI's choice when no selection is available or there are more
      // workouts than selected days.
      const targetDay =
        enforcedDays && enforcedDays.length > 0
          ? enforcedDays[i % enforcedDays.length]
          : workout.day_of_week;
      const daysToAdd = (targetDay - currentDay + 7) % 7;
      workoutDate.setUTCDate(workoutDate.getUTCDate() + daysToAdd);

      const hasEnrichedFields =
        workout.zone !== undefined ||
        workout.perceived_effort !== undefined ||
        workout.scientific_note !== undefined ||
        workout.segments.some(
          (s) => s.zone !== undefined || s.description !== undefined,
        );

      const metadata = hasEnrichedFields
        ? {
            zone: workout.zone ?? null,
            perceived_effort: workout.perceived_effort ?? null,
            scientific_note: workout.scientific_note ?? null,
            week_phase: week.phase ?? null,
            segment_descriptions: workout.segments.map((s) => ({
              type: s.type,
              zone: s.zone ?? null,
              description: s.description ?? null,
            })),
          }
        : null;

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
        metadata,
      });
    }

    return workoutsToInsert;
  }

  /**
   * Create a new training plan for a user (LEGACY - full generation)
   * @deprecated Use createQuickPlan for better UX
   */
  async createTrainingPlan(
    userId: string,
    onboardingData: TrainingPlanRequest,
  ): Promise<any> {
    try {
      // Generate plan using AI
      const generatedPlan =
        await this.trainingAIService.generateTrainingPlan(onboardingData);

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
      const today = this.parsePlanStartAsUTC(onboardingData.startDate);

      for (const week of generatedPlan.weeks) {
        const weekWorkouts = this.createWorkoutsForWeek(
          plan.id,
          userId,
          week,
          today,
        );
        workoutsToInsert.push(...weekWorkouts);
      }

      // Insert all workouts
      const { error: workoutsError } = await this.supabaseService
        .from('workouts')
        .insert(workoutsToInsert);

      if (workoutsError) throw workoutsError;

      this.logger.log(
        `Created training plan ${plan.id} with ${workoutsToInsert.length} workouts`,
      );

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
   *
   * Enriches each completed workout with `feedback_id` (when an
   * `ai_feedbacks` row exists for the linked activity). The mobile
   * Calendar uses this id to route plan workouts directly to the
   * CoachAnalysis screen instead of opening the upcoming-workout modal.
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

    const activityIds = (data || [])
      .map((w: any) => w.activity_id)
      .filter((id: string | null): id is string => Boolean(id));

    if (activityIds.length === 0) {
      return (data || []).map((w: any) => ({ ...w, feedback_id: null }));
    }

    const { data: feedbacks } = await this.supabaseService
      .from('ai_feedbacks')
      .select('id, activity_id')
      .in('activity_id', activityIds);

    const feedbackByActivity = new Map<string, string>();
    (feedbacks || []).forEach((f: any) => {
      if (f.activity_id) feedbackByActivity.set(f.activity_id, f.id);
    });

    return (data || []).map((w: any) => ({
      ...w,
      feedback_id: w.activity_id
        ? (feedbackByActivity.get(w.activity_id) ?? null)
        : null,
    }));
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
  async completeWorkout(
    userId: string,
    workoutId: string,
    payload: import('./dto/workout-tracking.dto').CreateWorkoutTrackingDto,
  ) {
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

    const environment: 'outdoor' | 'treadmill' =
      payload.environment === 'treadmill' ? 'treadmill' : 'outdoor';
    const isTreadmill = environment === 'treadmill';

    // Compute distance and geojson using Turf JS
    let turfDistanceLimit = 0;
    let routeWKT = null;

    if (
      !isTreadmill &&
      payload.route_points &&
      payload.route_points.length > 1
    ) {
      const coordinates = payload.route_points.map((p) => [
        p.longitude,
        p.latitude,
      ]);
      // Filter duplicated coordinates for cleaner geometry
      const uniqueCoords = coordinates.filter(
        (c, i, a) => i === 0 || c[0] !== a[i - 1][0] || c[1] !== a[i - 1][1],
      );

      if (uniqueCoords.length > 1) {
        const line = turf.lineString(uniqueCoords);

        // Re-validate tracking distance via Turf (kilometers)
        turfDistanceLimit = turf.length(line, { units: 'kilometers' });

        // Build WKT (SRID=4326 for standard GPS)
        const coordsStr = uniqueCoords.map((c) => `${c[0]} ${c[1]}`).join(', ');
        routeWKT = `SRID=4326;LINESTRING(${coordsStr})`;
      }
    }

    // Final Distance from App, or Turf calculation fallback
    const finalDistanceKm = payload.total_distance_meters
      ? payload.total_distance_meters / 1000
      : turfDistanceLimit;

    // Pace: mins per km (standard format for runners)
    const paceSeconds =
      payload.duration_seconds && finalDistanceKm > 0
        ? payload.duration_seconds / finalDistanceKm
        : 0;
    const paceMinPerKm = paceSeconds / 60;

    // Compute elevation gain from GPS altitudes (best-effort).
    // Treadmill runs have no GPS altitude — leave at zero (the avg incline
    // from FTMS is persisted separately in treadmill_data.avg_incline).
    let elevationGain = 0;
    if (
      !isTreadmill &&
      payload.route_points &&
      payload.route_points.length > 1
    ) {
      for (let i = 1; i < payload.route_points.length; i++) {
        const prev = payload.route_points[i - 1]?.altitude;
        const curr = payload.route_points[i]?.altitude;
        if (typeof prev === 'number' && typeof curr === 'number') {
          const diff = curr - prev;
          if (diff > 0) elevationGain += diff;
        }
      }
    }

    // 1. Create the matching `activities` row.
    // This is the canonical "executed run" record consumed by the feedback
    // generator, the HomeScreen coach card (getLatestActivityWithFeedback),
    // history, gamification, etc. Without it the entire downstream pipeline
    // is invisible to the user.
    //
    // `source` defaults to 'phone' (mantém comportamento histórico) mas pode
    // vir como 'apple_watch' quando a corrida é finalizada no app do relógio
    // e roteada via WatchConnectivity → completeWorkout.
    const completedAtIso = new Date().toISOString();
    const source = payload.source || 'phone';
    const startDateIso = payload.started_at
      ? new Date(payload.started_at).toISOString()
      : new Date(
          Date.now() - (payload.duration_seconds || 0) * 1000,
        ).toISOString();
    const externalId = payload.external_id || `${source}_${workoutId}`;
    // Pace recebido tem precedência (vem do builder do HealthKit no Watch);
    // fallback é o cálculo local feito acima (paceMinPerKm).
    const finalPaceMinPerKm =
      payload.avg_pace_seconds_per_km != null
        ? payload.avg_pace_seconds_per_km / 60
        : paceMinPerKm || null;

    // Use UPSERT so retries (user restarted the workout, network glitch
    // resubmitted, etc.) overwrite the previous row instead of failing the
    // `activities.external_id` UNIQUE constraint. The previous INSERT-only
    // code lost the activity row entirely when this race happened — and
    // because the downstream `workouts.activity_id` update gates on the
    // returned id, the link silently broke and the speed-variation chart
    // disappeared on subsequent re-opens.
    const { data: insertedActivity, error: activityError } =
      await this.supabaseService
        .from('activities')
        .upsert(
          {
            user_id: userId,
            external_id: externalId,
            source,
            name: workout.title || 'Corrida RunEasy',
            type: 'Run',
            start_date: startDateIso,
            distance: finalDistanceKm * 1000, // meters
            moving_time: payload.duration_seconds || 0,
            elapsed_time: payload.duration_seconds || 0,
            average_pace: finalPaceMinPerKm,
            max_pace: finalPaceMinPerKm,
            elevation_gain: elevationGain,
            gps_route: isTreadmill ? null : payload.route_points || null,
            average_heartrate: payload.average_heartrate ?? null,
            max_heartrate: payload.max_heartrate ?? null,
            calories: payload.calories ?? null,
            environment,
            treadmill_data: isTreadmill
              ? (payload.treadmill_data ?? null)
              : null,
          },
          { onConflict: 'external_id' },
        )
        .select()
        .single();

    if (activityError) {
      this.logger.error(
        `Failed to upsert activity row for workout ${workoutId}: ${activityError.message}`,
        activityError,
      );
      // Non-blocking: we still want to mark the workout completed even if
      // the activity upsert fails. The feedback pipeline will degrade
      // gracefully and the user can see the workout in the calendar.
    }

    let activityId: string | null = insertedActivity?.id ?? null;

    // Last-resort recovery: if the upsert returned without an id (rare,
    // happens when Supabase returns a partial response or RLS strips the
    // row from the response). Look it up by external_id so we can still
    // link the workout — keeps treadmill_data reachable on re-open.
    if (!activityId) {
      const { data: foundAct } = await this.supabaseService
        .from('activities')
        .select('id')
        .eq('user_id', userId)
        .eq('external_id', externalId)
        .maybeSingle();
      if (foundAct?.id) {
        activityId = foundAct.id;
        this.logger.warn(
          `[completeWorkout] recovered activity ${activityId} by external_id ${externalId}`,
        );
      }
    }

    // 2. Update Workout Status (and link to the new activity row)
    const { error: updateError, data: updatedWorkout } =
      await this.supabaseService
        .from('workouts')
        .update({
          status: 'completed',
          distance_run: finalDistanceKm, // using existing or new column fallback
          time_run_seconds: payload.duration_seconds, // Note: You may need migrations if these columns differ
          pace_seconds_per_km: paceSeconds,
          completed_at: completedAtIso,
          environment,
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
          raw_data: payload.route_points,
        });

      if (routeError) {
        this.logger.error(
          `Failed to save route for workout ${workoutId}`,
          routeError,
        );
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

      const averageSpeedMs =
        payload.duration_seconds > 0
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
      this.logger.error(
        `Gamification error for workout ${workoutId}`,
        gamificationError,
      );
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
      this.logger.error(
        `Failed to create manual workout for user ${userId}: ${error.message}`,
        error,
      );
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
    const startedAt = payload.started_at
      ? new Date(payload.started_at)
      : new Date(Date.now() - payload.duration_seconds * 1000);
    // `scheduled_date` é o que o calendário usa pra atribuir o treino ao dia.
    // `startedAt.toISOString()` retorna UTC — uma corrida às 23:00 SP cai no
    // dia seguinte em UTC. Ajustamos pro horário local de São Paulo antes de
    // extrair YYYY-MM-DD pra que a corrida apareça no dia em que o usuário
    // realmente correu.
    const spLocal = new Date(
      startedAt.getTime() + this.SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );
    const scheduledDate = spLocal.toISOString().split('T')[0];
    const distanceKm = (payload.total_distance_meters || 0) / 1000;

    const titleByHour = (date: Date): string => {
      // São Paulo local hour (UTC-3)
      const localHour =
        (date.getUTCHours() + 24 + this.SAO_PAULO_OFFSET_HOURS) % 24;
      if (localHour >= 5 && localHour < 12) return 'Corrida da manhã';
      if (localHour >= 12 && localHour < 18) return 'Corrida da tarde';
      return 'Corrida da noite';
    };

    const environment: 'outdoor' | 'treadmill' =
      payload.environment === 'treadmill' ? 'treadmill' : 'outdoor';

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
        environment,
      })
      .select()
      .single();

    if (insertError) {
      this.logger.error(
        `Failed to create free workout row for user ${userId}: ${insertError.message}`,
        insertError,
      );
      throw insertError;
    }

    // Reuse the full completion pipeline (activity insert, route, gamification).
    // AI feedback is automatically skipped because workout.source !== 'plan'.
    return this.completeWorkout(userId, workout.id, {
      route_points: payload.route_points,
      total_distance_meters: payload.total_distance_meters,
      duration_seconds: payload.duration_seconds,
      source: payload.source,
      external_id: payload.external_id,
      average_heartrate: payload.average_heartrate,
      max_heartrate: payload.max_heartrate,
      calories: payload.calories,
      avg_pace_seconds_per_km: payload.avg_pace_seconds_per_km,
      started_at: payload.started_at,
      environment,
      treadmill_data: payload.treadmill_data,
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
      const { data: act, error: actErr } = await this.supabaseService
        .from('activities')
        .select(
          'id, name, distance, moving_time, elapsed_time, average_pace, elevation_gain, start_date, gps_route, average_heartrate, max_heartrate, calories, source, environment, treadmill_data',
        )
        .eq('id', data.activity_id)
        .single();
      activity = act ?? null;
      this.logger.log(
        `[getWorkout] workout=${workoutId} activity_id=${data.activity_id} hit=${!!act} hasTreadmillData=${!!act?.treadmill_data} sampleCount=${act?.treadmill_data?.speed_samples?.length ?? 0} ${actErr ? `error=${actErr.message}` : ''}`,
      );
    } else {
      this.logger.log(
        `[getWorkout] workout=${workoutId} has NO activity_id (status=${data?.status})`,
      );
    }

    // Recovery: when `workouts.activity_id` is null (insert race, retry
    // that hit the UNIQUE on external_id under the old INSERT-only flow,
    // etc.) but an activity row was actually written under a predictable
    // external_id pattern (`phone_<workoutId>`, `apple_watch_<workoutId>`,
    // etc.), look it up by `external_id` and backfill the link so the
    // next read short-circuits to the normal path.
    if (!activity && data?.status === 'completed') {
      const { data: orphaned } = await this.supabaseService
        .from('activities')
        .select(
          'id, name, distance, moving_time, elapsed_time, average_pace, elevation_gain, start_date, gps_route, average_heartrate, max_heartrate, calories, source, environment, treadmill_data',
        )
        .eq('user_id', userId)
        .like('external_id', `%${workoutId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orphaned) {
        activity = orphaned;
        // Backfill the link in the background — fire-and-forget so the
        // current request doesn't pay the write latency.
        this.supabaseService
          .from('workouts')
          .update({ activity_id: orphaned.id })
          .eq('id', workoutId)
          .then(({ error: backfillErr }) => {
            if (backfillErr) {
              this.logger.warn(
                `[getWorkout] backfill activity_id failed for workout ${workoutId}: ${backfillErr.message}`,
              );
            } else {
              this.logger.log(
                `[getWorkout] backfilled activity_id=${orphaned.id} for workout ${workoutId}`,
              );
            }
          });
      }
    }

    // Fallback: when `activities.gps_route` is null/empty (legacy rows
    // saved before the column existed, or activities ingested without
    // raw points), the canonical route still lives in
    // `workout_routes.raw_data` — populated for every completed workout
    // by `completeWorkout` and consumed by the sharing service. We
    // overlay it onto the activity so RunSummary always has a route to
    // draw, regardless of which source was populated.
    const activityGps = Array.isArray(activity?.gps_route)
      ? activity.gps_route
      : [];
    let fallbackPoints: any[] | null = null;
    if (activityGps.length === 0) {
      const { data: routeRow } = await this.supabaseService
        .from('workout_routes')
        .select('raw_data')
        .eq('workout_id', workoutId)
        .limit(1)
        .maybeSingle();

      fallbackPoints = Array.isArray(routeRow?.raw_data)
        ? routeRow.raw_data
        : null;
      if (fallbackPoints && fallbackPoints.length > 0 && activity) {
        activity = { ...activity, gps_route: fallbackPoints };
      }
    }

    // Synthesize a minimal activity shell when the workout is completed but
    // the activity row is missing — this covers TWO degraded paths:
    //
    //  (a) Outdoor: activity insert failed, but workout_routes was saved.
    //      We use `fallbackPoints` for the route.
    //  (b) Treadmill: no GPS by design, and the activity row may also be
    //      missing if the insert failed. We still pull the executed
    //      metrics from the workout row (`distance_run`, `time_run_seconds`)
    //      so the result screen never shows zeros.
    //
    // Without this, the frontend would see `activity: null` and have to
    // rely on initial route params — which is exactly the bug that made
    // headers show as zeros when reopening a workout from Calendar/Home.
    const isCompleted = data?.status === 'completed';
    if (!activity && isCompleted) {
      activity = {
        id: null,
        name: data.title ?? 'Corrida',
        distance: Number(data.distance_run ?? data.distance_km ?? 0) * 1000,
        moving_time: Number(data.time_run_seconds ?? 0),
        elapsed_time: Number(data.time_run_seconds ?? 0),
        average_pace: data.pace_seconds_per_km
          ? Number(data.pace_seconds_per_km) / 60
          : null,
        average_speed: null,
        elevation_gain: 0,
        total_elevation_gain: 0,
        start_date: data.completed_at ?? data.scheduled_date,
        gps_route:
          fallbackPoints && fallbackPoints.length > 0 ? fallbackPoints : null,
        average_heartrate: null,
        max_heartrate: null,
        calories: null,
        source: 'phone',
        environment: data.environment ?? 'outdoor',
        treadmill_data: null,
      };
    }

    // Defensive: even when activity exists but the columns weren't selected
    // for any reason (legacy callers, partial migration), ensure environment
    // ends up populated by mirroring the top-level workout value.
    if (activity && activity.environment == null) {
      activity = { ...activity, environment: data.environment ?? 'outdoor' };
    }

    return { ...data, activity };
  }

  /**
   * Get schedule with type and status for each day in a date range
   * Returns 'workout' or 'recovery' type, and 'completed', 'missed', or 'pending' status
   * Days outside the plan period return type: null
   */
  async getScheduleWithStatus(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<ScheduleDay[]> {
    // Use São Paulo timezone for consistent date calculation
    const { date: today, dateStr: todayStr } = this.getSaoPauloToday();

    this.logger.debug(
      `[getScheduleWithStatus] Today: ${todayStr}, range: ${startDate} to ${endDate}`,
    );

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
      planEndDate.setDate(
        planEndDate.getDate() + activePlan.duration_weeks * 7 - 1,
      );
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

    // Resolve feedback_id by activity_id so the schedule's primary workout
    // entry can route to CoachAnalysis when completed.
    const activityIds = (workouts || [])
      .map((w: any) => w.activity_id)
      .filter((id: string | null): id is string => Boolean(id));
    const feedbackByActivity = new Map<string, string>();
    if (activityIds.length > 0) {
      const { data: feedbacks } = await this.supabaseService
        .from('ai_feedbacks')
        .select('id, activity_id')
        .in('activity_id', activityIds);
      (feedbacks || []).forEach((f: any) => {
        if (f.activity_id) feedbackByActivity.set(f.activity_id, f.id);
      });
    }

    // Create a map of workouts by date. When multiple workouts exist for
    // the same day (plan + manual + free), prefer the plan workout as the
    // schedule's primary entry — the mobile Calendar fetches the full
    // workouts array separately to render every card.
    const workoutsByDate = new Map<string, any>();
    for (const workout of workouts || []) {
      const existing = workoutsByDate.get(workout.scheduled_date);
      if (
        !existing ||
        (existing.source !== 'plan' && workout.source === 'plan')
      ) {
        workoutsByDate.set(workout.scheduled_date, workout);
      }
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
      const isWithinPlan =
        planStartDate && planEndDate
          ? d >= planStartDate && d <= planEndDate
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
            source: workout.source ?? null,
            title: workout.title ?? null,
            target_pace_seconds: workout.target_pace_seconds ?? null,
            target_duration_seconds: workout.target_duration_seconds ?? null,
            activity_id: workout.activity_id ?? null,
            feedback_id: workout.activity_id
              ? (feedbackByActivity.get(workout.activity_id) ?? null)
              : null,
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

    this.logger.debug(
      `[getNextWorkout] Searching for workouts after ${today} (São Paulo) for user ${userId}`,
    );

    const { data, error } = await this.supabaseService
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .gt('scheduled_date', today) // gt = strictly after today
      .in('status', ['pending'])
      .order('scheduled_date', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    this.logger.debug(
      `[getNextWorkout] Found: ${data ? data.scheduled_date : 'none'}`,
    );
    return data || null;
  }

  /**
   * Build the consolidated plan overview consumed by the mobile Goals screen.
   * Returns the active plan summary + all weeks (with phase) + workouts
   * grouped by week_number with per-week progress stats.
   */
  async getPlanOverview(
    userId: string,
  ): Promise<PlanOverviewResponseDto | null> {
    const { date: today, dateStr: todayStr } = this.getSaoPauloToday();
    const dowLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

    const [planRes, workoutsRes] = await Promise.all([
      this.supabaseService
        .from('training_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single(),
      (async () => {
        const { data: planRow } = await this.supabaseService
          .from('training_plans')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single();
        if (!planRow) return { data: [] as any[], error: null };
        return this.supabaseService
          .from('workouts')
          .select('*')
          .eq('user_id', userId)
          .eq('plan_id', planRow.id)
          .order('week_number', { ascending: true })
          .order('scheduled_date', { ascending: true });
      })(),
    ]);

    if (planRes.error && planRes.error.code !== 'PGRST116') throw planRes.error;
    const plan = planRes.data;
    if (!plan) return null;

    const workouts: any[] = workoutsRes.data ?? [];

    const planJson = plan.plan_json ?? {};
    const generatedWeeks: GeneratedWeek[] = Array.isArray(planJson.weeks)
      ? planJson.weeks
      : [];

    const phaseByWeek = new Map<number, WeekPhase>();
    for (const gw of generatedWeeks) {
      if (typeof gw.week_number === 'number' && gw.phase) {
        phaseByWeek.set(gw.week_number, gw.phase);
      }
    }

    const totalWeeks: number =
      plan.duration_weeks ?? generatedWeeks.length ?? 0;
    const planStart = new Date(plan.created_at);
    planStart.setHours(0, 0, 0, 0);
    const planEnd = new Date(planStart);
    planEnd.setDate(planEnd.getDate() + totalWeeks * 7 - 1);

    const phaseLabelMap: Record<string, string> = {
      base: 'base',
      build: 'desenvolvimento',
      peak: 'específico',
      taper: 'polimento',
    };

    const workoutsByWeek = new Map<number, any[]>();
    for (const w of workouts) {
      const wn = w.week_number;
      if (typeof wn !== 'number') continue;
      if (!workoutsByWeek.has(wn)) workoutsByWeek.set(wn, []);
      workoutsByWeek.get(wn).push(w);
    }

    const weekNumbers = new Set<number>([
      ...Array.from(workoutsByWeek.keys()),
      ...Array.from(phaseByWeek.keys()),
    ]);
    for (let i = 1; i <= totalWeeks; i++) weekNumbers.add(i);

    const sortedWeekNumbers = Array.from(weekNumbers).sort((a, b) => a - b);

    const weeks: PlanWeekDto[] = sortedWeekNumbers.map((weekNumber) => {
      const wkWorkouts = (workoutsByWeek.get(weekNumber) ?? []).slice();
      const phase =
        phaseByWeek.get(weekNumber) ??
        (wkWorkouts[0]?.metadata?.week_phase as WeekPhase | undefined) ??
        'base';

      // Derived week boundaries: prefer actual scheduled_dates; fall back
      // to plan-relative calculation so unhydrated future weeks still
      // render a coherent period in the UI.
      let startDate: string;
      let endDate: string;
      if (wkWorkouts.length > 0) {
        const dates = wkWorkouts
          .map((w) => w.scheduled_date)
          .filter(Boolean)
          .sort();
        startDate = dates[0] ?? '';
        endDate = dates[dates.length - 1] ?? startDate;
      }
      if (!wkWorkouts.length || !startDate) {
        const ws = new Date(planStart);
        ws.setDate(ws.getDate() + (weekNumber - 1) * 7);
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        startDate = ws.toISOString().split('T')[0];
        endDate = we.toISOString().split('T')[0];
      }

      const completedWorkouts = wkWorkouts.filter(
        (w) => w.status === 'completed',
      ).length;

      const totalWorkouts = wkWorkouts.length;

      const weekEnd = new Date(endDate + 'T00:00:00');
      const weekStart = new Date(startDate + 'T00:00:00');
      const isCurrent = today >= weekStart && today <= weekEnd;

      const workoutDtos: PlanWorkoutDto[] = wkWorkouts.map((w) => {
        const dow = w.scheduled_date
          ? new Date(w.scheduled_date + 'T00:00:00').getDay()
          : 0;

        const executed =
          w.status === 'completed' &&
          (w.distance_run != null || w.time_run_seconds != null)
            ? {
                distance_km: Number(w.distance_run ?? w.distance_km ?? 0),
                duration_seconds: Number(w.time_run_seconds ?? 0),
                pace_seconds_per_km: Number(w.pace_seconds_per_km ?? 0),
              }
            : null;

        const title = w.title ?? getWorkoutTitlePtBr(w.type);

        return {
          id: w.id,
          day_of_week: dowLabels[dow] ?? '',
          scheduled_date: w.scheduled_date,
          type: w.type,
          title,
          distance_km: Number(w.distance_km ?? 0),
          target_pace_seconds_per_km: w.target_pace_seconds ?? null,
          instructions_json: Array.isArray(w.instructions_json)
            ? w.instructions_json
            : [],
          status: w.status as PlanWorkoutDto['status'],
          executed_data: executed,
        };
      });

      return {
        week_number: weekNumber,
        phase,
        phase_label: phaseLabelMap[phase] ?? phase,
        start_date: startDate,
        end_date: endDate,
        total_workouts: totalWorkouts,
        completed_workouts: completedWorkouts,
        is_current: isCurrent,
        workouts: workoutDtos,
      };
    });

    // currentWeek = first week whose end_date >= today (São Paulo); fall
    // back to the last week if the plan already finished.
    const currentWeek =
      weeks.find((w) => w.end_date >= todayStr)?.week_number ??
      (weeks.length > 0 ? weeks[weeks.length - 1].week_number : 1);

    const completedWeeks = weeks.filter(
      (w) => w.total_workouts > 0 && w.completed_workouts === w.total_workouts,
    ).length;

    // Real distance the user has actually run (accumulates as workouts
    // are completed). Prefer distance_run (the GPS-measured value);
    // fall back to distance_km only when the legacy column wasn't set.
    const completedDistanceKm = workouts.reduce((sum, w) => {
      if (w.status !== 'completed') return sum;
      const run = Number(w.distance_run ?? w.distance_km ?? 0);
      return sum + (isFinite(run) ? run : 0);
    }, 0);

    // Planned total — sum of every workout's distance_km. Used by the UI
    // to render "X / Y Km" progress instead of a bare number.
    const targetTotalKm = workouts.reduce(
      (sum, w) => sum + Number(w.distance_km ?? 0),
      0,
    );

    const targetDistance = extractTargetDistanceLabel(plan.goal);
    const title = `Plano de treino ${targetDistance}`;

    return {
      overview: {
        plan_id: plan.id,
        title,
        target_distance: targetDistance,
        end_date: planEnd.toISOString().split('T')[0],
        total_weeks: totalWeeks,
        completed_weeks: completedWeeks,
        current_week: currentWeek,
        total_distance_km: Math.round(completedDistanceKm * 10) / 10,
        target_total_km: Math.round(targetTotalKm * 10) / 10,
        generation_status: plan.generation_status ?? null,
      },
      weeks,
    };
  }
}

function getWorkoutTitlePtBr(type: string): string {
  const map: Record<string, string> = {
    easy_run: 'Rodagem Leve',
    long_run: 'Longão',
    intervals: 'Intervalado',
    tempo: 'Tempo Run',
    recovery: 'Recuperação',
    fartlek: 'Fartlek',
    progressive: 'Progressivo',
    repetition: 'Repetições',
    hill_repeats: 'Subidas',
    race_simulation: 'Simulação de Prova',
    free_run: 'Corrida Livre',
  };
  return map[type] ?? type;
}

function extractTargetDistanceLabel(goal: string | null | undefined): string {
  if (!goal) return '—';
  const g = goal.trim().toLowerCase();

  // Named-goal shortcuts that the onboarding stores in plan.goal
  // ('5k', '10k', 'half_marathon', 'marathon'…). Map them to the
  // distance label the user expects to see on the Goals screen.
  const namedGoals: Record<string, string> = {
    '5k': '5 Km',
    '10k': '10 Km',
    '15k': '15 Km',
    '21k': '21 Km',
    half_marathon: 'Meia Maratona',
    'half-marathon': 'Meia Maratona',
    halfmarathon: 'Meia Maratona',
    meia_maratona: 'Meia Maratona',
    'meia-maratona': 'Meia Maratona',
    marathon: 'Maratona',
    maratona: 'Maratona',
    '42k': 'Maratona',
    fitness: 'Condicionamento',
    weight_loss: 'Emagrecimento',
    start_running: 'Começar a Correr',
  };
  if (namedGoals[g]) return namedGoals[g];

  const match = g.match(/(\d+(?:[.,]\d+)?)\s*k?m?/i);
  if (match) return `${match[1].replace(',', '.')} Km`;
  return goal;
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
    source: 'plan' | 'manual' | 'free' | null;
    title: string | null;
    target_pace_seconds: number | null;
    target_duration_seconds: number | null;
    activity_id: string | null;
    feedback_id: string | null;
  } | null;
  is_today: boolean;
  is_past: boolean;
}
