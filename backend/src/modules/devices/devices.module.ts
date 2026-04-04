import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DevicesController } from './devices.controller';
import { OAuthController } from './oauth.controller';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ActivitySyncProcessor } from './activity-sync.processor';
import { TokenRefreshService } from './token-refresh.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';

@Module({
    imports: [
        BullModule.registerQueue({ name: 'activity-sync-queue' }),
    ],
    controllers: [DevicesController, OAuthController],
    providers: [
        DevicesService,
        ActivitySyncService,
        ActivitySyncProcessor,
        TokenRefreshService,
        FitbitOAuthService,
        PolarOAuthService,
    ],
    exports: [DevicesService, ActivitySyncService, TokenRefreshService],
})
export class DevicesModule {}
