import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { User } from '../../common/decorators';
import { FeedbackAIService } from './feedback-ai.service';

@Controller('feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly feedbackAIService: FeedbackAIService) {}

  /**
   * (Re)generate feedback for a completed workout. Marks the feedback row as
   * 'processing' and enqueues the async BullMQ job (same path as automatic
   * post-completion generation). This backs the coach card's "Tentar
   * novamente" retry: it returns immediately with status 'processing' and the
   * card self-heals once the worker finishes.
   */
  @Post('generate')
  async generateFeedback(
    @User('id') userId: string,
    @Body() dto: { workoutId: string; activityId: string },
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    if (!dto?.workoutId || !dto?.activityId) {
      throw new HttpException(
        'workoutId and activityId are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.feedbackAIService.enqueueGeneration(
        userId,
        dto.workoutId,
        dto.activityId,
      );
      return { success: true, status: 'processing' };
    } catch (error) {
      this.logger.error('Failed to enqueue feedback generation', error);
      throw new HttpException(
        'Failed to generate feedback',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resolve the feedback lifecycle for a workout/activity. Polled by the
   * post-workout processing screen to decide when to route to CoachAnalysis,
   * and by the home card to render processing/failed/skipped states.
   */
  @Get('status')
  async getFeedbackStatus(
    @User('id') userId: string,
    @Query('workoutId') workoutId?: string,
    @Query('activityId') activityId?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    if (!workoutId && !activityId) {
      throw new HttpException(
        'workoutId or activityId is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.feedbackAIService.getFeedbackStatus(userId, {
      workoutId,
      activityId,
    });
  }

  /**
   * Get feedback history for the user
   */
  @Get('history')
  async getFeedbackHistory(
    @User('id') userId: string,
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
    @User('id') userId: string,
    @Param('id') feedbackId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const feedback = await this.feedbackAIService.getFeedback(
      userId,
      feedbackId,
    );

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
    @User('id') userId: string,
    @Param('id') feedbackId: string,
    @Body() dto: { rating: number },
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    if (dto.rating < 1 || dto.rating > 5) {
      throw new HttpException(
        'Rating must be between 1 and 5',
        HttpStatus.BAD_REQUEST,
      );
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
  async getLatestFeedback(@User('id') userId: string) {
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
  async getLatestActivityWithFeedback(
    @User('id') userId: string,
    @Query('source') source?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    // Only 'plan' and 'activity' filter; anything else falls back to the
    // legacy "most recent activity overall" behaviour.
    const scope =
      source === 'plan' || source === 'activity' ? source : undefined;

    const result = await this.feedbackAIService.getLatestActivityWithFeedback(
      userId,
      scope,
    );
    return result;
  }

  /**
   * Get workout history with feedback status for Training History screen
   */
  @Get('workouts/history')
  async getWorkoutHistory(
    @User('id') userId: string,
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
