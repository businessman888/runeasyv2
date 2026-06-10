import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';

// Database
import { DatabaseModule } from './database';

// AI (Global)
import { AIModule } from './common/ai';

// Encryption (Global)
import { EncryptionModule } from './common/encryption';

// Pace Calculator (Global)
import { PaceCalculatorModule } from './common/pace-calculator';

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
import { SharingModule } from './modules/sharing';
import { DevicesModule } from './modules/devices';
import { AuthModule } from './modules/auth';
import { SubscriptionModule } from './modules/subscription';
import { ReferralModule } from './modules/referral';
import { ElevationModule } from './modules/elevation';
import { RacesModule } from './modules/races';

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
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        // Resilience defaults applied to every queue: retry transient failures
        // with exponential backoff so one failed job never gets silently lost,
        // and cap retained jobs so Redis memory stays bounded over time.
        const defaultJobOptions = {
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        };

        if (redisUrl) {
          try {
            const url = new URL(redisUrl);
            return {
              connection: {
                host: url.hostname,
                port: parseInt(url.port, 10) || 6379,
                username: url.username || undefined,
                password: url.password || undefined,
                tls: redisUrl.startsWith('rediss://')
                  ? { rejectUnauthorized: false }
                  : undefined,
              },
              defaultJobOptions,
            };
          } catch (error) {
            console.error('[BullMQ] Failed to parse REDIS_URL:', error);
          }
        }

        // Fallback for local development
        return {
          connection: {
            host: '127.0.0.1',
            port: 6379,
          },
          defaultJobOptions,
        };
      },
      inject: [ConfigService],
    }),

    // Global rate limiting: 100 requests / minute per IP (or per user where a
    // custom tracker overrides it). Auth and AI-generation endpoints apply
    // stricter @Throttle() limits on top of this.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Database
    DatabaseModule,

    // AI (Global — available to all modules)
    AIModule,

    // Encryption (Global — available to all modules)
    EncryptionModule,

    // Pace Calculator (Global — Daniels VDOT, training paces)
    PaceCalculatorModule,

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
    SharingModule,
    DevicesModule,
    AuthModule,
    SubscriptionModule,
    ReferralModule,
    ElevationModule,
    RacesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Rate limiting runs first so abusive traffic is rejected before auth.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global authentication: every route requires a valid Supabase Bearer
    // token unless explicitly marked @Public(). Derives request.user from the
    // validated token — controllers must read the user via @User('id'), never
    // from the client-supplied x-user-id header.
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class AppModule {}
