import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { TrainingAIService } from './training-ai.service';
import { TrainingController } from './training.controller';
import { TrainingSchedulerService } from './training-scheduler.service';
import { RetrospectiveService } from './retrospective.service';
import { WeeklyInsightService } from './weekly-insight.service';
import { WellnessController } from './wellness/wellness.controller';
import { WellnessService } from './wellness/wellness.service';
import { NotificationModule } from '../notifications';
import { UsersModule } from '../users/users.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { StatsModule } from '../stats/stats.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FeedbackModule } from '../feedback/feedback.module';

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
    // forwardRef: defensive against transitive module cycles through
    // Notification/Gamification. TrainingService injects FeedbackAIService to
    // drive the ai_feedbacks lifecycle (processing/skipped) at completion.
    forwardRef(() => FeedbackModule),
    BullModule.registerQueue({
      name: 'feedback-queue',
    }),
    BullModule.registerQueue({
      name: 'elevation-queue',
    }),
  ],
  controllers: [TrainingController, WellnessController],
  providers: [
    TrainingService,
    TrainingAIService,
    TrainingSchedulerService,
    RetrospectiveService,
    WeeklyInsightService,
    WellnessService,
  ],
  exports: [
    TrainingService,
    TrainingAIService,
    RetrospectiveService,
    WeeklyInsightService,
  ],
})
export class TrainingModule {}
