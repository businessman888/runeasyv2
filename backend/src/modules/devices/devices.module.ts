import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DevicesController } from './devices.controller';
import { OAuthController } from './oauth.controller';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ActivitySyncProcessor } from './activity-sync.processor';
import { TokenRefreshService } from './token-refresh.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';
import { AppleHealthNormalizer } from './providers/apple-health.normalizer';
import { HealthConnectNormalizer } from './providers/health-connect.normalizer';
import { TrainingModule } from '../training/training.module';
import { SubscriptionModule } from '../subscription/subscription.module';

/**
 * `forwardRef` on TrainingModule + SubscriptionModule guards against the
 * diamond dependency: SubscriptionModule itself imports TrainingModule, so
 * if either side's metadata isn't ready yet at boot, NestJS would fail with
 * "Nest can't resolve dependencies" — forwardRef defers the resolution and
 * makes the cycle safe to load.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'activity-sync-queue' }),
    forwardRef(() => TrainingModule),
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [DevicesController, OAuthController],
  providers: [
    DevicesService,
    ActivitySyncService,
    ActivitySyncProcessor,
    TokenRefreshService,
    FitbitOAuthService,
    PolarOAuthService,
    AppleHealthNormalizer,
    HealthConnectNormalizer,
  ],
  exports: [DevicesService, ActivitySyncService, TokenRefreshService],
})
export class DevicesModule {}
