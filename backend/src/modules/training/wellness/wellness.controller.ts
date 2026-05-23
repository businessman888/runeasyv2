import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WellnessService } from './wellness.service';
import { WellnessSummaryResponseDto } from './dto/wellness-summary.dto';

@Controller('training')
export class WellnessController {
  private readonly logger = new Logger(WellnessController.name);

  constructor(private readonly wellnessService: WellnessService) {}

  /**
   * GET /training/wellness-summary
   *
   * Single-request aggregator for the mobile Wellness dashboard.
   * Returns readiness, weekly performance vs previous week, health (HealthKit),
   * training zones distribution, 8-week evolution series and current/longest streak.
   */
  @Get('wellness-summary')
  async getWellnessSummary(
    @Headers('x-user-id') userId: string,
  ): Promise<WellnessSummaryResponseDto> {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      return await this.wellnessService.getSummary(userId);
    } catch (error: any) {
      this.logger.error(
        `Failed to build wellness summary for user ${userId}: ${error?.message}`,
        error?.stack,
      );
      throw new HttpException(
        error?.message || 'Failed to load wellness summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
