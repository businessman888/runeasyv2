import {
    Controller,
    Get,
    Post,
    Put,
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
import { SupabaseService } from '../../database';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';

interface CreatePlanDto {
    goal: string;
    level: string;
    days_per_week: number;
    current_pace_5k: number | null;
    target_weeks: number;
    limitations: string | null;
    preferred_days: number[];
}

interface SkipWorkoutDto {
    reason: string;
}

@Controller('training')
export class TrainingController {
    private readonly logger = new Logger(TrainingController.name);

    constructor(
        private readonly trainingService: TrainingService,
        private readonly supabaseService: SupabaseService,
    ) { }

    /**
     * Save onboarding data and create training plan (FAST - uses Prompt Chaining)
     * Note: Auth via x-user-id header (set during Strava OAuth callback)
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
            // Save onboarding data
            await this.supabaseService.from('user_onboarding').upsert({
                user_id: userId,
                goal: dto.goal,
                level: dto.level,
                days_per_week: dto.days_per_week,
                current_pace_5k: dto.current_pace_5k,
                target_weeks: dto.target_weeks,
                has_limitations: !!dto.limitations,
                limitations: dto.limitations,
                preferred_days: dto.preferred_days,
                completed_at: new Date().toISOString(),
                responses_json: dto,
            });

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
            throw new HttpException(
                error.message || 'Failed to create plan',
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
}

