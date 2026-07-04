import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { User } from '../../common/decorators';
import { StatsService } from './stats.service';
import { PeriodSummaryQueryDto } from './dto/period-summary-query.dto';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * Get weekly statistics
   */
  @Get('weekly')
  async getWeeklyStats(
    @User('id') userId: string,
    @Query('weeks') weeks?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const data = await this.statsService.getWeeklyStats(
      userId,
      weeks ? parseInt(weeks, 10) : 12,
    );

    return { stats: data };
  }

  /**
   * Get monthly statistics
   */
  @Get('monthly')
  async getMonthlyStats(
    @User('id') userId: string,
    @Query('months') months?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const data = await this.statsService.getMonthlyStats(
      userId,
      months ? parseInt(months, 10) : 6,
    );

    return { stats: data };
  }

  /**
   * Get pace progression for charts
   */
  @Get('pace-progression')
  async getPaceProgression(
    @User('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const data = await this.statsService.getPaceProgression(
      userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return { progression: data };
  }

  /**
   * Get summary statistics
   */
  @Get('summary')
  async getSummaryStats(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const data = await this.statsService.getSummaryStats(userId);

    return { summary: data };
  }

  /**
   * Period-scoped summary (Distância/Tempo/Freq + chart breakdown) for the
   * Calendar stats card. Scoped by period (week/month) and scope
   * (activities = executed, workouts = planned). Returns the payload directly.
   */
  @Get('period-summary')
  async getPeriodSummary(
    @User('id') userId: string,
    @Query() query: PeriodSummaryQueryDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    return this.statsService.getPeriodSummary(userId, query);
  }
}
