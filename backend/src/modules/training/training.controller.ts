import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  TrainingService,
  QuickPlanResponse,
  GenerationStatus,
} from './training.service';
import {
  RetrospectiveService,
  CustomizePlanDto,
} from './retrospective.service';
import { TrainingAIService } from './training-ai.service';
import { SupabaseService } from '../../database';
import { User } from '../../common/decorators';
import { ProGuard } from '../../common/guards/pro.guard';
import { UsersService } from '../users/users.service';
import { GamificationService } from '../gamification/gamification.service';
import { CreateManualWorkoutDto } from './dto/create-manual-workout.dto';
import { CompleteFreeWorkoutDto } from './dto/complete-free-workout.dto';

interface CreatePlanDto {
  // Biometrics (New)
  birth_date: { day: number; month: number; year: number } | null;
  weight: number | null;
  height: number | null;

  // Original fields
  goal: string;
  level: string;
  days_per_week: number;

  // Availability (New)
  available_days: number[]; // 0=DOM, 1=SEG, ..., 6=SAB
  intense_day_index: number | null; // Which day for intense workout

  // Pace data
  current_pace_5k: number | null;
  pace_minutes: string | null;
  pace_seconds: string | null;
  dont_know_pace: boolean;

  // Goal duration
  goal_timeframe: number | null; // months (1, 3, 6)
  target_weeks: number;
  limitations: string | null;
  preferred_days: number[];

  // Performance Baseline (New)
  recent_distance: number | null; // 3, 5, 10, or 15 km — 0 = "nunca corri"
  distance_time: { hours: number; minutes: number; seconds: number } | null;
  calculated_pace: number | null; // min/km
  start_date: string | null; // ISO string

  // Capacidade atual (Fase A) — enum-strings; só transportadas/persistidas.
  // A Fase B (motor de volume determinístico) as consome.
  recent_frequency?: string | null; // 'never' | '1x' | '2x' | '3x' | '4x_plus'
  current_weekly_km?: string | null; // 'lt5' | '5_10' | '10_20' | '20_30' | 'gt30'
  walk_capacity?: string | null; // 'easy' | 'effort' | 'not_yet'

  // Race goal (Fase 2) — set when the user picks/enters a race instead of a
  // pure distance goal. goal_timeframe stays null; the horizon is the race date.
  goal_type?: 'distance' | 'race';
  race_id?: string | null;
  race_date?: string | null; // 'YYYY-MM-DD'
  race_name?: string | null;
  race_distance?: number | null; // km

  // Onboarding XP (credited once on successful completion)
  onboarding_xp?: number;
}

// Whole weeks from today (São Paulo-naive; day granularity is enough here) to a
// 'YYYY-MM-DD' race date. Returns null for missing/invalid dates.
function weeksUntil(raceDate?: string | null): number | null {
  if (!raceDate) return null;
  const race = new Date(`${raceDate}T00:00:00`);
  if (Number.isNaN(race.getTime())) return null;
  const today = new Date();
  const days = Math.ceil((race.getTime() - today.getTime()) / 86_400_000);
  return Math.max(Math.ceil(days / 7), 1);
}

interface SkipWorkoutDto {
  reason: string;
}

@Controller('training')
export class TrainingController {
  private readonly logger = new Logger(TrainingController.name);

  constructor(
    private readonly trainingService: TrainingService,
    private readonly retrospectiveService: RetrospectiveService,
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
    private readonly gamificationService: GamificationService,
    private readonly trainingAIService: TrainingAIService,
  ) {}

  /**
   * Look up the user's subscription plan. Returns true when the row is missing
   * (legacy users created before the subscription_plan column existed default to
   * 'free' via the migration, so a missing row would only happen for ghost IDs).
   */
  private async isFreeUser(userId: string): Promise<boolean> {
    const { data } = await this.supabaseService
      .from('users')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();
    return (data?.subscription_plan ?? 'free') === 'free';
  }

  /**
   * Credit onboarding XP idempotently. Uses points_history.reference_type='onboarding'
   * + reference_id=userId as the dedupe key — safe to call on retries.
   */
  private async creditOnboardingXP(userId: string, amount: number) {
    const safeAmount = Math.max(0, Math.min(500, Math.round(amount || 0)));
    if (safeAmount === 0) return;

    const { data: existing } = await this.supabaseService
      .from('points_history')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_type', 'onboarding')
      .eq('reference_id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      this.logger.log(
        `[OnboardingXP] User ${userId} already credited, skipping`,
      );
      return;
    }

