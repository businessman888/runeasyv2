import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../../database';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { UserIdThrottlerGuard } from './user-id-throttler.guard';

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: 10, ttl: 3_600_000 }],
    }),
  ],
  controllers: [ReferralController],
  providers: [ReferralService, UserIdThrottlerGuard],
  exports: [ReferralService],
})
export class ReferralModule {}
