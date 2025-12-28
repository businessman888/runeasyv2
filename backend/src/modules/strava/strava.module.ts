import { Module, forwardRef } from '@nestjs/common';
import { StravaService } from './strava.service';
import { StravaCacheService } from './strava-cache.service';
import { StravaAuthController } from './strava-auth.controller';
import { StravaWebhookController } from './strava-webhook.controller';
import { FeedbackModule } from '../feedback';
import { GamificationModule } from '../gamification';

@Module({
    imports: [
        forwardRef(() => FeedbackModule),
        GamificationModule,
        // Note: StravaQueueModule removed - Redis/BullMQ is optional
        // To enable rate limiting, add REDIS_HOST to .env and import StravaQueueModule
    ],
    controllers: [StravaAuthController, StravaWebhookController],
    providers: [StravaService, StravaCacheService],
    exports: [StravaService, StravaCacheService],
})
export class StravaModule { }
