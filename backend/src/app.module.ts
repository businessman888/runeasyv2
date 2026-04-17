import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Database
import { DatabaseModule } from './database';

// AI (Global)
import { AIModule } from './common/ai';

// Encryption (Global)
import { EncryptionModule } from './common/encryption';

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
        
        if (redisUrl) {
          try {
            const url = new URL(redisUrl);
            return {
              connection: {
                host: url.hostname,
                port: parseInt(url.port, 10) || 6379,
                username: url.username || undefined,
                password: url.password || undefined,
                tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
              },
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
        };
      },
      inject: [ConfigService],
    }),

    // Database
    DatabaseModule,

    // AI (Global — available to all modules)
    AIModule,

    // Encryption (Global — available to all modules)
    EncryptionModule,

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
