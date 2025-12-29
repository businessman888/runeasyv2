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
    constructor(private readonly gamificationService: GamificationService) { }

    /**
     * Get user's gamification stats (level, points, streak)
     */
    @Get('stats')
    async getStats(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const stats = await this.gamificationService.getUserStats(userId);

        if (!stats) {
            return {
                current_level: 1,
                total_points: 0,
                current_streak: 0,
                best_streak: 0,
                points_to_next_level: this.gamificationService.getPointsForNextLevel(1, 0),
            };
        }

        const pointsToNextLevel = this.gamificationService.getPointsForNextLevel(stats.current_level, stats.total_points);

        return {
            ...stats,
            points_to_next_level: pointsToNextLevel,
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
