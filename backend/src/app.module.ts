import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Database
import { DatabaseModule } from './database';

// Feature Modules
import { TrainingModule } from './modules/training';
import { GamificationModule } from './modules/gamification';
import { FeedbackModule } from './modules/feedback';
import { NotificationModule } from './modules/notifications';
import { StatsModule } from './modules/stats';
import { UsersModule } from './modules/users';
import { ReadinessModule } from './modules/readiness';
import { OnboardingModule } from './modules/onboarding';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Redis / BullMQ Setup global
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
      }),
      inject: [ConfigService],
    }),

    // Database
    DatabaseModule,

    // Feature Modules
    TrainingModule,
    GamificationModule,
    FeedbackModule,
    NotificationModule,
    StatsModule,
    UsersModule,
    ReadinessModule,
    OnboardingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
