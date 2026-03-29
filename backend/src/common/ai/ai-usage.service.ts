import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { MODEL_PRICING } from './ai.constants';
import { UsageLogEntry } from './ai.interfaces';

@Injectable()
export class AIUsageService {
  private readonly logger = new Logger(AIUsageService.name);

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Calculate estimated cost in USD from token counts and model pricing
   */
  calculateCost(
    model: string,
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    },
  ): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;

    const cost =
      (usage.input_tokens / 1_000_000) * pricing.input +
      (usage.output_tokens / 1_000_000) * pricing.output +
      (usage.cache_creation_input_tokens / 1_000_000) * pricing.cache_write +
      (usage.cache_read_input_tokens / 1_000_000) * pricing.cache_read;

    return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
  }

  /**
   * Log AI usage to ai_usage_logs table (fire-and-forget, never throws)
   */
  async log(entry: UsageLogEntry): Promise<void> {
    try {
      const { error } = await this.supabaseService.from('ai_usage_logs').insert({
        user_id: entry.userId || null,
        feature_name: entry.featureName,
        model_name: entry.modelName,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cache_creation_tokens: entry.cacheCreationTokens,
        cache_read_tokens: entry.cacheReadTokens,
        estimated_cost_usd: entry.estimatedCostUsd,
        latency_ms: entry.latencyMs,
        success: entry.success,
        error_message: entry.errorMessage || null,
      });

      if (error) {
        this.logger.warn(`[AIUsage] Failed to log usage: ${error.message}`);
      }
    } catch (err: any) {
      this.logger.warn(`[AIUsage] Failed to log usage (non-blocking): ${err?.message}`);
    }
  }
}