    try {
      const result = await this.gamificationService.addPoints(
        userId,
        safeAmount,
        'Onboarding concluído',
        'onboarding',
        userId,
      );
      this.logger.log(
        `[OnboardingXP] +${safeAmount} XP for user ${userId} ` +
          `(newTotal=${result.newTotal}, level=${result.newLevel}, levelUp=${result.levelUp})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[OnboardingXP] Failed to credit XP for user ${userId}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Award the welcome badge idempotently on onboarding completion. The badge is
   * seeded by migration (slug='welcome', xp_reward=0 so it never double-credits
   * XP). Guarded by an existing user_badges row, so it's safe on retries. Makes
   * the onboarding "Badge de Boas-Vindas: CONQUISTADO" claim actually true.
   */
  private async awardWelcomeBadge(userId: string) {
    try {
      const { data: badge } = await this.supabaseService
        .from('badges')
        .select('id')
        .eq('slug', 'welcome')
        .maybeSingle();
      if (!badge?.id) return; // badge not seeded yet — skip silently

      const { data: existing } = await this.supabaseService
        .from('user_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .limit(1);
      if (existing && existing.length > 0) return;

      await this.supabaseService
        .from('user_badges')
        .insert({ user_id: userId, badge_id: badge.id });
      this.logger.log(`[WelcomeBadge] Awarded to user ${userId}`);
    } catch (err: any) {
      this.logger.warn(
        `[WelcomeBadge] Failed to award for user ${userId}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Save onboarding data and create training plan (FAST - uses Prompt Chaining)
   * Note: Auth via x-user-id header
   * Response time: ~3-5 seconds (background process generates remaining weeks)
   */
  @Post('onboarding')
  async completeOnboarding(
    @User('id') userId: string,
    @Body() dto: CreatePlanDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      // Save onboarding data with new biometric and performance fields
      const { error: upsertError } = await this.supabaseService
        .from('user_onboarding')
        .upsert({
          user_id: userId,
          // Biometrics
          birth_date: dto.birth_date,
          weight: dto.weight,
          height: dto.height,
          // Core fields
          goal: dto.goal,
          level: dto.level,
          days_per_week: dto.days_per_week,
          // Availability
          available_days: dto.available_days,
          intense_day_index: dto.intense_day_index,
          // Pace data
          current_pace_5k: dto.current_pace_5k,
          pace_minutes: dto.pace_minutes,
          pace_seconds: dto.pace_seconds,
          dont_know_pace: dto.dont_know_pace,
          // Goal duration
          goal_timeframe: dto.goal_timeframe,
          target_weeks: dto.target_weeks,
          has_limitations: !!dto.limitations,
          limitations: dto.limitations,
          preferred_days: dto.preferred_days,
          // Race goal
          goal_type: dto.goal_type ?? 'distance',
          race_id: dto.race_id ?? null,
          race_date: dto.race_date ?? null,
          race_name: dto.race_name ?? null,
          race_distance: dto.race_distance ?? null,
          // Performance Baseline
          recent_distance: dto.recent_distance,
          distance_time: dto.distance_time,
          calculated_pace: dto.calculated_pace,
          start_date: dto.start_date,
          // Capacidade atual (Fase A)
          recent_frequency: dto.recent_frequency ?? null,
          current_weekly_km: dto.current_weekly_km ?? null,
          walk_capacity: dto.walk_capacity ?? null,
          // Meta
          completed_at: new Date().toISOString(),
          responses_json: dto,
        });

      if (upsertError) {
        this.logger.error(
          `Failed to save onboarding data: ${upsertError.message}`,
          upsertError,
        );
        throw new HttpException(
          `Failed to save onboarding data: ${upsertError.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.log(`Onboarding data saved for user ${userId}`);

      // Sync biometrics to users.profile JSONB so screens can access them directly
      await this.usersService.updateProfile(userId, {
        birth_date: dto.birth_date,
        weight_kg: dto.weight,
        height_cm: dto.height,
      });

      // CRITICAL: Mark onboarding as complete in users table
      // This unlocks the user from the Onboarding screen
      await this.usersService.markOnboardingComplete(userId);
      this.logger.log(`Onboarding marked complete for user ${userId}`);

      // Credit XP earned during the onboarding quiz (idempotent)
      await this.creditOnboardingXP(userId, dto.onboarding_xp ?? 0);

      // Award the welcome badge (idempotent)
      await this.awardWelcomeBadge(userId);

      // Free users: persist onboarding data but skip AI plan generation.
      // The mobile shows UpgradeProCard in place of the workout sections.
      // The plan will be generated by the RevenueCat webhook on upgrade.
      if (await this.isFreeUser(userId)) {
        this.logger.log(
          `[onboarding] User ${userId} is free — skipping plan generation`,
        );
        return {
          success: true,
          generated: false,
          reason: 'free_plan',
        };
      }

      // Create QUICK training plan (Prompt 1 only - fast ~3-5s)
      // Background process will generate remaining weeks (Prompt 2)
      // The user's actual day selection lives in `available_days`
      // (set on AvailableDaysScreen). `preferred_days` is a legacy field
      // the mobile never populates — fall back to it only if available_days
      // is missing.
      const selectedDays =
        (dto.available_days?.length
          ? dto.available_days
          : dto.preferred_days) || [];

      this.logger.log(
        `[onboarding] Resolved selectedDays=${JSON.stringify(selectedDays)} for user ${userId} ` +
          `(dto.available_days=${JSON.stringify(dto.available_days)}, dto.preferred_days=${JSON.stringify(dto.preferred_days)}, days_per_week=${dto.days_per_week})`,
      );

      const result = await this.trainingService.createQuickPlan(userId, {
        goal: dto.goal,
        level: dto.level,
        daysPerWeek: dto.days_per_week,
        currentPace5k: dto.current_pace_5k,
        // Performance baseline measured in onboarding — drives VDOT estimation.
        calculatedPace: dto.calculated_pace ?? null,
        recentDistanceKm: dto.recent_distance ?? null,
        targetWeeks:
          dto.goal_type === 'race' && weeksUntil(dto.race_date)
            ? (weeksUntil(dto.race_date) as number)
            : dto.target_weeks,
        limitations: dto.limitations,
        preferredDays: selectedDays,
        startDate: dto.start_date,
        // Race goal
        goalType: dto.goal_type ?? 'distance',
        raceId: dto.race_id ?? null,
        raceDate: dto.race_date ?? null,
        raceName: dto.race_name ?? null,
        raceDistance: dto.race_distance ?? null,
        raceWeeksUntil: weeksUntil(dto.race_date),
        // Capacidade atual (Fase A) — transporte para a Fase B
        recentFrequency: dto.recent_frequency ?? null,
        currentWeeklyKm: dto.current_weekly_km ?? null,
        walkCapacity: dto.walk_capacity ?? null,
      });

      // Return immediately with first workout data
      return {
        success: true,
        plan_id: result.plan_id,
        generation_status: result.generation_status,
        workouts_count: result.workouts_count,
        // Plan preview data for SmartPlanScreen
        planHeader: result.planHeader,
        planHeadline: result.planHeadline,
        welcomeBadge: result.welcomeBadge,
        nextWorkout: result.nextWorkout,
      };
    } catch (error) {
      this.logger.error('Onboarding failed', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create plan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Save onboarding data ONLY (no AI generation).
   * Called after paywall subscription is confirmed, before AI generation.
   */
  @Post('onboarding/save')
  async saveOnboardingOnly(
    @User('id') userId: string,
    @Body() dto: CreatePlanDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      // Save onboarding data
      const { error: upsertError } = await this.supabaseService
        .from('user_onboarding')
        .upsert({
          user_id: userId,
          birth_date: dto.birth_date,
          weight: dto.weight,
          height: dto.height,
          goal: dto.goal,
          level: dto.level,
          days_per_week: dto.days_per_week,
          available_days: dto.available_days,
          intense_day_index: dto.intense_day_index,
          current_pace_5k: dto.current_pace_5k,
          pace_minutes: dto.pace_minutes,
          pace_seconds: dto.pace_seconds,
          dont_know_pace: dto.dont_know_pace,
          goal_timeframe: dto.goal_timeframe,
          target_weeks: dto.target_weeks,
          has_limitations: !!dto.limitations,
          limitations: dto.limitations,
          preferred_days: dto.preferred_days,
          goal_type: dto.goal_type ?? 'distance',
          race_id: dto.race_id ?? null,
          race_date: dto.race_date ?? null,
          race_name: dto.race_name ?? null,
          race_distance: dto.race_distance ?? null,
          recent_distance: dto.recent_distance,
          distance_time: dto.distance_time,
          calculated_pace: dto.calculated_pace,
          start_date: dto.start_date,
          recent_frequency: dto.recent_frequency ?? null,
          current_weekly_km: dto.current_weekly_km ?? null,
          walk_capacity: dto.walk_capacity ?? null,
          completed_at: new Date().toISOString(),
          responses_json: dto,
        });

      if (upsertError) {
        this.logger.error(
          `Failed to save onboarding data: ${upsertError.message}`,
          upsertError,
        );
        throw new HttpException(
          `Failed to save onboarding data: ${upsertError.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.log(
        `[save] Onboarding data saved for user ${userId} ` +
          `(days_per_week=${dto.days_per_week}, available_days=${JSON.stringify(dto.available_days)}, preferred_days=${JSON.stringify(dto.preferred_days)})`,
      );

      // Re-onboarding implies "I want a new plan". Cancel any prior
      // active plan so the subsequent /onboarding/generate call doesn't
      // short-circuit on a stale plan generated before the user changed
      // their answers (e.g. picking different available_days).
      const { data: cancelled, error: cancelError } = await this.supabaseService
        .from('training_plans')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'active')
        .select('id');

      if (cancelError) {
        this.logger.warn(
          `[save] Failed to cancel prior active plans: ${cancelError.message}`,
        );
      } else if (cancelled && cancelled.length > 0) {
        this.logger.log(
          `[save] Cancelled ${cancelled.length} prior active plan(s) so /generate will produce a fresh one`,
        );
      }

      // Sync biometrics to users.profile
      await this.usersService.updateProfile(userId, {
        birth_date: dto.birth_date,
        weight_kg: dto.weight,
        height_cm: dto.height,
      });

      // Mark onboarding as complete (unlocks user from onboarding screens)
      await this.usersService.markOnboardingComplete(userId);
      this.logger.log(`[save] Onboarding marked complete for user ${userId}`);

      // Credit onboarding XP earned during the quiz (idempotent)
      await this.creditOnboardingXP(userId, dto.onboarding_xp ?? 0);

      // Award the welcome badge (idempotent)
      await this.awardWelcomeBadge(userId);

      return { success: true };
    } catch (error) {
      this.logger.error('Save onboarding failed', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to save onboarding data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Trigger AI plan generation from saved onboarding data.
   * Called after user subscribes and navigates to Home.
   * Idempotent: if a plan already exists, returns the existing plan_id.
   */
  @Post('onboarding/generate')
  async generatePlanFromOnboarding(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    // Free users cannot trigger plan generation. The RevenueCat webhook
    // takes over once subscription_plan flips to 'pro'.
    if (await this.isFreeUser(userId)) {
      this.logger.log(
        `[generate] User ${userId} is free — refusing generation`,
      );
      return { generated: false, reason: 'free_plan' };
    }

    try {
      // Check if user already has an active plan (idempotent)
      const existingPlan = await this.trainingService.getActivePlan(userId);
      if (existingPlan) {
        // If the previous generation failed, cancel it and re-trigger
        if (existingPlan.generation_status === 'failed') {
          this.logger.log(
            `[generate] Previous plan ${existingPlan.id} failed, cancelling and re-generating`,
          );
          await this.supabaseService
            .from('training_plans')
            .update({ status: 'cancelled' })
            .eq('id', existingPlan.id);
          // Fall through to create a new plan below
        } else {
          this.logger.log(
            `[generate] User ${userId} already has active plan ${existingPlan.id} (status: ${existingPlan.generation_status})`,
          );
          return {
            plan_id: existingPlan.id,
            generation_status: existingPlan.generation_status || 'complete',
            already_exists: true,
          };
        }
      }

      // Read saved onboarding data
      const { data: onboardingData, error: readError } =
        await this.supabaseService
          .from('user_onboarding')
          .select('*')
          .eq('user_id', userId)
          .single();

      if (readError || !onboardingData) {
        this.logger.error(
          `No onboarding data found for user ${userId}`,
          readError,
        );
        throw new HttpException(
          'Onboarding data not found. Please complete the quiz first.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Reconstruct plan request from saved data
      const dto = onboardingData.responses_json || onboardingData;

      // Prefer the user's actual selection (available_days) over the
      // legacy preferred_days field, which the mobile never populates.
      const selectedDays =
        (dto.available_days?.length ? dto.available_days : null) ||
        (onboardingData.available_days?.length
          ? onboardingData.available_days
          : null) ||
        dto.preferred_days ||
        onboardingData.preferred_days ||
        [];

      this.logger.log(
        `[generate] Resolved selectedDays=${JSON.stringify(selectedDays)} for user ${userId} ` +
          `(dto.available_days=${JSON.stringify(dto.available_days)}, ` +
          `onboarding.available_days=${JSON.stringify(onboardingData.available_days)}, ` +
          `dto.preferred_days=${JSON.stringify(dto.preferred_days)})`,
      );

      const result = await this.trainingService.createQuickPlan(userId, {
        goal: dto.goal || onboardingData.goal,
        level: dto.level || onboardingData.level,
        daysPerWeek: dto.days_per_week || onboardingData.days_per_week,
        currentPace5k: dto.current_pace_5k || onboardingData.current_pace_5k,
        // Performance baseline measured in onboarding — drives VDOT estimation.
        calculatedPace:
          dto.calculated_pace ?? onboardingData.calculated_pace ?? null,
        recentDistanceKm:
          dto.recent_distance ?? onboardingData.recent_distance ?? null,
        targetWeeks: (() => {
          const goalType = dto.goal_type ?? onboardingData.goal_type;
          const raceDate = dto.race_date ?? onboardingData.race_date;
          const w = weeksUntil(raceDate);
          return goalType === 'race' && w
            ? w
            : dto.target_weeks || onboardingData.target_weeks;
        })(),
        limitations: dto.limitations || onboardingData.limitations,
        preferredDays: selectedDays,
        startDate: dto.start_date || onboardingData.start_date,
        // Race goal
        goalType: dto.goal_type ?? onboardingData.goal_type ?? 'distance',
        raceId: dto.race_id ?? onboardingData.race_id ?? null,
        raceDate: dto.race_date ?? onboardingData.race_date ?? null,
        raceName: dto.race_name ?? onboardingData.race_name ?? null,
        raceDistance: dto.race_distance ?? onboardingData.race_distance ?? null,
        raceWeeksUntil: weeksUntil(dto.race_date ?? onboardingData.race_date),
        // Capacidade atual (Fase A) — lê do responses_json ou da coluna dedicada
        recentFrequency:
          dto.recent_frequency ?? onboardingData.recent_frequency ?? null,
        currentWeeklyKm:
          dto.current_weekly_km ?? onboardingData.current_weekly_km ?? null,
        walkCapacity: dto.walk_capacity ?? onboardingData.walk_capacity ?? null,
      });

      this.logger.log(
        `[generate] Plan generated for user ${userId}, plan_id: ${result.plan_id}`,
      );

      return {
        plan_id: result.plan_id,
        generation_status: result.generation_status,
        workouts_count: result.workouts_count,
      };
    } catch (error) {
      this.logger.error('Plan generation failed', error);
      // Re-throw HttpExceptions as-is to preserve their status code
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to generate plan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Pré-check de viabilidade da meta (Fase C) — rápido, puro, sem IA/DB. O mobile
   * chama ANTES de finalizar o onboarding: inviável → modal de ajuste (distância)
   * ou informativo (prova). Usa a MESMA derivação da geração
   * (TrainingAIService.assessRequestViability), então o veredito é idêntico ao
   * plano que seria gerado. neverRan (nunca correu) → sempre feasible.
   */
  @Post('onboarding/precheck')
  assessViability(@Body() dto: CreatePlanDto, @User('id') userId: string) {
    const goalType = dto.goal_type ?? 'distance';
    const raceWeeks =
      goalType === 'race' && dto.race_date ? weeksUntil(dto.race_date) : null;
    const totalWeeks = raceWeeks ?? dto.target_weeks;

    const verdict = this.trainingAIService.assessRequestViability({
      goal: dto.goal,
      goalType,
      raceDistance: dto.race_distance ?? null,
      raceWeeksUntil: raceWeeks,
      targetWeeks: totalWeeks,
      recentDistanceKm: dto.recent_distance ?? null,
      recentFrequency: dto.recent_frequency ?? null,
      currentWeeklyKm: dto.current_weekly_km ?? null,
      level: dto.level,
    });

    this.logger.log(
      `[precheck] user=${userId} goal=${dto.goal} type=${goalType} weeks=${totalWeeks} ` +
        `→ feasible=${verdict.feasible} minWeeks=${verdict.minWeeksRecommended} ` +
        `maxGoalKm=${verdict.maxGoalKmInWindow} neverRan=${verdict.neverRan}`,
    );

    return {
      feasible: verdict.feasible,
      neverRan: verdict.neverRan,
      minWeeksRecommended: verdict.minWeeksRecommended,
      maxGoalKmInWindow: verdict.maxGoalKmInWindow,
      peakLongRunKm: verdict.peakLongRunKm,
      requiredWeeklyIncreasePct: verdict.requiredWeeklyIncreasePct,
    };
  }

  /**
   * Get plan generation status (for polling during background generation)
   */
  @Get('plan/:id/status')
  async getPlanStatus(
    @User('id') userId: string,
    @Param('id') planId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const status = await this.trainingService.getPlanGenerationStatus(planId);
      return {
        plan_id: planId,
        generation_status: status.status,
        workouts_count: status.workouts_count,
        is_complete: status.status === 'complete',
      };
    } catch (error) {
      this.logger.error('Failed to get plan status', error);
      throw new HttpException(
        error.message || 'Failed to get plan status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get active training plan
   */
  @Get('plan')
  async getActivePlan(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const plan = await this.trainingService.getActivePlan(userId);
    return { plan };
  }

  /**
   * Consolidated overview consumed by the Goals screen. Returns the active
   * plan summary + all weeks (with phase) + workouts grouped by week. Returns
   * 404 when the user has no active plan.
   */
  @Get('plan/overview')
  async getPlanOverview(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const overview = await this.trainingService.getPlanOverview(userId);
      if (!overview) {
        throw new HttpException('No active plan', HttpStatus.NOT_FOUND);
      }
      return overview;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to load plan overview', error);
      throw new HttpException(
        error.message || 'Failed to load plan overview',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get workouts for calendar view
   */
  @Get('workouts')
  async getWorkouts(
    @User('id') userId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const workouts = await this.trainingService.getWorkouts(
      userId,
      startDate,
      endDate,
    );
    return { workouts };
  }

  /**
   * Get upcoming workouts
   */
  @Get('workouts/upcoming')
  async getUpcomingWorkouts(
    @User('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const workouts = await this.trainingService.getUpcomingWorkouts(
      userId,
      limit ? parseInt(limit, 10) : 7,
    );
    return { workouts };
  }

  /**
   * Get workout details
   */
  @Get('workouts/:id')
  async getWorkout(
    @User('id') userId: string,
    @Param('id') workoutId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const workout = await this.trainingService.getWorkout(userId, workoutId);
    return { workout };
  }

  /**
   * Read the existing deep-dive briefing for a workout (no generation).
   * Returns { briefing: null } when none exists yet. Not Pro-gated: reading is
   * harmless and lets the client decide between the "+" prompt and the saved
   * content on screen load.
   */
  @Get('workouts/:id/briefing')
  async getWorkoutBriefing(
    @User('id') userId: string,
    @Param('id') workoutId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const briefing = await this.trainingService.getWorkoutBriefing(
      userId,
      workoutId,
    );
    return { briefing };
  }

  /**
   * Generate (or return the existing) deep-dive coach briefing for a workout.
   * Pro-only feature — generated once per workout, on demand, then persisted.
   */
  @Post('workouts/:id/briefing')
  @UseGuards(ProGuard)
  async generateWorkoutBriefing(
    @User('id') userId: string,
    @Param('id') workoutId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const briefing = await this.trainingService.generateWorkoutBriefing(
      userId,
      workoutId,
    );
    return { briefing };
  }

  /**
   * Mark workout as skipped
   */
  @Put('workouts/:id/skip')
  async skipWorkout(
    @User('id') userId: string,
    @Param('id') workoutId: string,
    @Body() dto: SkipWorkoutDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const workout = await this.trainingService.skipWorkout(
      userId,
      workoutId,
      dto.reason,
    );
    return { workout };
  }

  /**
   * Create a user-defined manual workout (source='manual').
   * Saved as a regular workout row so it appears on the calendar and can be tracked.
   */
  @Post('workouts/manual')
  async createManualWorkout(
    @User('id') userId: string,
    @Body() dto: CreateManualWorkoutDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const workout = await this.trainingService.createManualWorkout(
        userId,
        dto,
      );
      return { success: true, workout };
    } catch (error) {
      this.logger.error('Failed to create manual workout', error);
      throw new HttpException(
        error.message || 'Failed to create manual workout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Complete a free run (source='free').
   * Creates the workout row on the fly and routes through the standard completion pipeline.
   */
  @Post('workouts/free/complete')
  async completeFreeWorkout(
    @User('id') userId: string,
    @Body() dto: CompleteFreeWorkoutDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const workout = await this.trainingService.completeFreeWorkout(
        userId,
        dto,
      );
      return { success: true, workout };
    } catch (error) {
      this.logger.error('Failed to complete free workout', error);
      throw new HttpException(
        error.message || 'Failed to complete free workout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Complete workout from Native Tracking
   */
  @Post('workouts/:id/complete')
  async completeWorkout(
    @User('id') userId: string,
    @Param('id') workoutId: string,
    @Body() dto: import('./dto/workout-tracking.dto').CreateWorkoutTrackingDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const workout = await this.trainingService.completeWorkout(
        userId,
        workoutId,
        dto,
      );
      return { success: true, workout };
    } catch (error) {
      this.logger.error(`Failed to complete workout ${workoutId}`, error);
      throw new HttpException(
        error.message || 'Failed to complete workout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get schedule with type and status for each day
   * Returns: type ('workout' | 'recovery'), status ('completed' | 'missed' | 'pending')
   * Use this endpoint to render calendar icons and conditional UI
   */
  @Get('schedule')
  async getSchedule(
    @User('id') userId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    if (!startDate || !endDate) {
      throw new HttpException(
        'start_date and end_date are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const schedule = await this.trainingService.getScheduleWithStatus(
        userId,
        startDate,
        endDate,
      );
      const nextWorkout = await this.trainingService.getNextWorkout(userId);
      const todayEntry = schedule.find((s) => s.is_today);

      return {
        schedule,
        today: todayEntry || null,
        next_workout: nextWorkout,
      };
    } catch (error) {
      this.logger.error('Failed to get schedule', error);
      throw new HttpException(
        error.message || 'Failed to get schedule',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =============================================
  // RETROSPECTIVE ENDPOINTS
  // =============================================

  /**
   * Get the latest retrospective for the user
   */
  @Get('retrospective/latest')
  async getLatestRetrospective(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const retrospective =
        await this.retrospectiveService.getLatestRetrospective(userId);

      if (!retrospective) {
        return { retrospective: null, hasRetrospective: false };
      }

      // Format pace for display
      const formatPace = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
      };

      return {
        hasRetrospective: true,
        retrospective: {
          ...retrospective,
          avgPaceFormatted: formatPace(retrospective.avgPaceSeconds),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get retrospective', error);
      throw new HttpException(
        error.message || 'Failed to get retrospective',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Check if user has a ready retrospective (for Home card)
   * Returns isReady flag and retrospective ID if available
   */
  @Get('retrospective/ready')
  async hasReadyRetrospective(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const retrospective =
        await this.retrospectiveService.getLatestRetrospective(userId);

      if (!retrospective) {
        return { isReady: false, retrospectiveId: null };
      }

      // Check if it was created in the last 7 days (still "fresh")
      const createdAt = new Date(retrospective.createdAt);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const isReady = createdAt > sevenDaysAgo;

      return {
        isReady,
        retrospectiveId: retrospective.id,
        createdAt: retrospective.createdAt,
      };
    } catch (error) {
      this.logger.error('Failed to check retrospective status', error);
      return { isReady: false, retrospectiveId: null };
    }
  }

  /**
   * Accept AI suggestion from retrospective
   */
  @Post('retrospective/:id/accept')
  async acceptRetrospectiveSuggestion(
    @User('id') userId: string,
    @Param('id') retrospectiveId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const result = await this.retrospectiveService.acceptSuggestion(
        userId,
        retrospectiveId,
      );
      return result;
    } catch (error) {
      this.logger.error('Failed to accept suggestion', error);
      throw new HttpException(
        error.message || 'Failed to accept suggestion',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Customize new plan with manual parameters
   */
  @Post('retrospective/:id/customize')
  async customizeRetrospectivePlan(
    @User('id') userId: string,
    @Param('id') retrospectiveId: string,
    @Body() params: CustomizePlanDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      return await this.retrospectiveService.customizePlan(
        userId,
        retrospectiveId,
        params,
      );
    } catch (error) {
      this.logger.error('Failed to customize plan', error);
      throw new HttpException(
        error.message || 'Failed to customize plan',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Manually trigger retrospective generation for a user
   * Used for recovery when cron job fails, and for debugging.
   * Pro-only: retrospective (Coach Analysis) is a paid AI feature.
   */
  @Post('retrospective/generate')
  @UseGuards(ProGuard)
  async manuallyGenerateRetrospective(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log(
      `[Retrospective] Manual trigger requested for user ${userId}`,
    );

    try {
      // Get active plan for this user
      const { data: activePlan } = await this.supabaseService
        .from('training_plans')
        .select('id, created_at, duration_weeks, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!activePlan) {
        throw new HttpException(
          'No active plan found for user',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if retrospective already exists
      const { data: existingRetro } = await this.supabaseService
        .from('plan_retrospectives')
        .select('id')
        .eq('plan_id', activePlan.id)
        .maybeSingle();

      if (existingRetro) {
        return {
          success: true,
          message: 'Retrospective already exists',
          retrospective_id: existingRetro.id,
          already_existed: true,
        };
      }

      // Generate retrospective
      const retrospective =
        await this.retrospectiveService.generateRetrospective(
          userId,
          activePlan.id,
        );

      if (!retrospective) {
        throw new HttpException(
          'Failed to generate retrospective',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        success: true,
        message: 'Retrospective generated successfully',
        retrospective_id: retrospective.id,
        plan_id: activePlan.id,
        already_existed: false,
      };
    } catch (error) {
      this.logger.error('[Retrospective] Manual generation failed:', error);
      throw new HttpException(
        error.message || 'Failed to generate retrospective',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Admin endpoint to delete retrospective and related notifications for testing
   * Also reactivates the plan so generateRetrospective can be called again
   */
  @Delete('retrospective/reset')
  async resetRetrospective(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      // Delete all retrospectives for this user
      const { data: deletedRetros, error: retroError } =
        await this.supabaseService
          .from('plan_retrospectives')
          .delete()
          .eq('user_id', userId)
          .select('id');

      if (retroError) {
        this.logger.error('Failed to delete retrospectives:', retroError);
      }

      // Delete all notifications for this user
      const { data: deletedNotifs, error: notifError } =
        await this.supabaseService
          .from('notifications')
          .delete()
          .eq('user_id', userId)
          .select('id');

      if (notifError) {
        this.logger.error('Failed to delete notifications:', notifError);
      }

      // Reactivate all completed plans for this user
      const { data: updatedPlans, error: planError } =
        await this.supabaseService
          .from('training_plans')
          .update({ status: 'active' })
          .eq('user_id', userId)
          .eq('status', 'completed')
          .select('id');

      if (planError) {
        this.logger.error('Failed to reactivate plans:', planError);
      }

      return {
        success: true,
        deletedRetrospectives: deletedRetros?.length || 0,
        deletedNotifications: deletedNotifs?.length || 0,
        reactivatedPlans: updatedPlans?.length || 0,
      };
    } catch (error) {
      this.logger.error('[Retrospective] Reset failed:', error);
      throw new HttpException(
        'Failed to reset retrospective',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
