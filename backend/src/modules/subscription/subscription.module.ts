import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { RevenueCatWebhookService } from './revenuecat-webhook.service';
import { DatabaseModule } from '../../database';
import { TrainingModule } from '../training';

@Module({
  imports: [DatabaseModule, TrainingModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, RevenueCatWebhookService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
