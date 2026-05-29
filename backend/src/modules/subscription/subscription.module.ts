import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { DatabaseModule } from '../../database';
import { TrainingModule } from '../training';
import { ReferralModule } from '../referral';

/**
 * TrainingModule is wrapped in forwardRef because TrainingService now depends
 * on SubscriptionService (Pro gate in completeWorkout — defense in depth
 * against payload manipulation and stale offline-queue payloads from users
 * who downgraded from Pro). The two modules form a cycle, but NestJS resolves
 * it cleanly as long as both ends use forwardRef.
 */
@Module({
  imports: [DatabaseModule, forwardRef(() => TrainingModule), ReferralModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, RevenueCatWebhookService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
