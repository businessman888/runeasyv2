import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { TrainingAIService } from './training-ai.service';
import { TrainingController } from './training.controller';
import { TrainingSchedulerService } from './training-scheduler.service';
import { RetrospectiveService } from './retrospective.service';
import { WellnessController } from './wellness/wellness.controller';
import { WellnessService } from './wellness/wellness.service';
import { NotificationModule } from '../notifications';
import { UsersModule } from '../users/users.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { StatsModule } from '../stats/stats.module';
import { SubscriptionModule } from '../subscription/subscription.module';

/**
 * SubscriptionModule is wrapped in forwardRef because SubscriptionModule
 * already imports TrainingModule (it uses TrainingService inside the
 * RevenueCat webhook pipeline). The cycle is intentional and NestJS resolves
 * it cleanly when both ends use forwardRef.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificationModule,
    UsersModule,
    GamificationModule,
    ReadinessModule,
    StatsModule,
    forwardRef(() => SubscriptionModule),
    BullModule.registerQueue({
      name: 'feedback-queue',
    }),
  ],
  controllers: [TrainingController, WellnessController],
  providers: [
    TrainingService,
    TrainingAIService,
    TrainingSchedulerService,
    RetrospectiveService,
    WellnessService,
  ],
  exports: [TrainingService, TrainingAIService, RetrospectiveService],
})
export class TrainingModule {}
