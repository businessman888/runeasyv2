import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Database
import { DatabaseModule } from './database';

// Feature Modules
import { StravaModule } from './modules/strava';
import { TrainingModule } from './modules/training';
import { GamificationModule } from './modules/gamification';
import { FeedbackModule } from './modules/feedback';
import { NotificationModule } from './modules/notifications';
import { StatsModule } from './modules/stats';
import { UsersModule } from './modules/users';
import { ReadinessModule } from './modules/readiness';
import { OnboardingModule } from './modules/onboarding';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    DatabaseModule,

    // Feature Modules (Redis/BullMQ loads conditionally in StravaModule)
    StravaModule,
    TrainingModule,
    GamificationModule,
    FeedbackModule,
    NotificationModule,
    StatsModule,
    UsersModule,
    ReadinessModule,
    OnboardingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

