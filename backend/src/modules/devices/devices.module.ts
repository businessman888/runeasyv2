import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DevicesController } from './devices.controller';
import { OAuthController } from './oauth.controller';
import { GoogleHealthWebhookController } from './google-health-webhook.controller';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ActivitySyncProcessor } from './activity-sync.processor';
import { TokenRefreshService } from './token-refresh.service';
import { OAuthStateStore } from './oauth-state.store';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';
import { GoogleHealthSubscriptionsService } from './providers/google-health-subscriptions.service';
import { GoogleHealthOAuthService } from './providers/google-health-oauth.service';
import { AppleHealthNormalizer } from './providers/apple-health.normalizer';
import { HealthConnectNormalizer } from './providers/health-connect.normalizer';
import { GoogleHealthApiClient } from './providers/google-health-api.client';
import { GoogleHealthNormalizer } from './providers/google-health.normalizer';
import { GoogleHealthSyncProcessor } from './google-health-sync.processor';
import {
  GOOGLE_HEALTH_KEYSET_FETCHER,
  GoogleHealthSignatureVerifier,
  defaultGoogleHealthKeysetFetcher,
} from './providers/google-health-signature.verifier';
import { GOOGLE_HEALTH_SYNC_QUEUE } from './providers/google-health-webhook.types';
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
    // Fila do Google Health, separada da `activity-sync-queue` de propósito: o
    // `ActivitySyncProcessor` ainda despacha por job name de Fitbit/Polar, e
    // uma fila própria é revertível sozinha.
    //
    // O PRODUTOR é o webhook (Commit B); o CONSUMIDOR é o
    // `GoogleHealthSyncProcessor` (Commit D). O backlog que se acumulou entre
    // os dois deploys é drenado assim que este processor sobe — nada foi
    // descartado, que era o objetivo.
    BullModule.registerQueue({ name: GOOGLE_HEALTH_SYNC_QUEUE }),
    forwardRef(() => TrainingModule),
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [
    DevicesController,
    OAuthController,
    GoogleHealthWebhookController,
  ],
  providers: [
    DevicesService,
    ActivitySyncService,
    ActivitySyncProcessor,
    TokenRefreshService,
    OAuthStateStore,
    FitbitOAuthService,
    PolarOAuthService,
    GoogleHealthOAuthService,
    GoogleHealthSubscriptionsService,
    AppleHealthNormalizer,
    HealthConnectNormalizer,
    GoogleHealthApiClient,
    GoogleHealthNormalizer,
    GoogleHealthSyncProcessor,
    GoogleHealthSignatureVerifier,
    // O fetcher do keyset entra por token para que o teste injete um par de
    // chaves local e a suíte de assinatura rode sem rede.
    {
      provide: GOOGLE_HEALTH_KEYSET_FETCHER,
      useValue: defaultGoogleHealthKeysetFetcher,
    },
  ],
  exports: [DevicesService, ActivitySyncService, TokenRefreshService],
})
export class DevicesModule {}
