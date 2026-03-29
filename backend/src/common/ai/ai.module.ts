import { Global, Module } from '@nestjs/common';
import { AIUsageService } from './ai-usage.service';
import { AIRouterService } from './ai-router.service';

@Global()
@Module({
  providers: [AIUsageService, AIRouterService],
  exports: [AIUsageService, AIRouterService],
})
export class AIModule {}
