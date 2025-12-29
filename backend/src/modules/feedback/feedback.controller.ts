import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Query,
    Headers,
    Body,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { FeedbackAIService } from './feedback-ai.service';

@Controller('feedback')
export class FeedbackController {
    private readonly logger = new Logger(FeedbackController.name);

    constructor(private readonly feedbackAIService: FeedbackAIService) { }

    /**
     * Generate feedback for a completed workout
     * Usually called automatically after activity sync
     */
    @Post('generate')
    async generateFeedback(
        @Headers('x-user-id') userId: string,
        @Body() dto: { workoutId: string; activityId: string },
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        try {
            const feedback = await this.feedbackAIService.generateFeedback(
                userId,
                dto.workoutId,
                dto.activityId,
            );

            return {
                success: true,
                feedback,
            };
        } catch (error) {
            this.logger.error('Failed to generate feedback', error);
            throw new HttpException(
                'Failed to generate feedback',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get feedback history for the user
     */
    @Get('history')
    async getFeedbackHistory(
        @Headers('x-user-id') userId: string,
        @Query('limit') limit?: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const history = await this.feedbackAIService.getFeedbackHistory(
            userId,
            limit ? parseInt(limit, 10) : 10,
        );

        return { feedbacks: history };
    }

    /**
     * Get a specific feedback by ID
     */
    @Get(':id')
    async getFeedback(
        @Headers('x-user-id') userId: string,
        @Param('id') feedbackId: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const feedback = await this.feedbackAIService.getFeedback(userId, feedbackId);

        if (!feedback) {
            throw new HttpException('Feedback not found', HttpStatus.NOT_FOUND);
        }

        return { feedback };
    }

    /**
     * Rate a feedback (for improving AI quality)
     */
    @Put(':id/rate')
    async rateFeedback(
        @Headers('x-user-id') userId: string,
        @Param('id') feedbackId: string,
        @Body() dto: { rating: number },
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        if (dto.rating < 1 || dto.rating > 5) {
            throw new HttpException('Rating must be between 1 and 5', HttpStatus.BAD_REQUEST);
        }

        const feedback = await this.feedbackAIService.rateFeedback(
            userId,
            feedbackId,
            dto.rating,
        );

        return { success: true, feedback };
    }

    /**
     * Get latest feedback for display in home screen
     */
    @Get('latest/summary')
    async getLatestFeedback(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const history = await this.feedbackAIService.getFeedbackHistory(userId, 1);

        if (history.length === 0) {
            return { feedback: null };
        }

        const latest = history[0];

        return {
            feedback: {
                id: latest.id,
                hero_message: latest.hero_message,
                hero_tone: latest.hero_tone,
                workout_type: latest.workouts?.type,
                workout_date: latest.workouts?.scheduled_date,
                created_at: latest.created_at,
            },
        };
    }

    /**
     * Get latest activity with feedback for home screen AI card
     */
    @Get('latest/activity')
    async getLatestActivityWithFeedback(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const result = await this.feedbackAIService.getLatestActivityWithFeedback(userId);
        return result;
    }

    /**
     * Get workout history with feedback status for Training History screen
     */
    @Get('workouts/history')
    async getWorkoutHistory(
        @Headers('x-user-id') userId: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const parsedLimit = limit ? parseInt(limit, 10) : 20;
        const parsedOffset = offset ? parseInt(offset, 10) : 0;

        const history = await this.feedbackAIService.getWorkoutHistory(
            userId,
            parsedLimit,
            parsedOffset,
        );

        return history;
    }
}
