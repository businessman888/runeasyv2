import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { RankingController } from './ranking.controller';
import { NotificationModule } from '../notifications';

@Module({
    imports: [NotificationModule],
    controllers: [GamificationController, RankingController],
    providers: [GamificationService],
    exports: [GamificationService],
})
export class GamificationModule { }

