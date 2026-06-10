import { Global, Module } from '@nestjs/common';
import { AIUsageService } from './ai-usage.service';
import { AIRouterService } from './ai-router.service';
import { AiQuotaService } from './ai-quota.service';

@Global()
@Module({
  providers: [AIUsageService, AIRouterService, AiQuotaService],
  exports: [AIUsageService, AIRouterService, AiQuotaService],
})
export class AIModule {}
