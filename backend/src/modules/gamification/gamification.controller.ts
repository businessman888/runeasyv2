import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { GamificationService } from './gamification.service';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  /**
   * Get user's gamification stats (level, points, streak)
   */
  @Get('stats')
  async getStats(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const stats = await this.gamificationService.getUserStats(userId);
    const level = stats?.current_level || 1;
    const totalPoints = stats?.total_points || 0;

    const pointsForNextLevel = 1000 + (level - 1) * 100;
    const pointsToNextLevel = this.gamificationService.getPointsForNextLevel(
      level,
      totalPoints,
    );
    const pointsInCurrentLevel = pointsForNextLevel - pointsToNextLevel;
    const progressPct =
      pointsForNextLevel > 0
        ? Math.max(
            0,
            Math.min(100, (pointsInCurrentLevel / pointsForNextLevel) * 100),
          )
        : 0;

    if (!stats) {
      return {
        current_level: 1,
        total_points: 0,
        current_streak: 0,
        best_streak: 0,
        points_to_next_level: pointsToNextLevel,
        points_in_current_level: 0,
        points_for_next_level: pointsForNextLevel,
        progress_pct: 0,
      };
    }

    return {
      ...stats,
      points_to_next_level: pointsToNextLevel,
      points_in_current_level: pointsInCurrentLevel,
      points_for_next_level: pointsForNextLevel,
      progress_pct: progressPct,
    };
  }

  /**
   * Get all badges with user's earned status
   */
  @Get('badges')
  async getBadges(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const badges = await this.gamificationService.getBadges(userId);

    return {
      badges,
      earned_count: badges.filter((b) => b.earned).length,
      total_count: badges.length,
    };
  }

  /**
   * Get user's points history
   */
  @Get('points/history')
  async getPointsHistory(
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    const history = await this.gamificationService.getPointsHistory(
      userId,
      limit ? parseInt(limit, 10) : 50,
    );

    return { history };
  }
}
