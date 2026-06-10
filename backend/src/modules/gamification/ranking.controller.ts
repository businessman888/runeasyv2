import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { User } from '../../common/decorators';
import { GamificationService } from './gamification.service';

@Controller('ranking')
export class RankingController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('global')
  async getGlobalRanking(
    @User('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    return this.gamificationService.getGlobalRanking(
      userId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('cohort')
  async getCohortRanking(
    @User('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    return this.gamificationService.getCohortRanking(
      userId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
