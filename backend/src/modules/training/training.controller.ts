import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    HttpException,
    HttpStatus,
    Logger,
    UseGuards,
} from '@nestjs/common';
import { TrainingService, QuickPlanResponse, GenerationStatus } from './training.service';
import { RetrospectiveService, CustomizePlanDto } from './retrospective.service';
import { TrainingAIService } from './training-ai.service';
import { SupabaseService } from '../../database';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { UsersService } from '../users/users.service';
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
    goal_timeframe: number | null; // months (1, 3, 6, 12)
    target_weeks: number;
    limitations: string | null;
    preferred_days: number[];

    // Performance Baseline (New)
    recent_distance: number | null; // 3, 5, 10, or 15 km
    distance_time: { hours: number; minutes: number; seconds: number } | null;
    calculated_pace: number | null; // min/km
    start_date: string | null; // ISO string
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
    ) { }

    /**
     * Save onboarding data and create training plan (FAST - uses Prompt Chaining)
     * Note: Auth via x-user-id header
     * Response time: ~3-5 seconds (background process generates remaining weeks)
     */
    @Post('onboarding')
    async completeOnboarding(
        @Headers('x-user-id') userId: string,
        @Body() dto: CreatePlanDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            // Save onboarding data with new biometric and performance fields
            const { error: upsertError } = await this.supabaseService.from('user_onboarding').upsert({
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
                // Performance Baseline
                recent_distance: dto.recent_distance,
                distance_time: dto.distance_time,
                calculated_pace: dto.calculated_pace,
                start_date: dto.start_date,
                // Meta
                completed_at: new Date().toISOString(),
                responses_json: dto,
            });

            if (upsertError) {
                this.logger.error(`Failed to save onboarding data: ${upsertError.message}`, upsertError);
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

            // Create QUICK training plan (Prompt 1 only - fast ~3-5s)
            // Background process will generate remaining weeks (Prompt 2)
            const result = await this.trainingService.createQuickPlan(userId, {
                goal: dto.goal,
                level: dto.level,
                daysPerWeek: dto.days_per_week,
                currentPace5k: dto.current_pace_5k,
                targetWeeks: dto.target_weeks,
                limitations: dto.limitations,
                preferredDays: dto.preferred_days,
                startDate: dto.start_date,
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
        @Headers('x-user-id') userId: string,
        @Body() dto: CreatePlanDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            // Save onboarding data
            const { error: upsertError } = await this.supabaseService.from('user_onboarding').upsert({
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
                recent_distance: dto.recent_distance,
                distance_time: dto.distance_time,
                calculated_pace: dto.calculated_pace,
                start_date: dto.start_date,
                completed_at: new Date().toISOString(),
                responses_json: dto,
            });

            if (upsertError) {
                this.logger.error(`Failed to save onboarding data: ${upsertError.message}`, upsertError);
                throw new HttpException(
                    `Failed to save onboarding data: ${upsertError.message}`,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                );
            }

            this.logger.log(`[save] Onboarding data saved for user ${userId}`);

            // Sync biometrics to users.profile
            await this.usersService.updateProfile(userId, {
                birth_date: dto.birth_date,
                weight_kg: dto.weight,
                height_cm: dto.height,
            });

            // Mark onboarding as complete (unlocks user from onboarding screens)
            await this.usersService.markOnboardingComplete(userId);
            this.logger.log(`[save] Onboarding marked complete for user ${userId}`);

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
    async generatePlanFromOnboarding(
        @Headers('x-user-id') userId: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            // Check if user already has an active plan (idempotent)
            const existingPlan = await this.trainingService.getActivePlan(userId);
            if (existingPlan) {
                // If the previous generation failed, cancel it and re-trigger
                if (existingPlan.generation_status === 'failed') {
                    this.logger.log(`[generate] Previous plan ${existingPlan.id} failed, cancelling and re-generating`);
                    await this.supabaseService
                        .from('training_plans')
                        .update({ status: 'cancelled' })
                        .eq('id', existingPlan.id);
                    // Fall through to create a new plan below
                } else {
                    this.logger.log(`[generate] User ${userId} already has active plan ${existingPlan.id} (status: ${existingPlan.generation_status})`);
                    return {
                        plan_id: existingPlan.id,
                        generation_status: existingPlan.generation_status || 'complete',
                        already_exists: true,
                    };
                }
            }

            // Read saved onboarding data
            const { data: onboardingData, error: readError } = await this.supabaseService
                .from('user_onboarding')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (readError || !onboardingData) {
                this.logger.error(`No onboarding data found for user ${userId}`, readError);
                throw new HttpException(
                    'Onboarding data not found. Please complete the quiz first.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Reconstruct plan request from saved data
            const dto = onboardingData.responses_json || onboardingData;

            const result = await this.trainingService.createQuickPlan(userId, {
                goal: dto.goal || onboardingData.goal,
                level: dto.level || onboardingData.level,
                daysPerWeek: dto.days_per_week || onboardingData.days_per_week,
                currentPace5k: dto.current_pace_5k || onboardingData.current_pace_5k,
                targetWeeks: dto.target_weeks || onboardingData.target_weeks,
                limitations: dto.limitations || onboardingData.limitations,
                preferredDays: dto.preferred_days || onboardingData.preferred_days,
                startDate: dto.start_date || onboardingData.start_date,
            });

            this.logger.log(`[generate] Plan generated for user ${userId}, plan_id: ${result.plan_id}`);

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
     * Get plan generation status (for polling during background generation)
     */
    @Get('plan/:id/status')
    async getPlanStatus(
        @Headers('x-user-id') userId: string,
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
    async getActivePlan(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const plan = await this.trainingService.getActivePlan(userId);
        return { plan };
    }

    /**
     * Get workouts for calendar view
     */
    @Get('workouts')
    async getWorkouts(
        @Headers('x-user-id') userId: string,
        @Query('start_date') startDate: string,
        @Query('end_date') endDate: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const workouts = await this.trainingService.getWorkouts(userId, startDate, endDate);
        return { workouts };
    }

    /**
     * Get upcoming workouts
     */
    @Get('workouts/upcoming')
    async getUpcomingWorkouts(
        @Headers('x-user-id') userId: string,
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
        @Headers('x-user-id') userId: string,
        @Param('id') workoutId: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const workout = await this.trainingService.getWorkout(userId, workoutId);
        return { workout };
    }

    /**
     * Mark workout as skipped
     */
    @Put('workouts/:id/skip')
    async skipWorkout(
        @Headers('x-user-id') userId: string,
        @Param('id') workoutId: string,
        @Body() dto: SkipWorkoutDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const workout = await this.trainingService.skipWorkout(userId, workoutId, dto.reason);
        return { workout };
    }

    /**
     * Create a user-defined manual workout (source='manual').
     * Saved as a regular workout row so it appears on the calendar and can be tracked.
     */
    @Post('workouts/manual')
    async createManualWorkout(
        @Headers('x-user-id') userId: string,
        @Body() dto: CreateManualWorkoutDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const workout = await this.trainingService.createManualWorkout(userId, dto);
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
        @Headers('x-user-id') userId: string,
        @Body() dto: CompleteFreeWorkoutDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const workout = await this.trainingService.completeFreeWorkout(userId, dto);
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
        @Headers('x-user-id') userId: string,
        @Param('id') workoutId: string,
        @Body() dto: import('./dto/workout-tracking.dto').CreateWorkoutTrackingDto,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const workout = await this.trainingService.completeWorkout(userId, workoutId, dto);
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
        @Headers('x-user-id') userId: string,
        @Query('start_date') startDate: string,
        @Query('end_date') endDate: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        if (!startDate || !endDate) {
            throw new HttpException('start_date and end_date are required', HttpStatus.BAD_REQUEST);
        }

        try {
            const schedule = await this.trainingService.getScheduleWithStatus(userId, startDate, endDate);
            const nextWorkout = await this.trainingService.getNextWorkout(userId);
            const todayEntry = schedule.find(s => s.is_today);

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
    async getLatestRetrospective(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const retrospective = await this.retrospectiveService.getLatestRetrospective(userId);

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
    async hasReadyRetrospective(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const retrospective = await this.retrospectiveService.getLatestRetrospective(userId);

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
        @Headers('x-user-id') userId: string,
        @Param('id') retrospectiveId: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const result = await this.retrospectiveService.acceptSuggestion(userId, retrospectiveId);
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
        @Headers('x-user-id') userId: string,
        @Param('id') retrospectiveId: string,
        @Body() params: CustomizePlanDto
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            return await this.retrospectiveService.customizePlan(userId, retrospectiveId, params);
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
     * Used for recovery when cron job fails, and for debugging
     */
    @Post('retrospective/generate')
    async manuallyGenerateRetrospective(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        this.logger.log(`[Retrospective] Manual trigger requested for user ${userId}`);

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
                throw new HttpException('No active plan found for user', HttpStatus.NOT_FOUND);
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
            const retrospective = await this.retrospectiveService.generateRetrospective(
                userId,
                activePlan.id,
            );

            if (!retrospective) {
                throw new HttpException('Failed to generate retrospective', HttpStatus.INTERNAL_SERVER_ERROR);
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
    async resetRetrospective(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            // Delete all retrospectives for this user
            const { data: deletedRetros, error: retroError } = await this.supabaseService
                .from('plan_retrospectives')
                .delete()
                .eq('user_id', userId)
                .select('id');

            if (retroError) {
                this.logger.error('Failed to delete retrospectives:', retroError);
            }

            // Delete all notifications for this user
            const { data: deletedNotifs, error: notifError } = await this.supabaseService
                .from('notifications')
                .delete()
                .eq('user_id', userId)
                .select('id');

            if (notifError) {
                this.logger.error('Failed to delete notifications:', notifError);
            }

            // Reactivate all completed plans for this user
            const { data: updatedPlans, error: planError } = await this.supabaseService
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
            throw new HttpException('Failed to reset retrospective', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}


