import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AI_MODELS,
  AITier,
  FALLBACK_MODEL,
  FEATURE_TIER_MAP,
  TIER_MODEL_MAP,
} from './ai.constants';
import { AICallOptions, AICallResult } from './ai.interfaces';
import { AIUsageService } from './ai-usage.service';

@Injectable()
export class AIRouterService {
  private readonly logger = new Logger(AIRouterService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private configService: ConfigService,
    private usageService: AIUsageService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    } else {
      this.logger.warn('[AIRouter] ANTHROPIC_API_KEY not configured — AI calls will fail');
    }
  }

  /** Whether the router has a valid API key and can make calls */
  get isAvailable(): boolean {
    return this.anthropic !== null;
  }

  /**
   * Central method for all AI calls. Handles model routing, logging, and fallback.
   */
  async call<T>(options: AICallOptions): Promise<AICallResult<T>> {
    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const tier = FEATURE_TIER_MAP[options.featureName];
    const model = options.model || TIER_MODEL_MAP[tier] || AI_MODELS.HAIKU_4_5;

    try {
      return await this.executeCall<T>(model, options, false);
    } catch (error) {
      // Fallback: if EFFICIENCY tier failed and fallback is enabled
      const shouldFallback =
        options.enableFallback !== false &&
        tier === AITier.EFFICIENCY &&
        model !== FALLBACK_MODEL;

      if (shouldFallback) {
        this.logger.warn(
          `[AIRouter] ${model} failed for ${options.featureName}, falling back to ${FALLBACK_MODEL}`,
        );
        return await this.executeCall<T>(FALLBACK_MODEL, options, true);
      }

      throw error;
    }
  }

  private async executeCall<T>(
    model: string,
    options: AICallOptions,
    isFallback: boolean,
  ): Promise<AICallResult<T>> {
    const startTime = Date.now();
    const params = this.buildParams(model, options);

    // Use streaming for large requests to avoid Anthropic SDK timeout guard
    // "Streaming is required for operations that may take longer than 10 minutes"
    const useStreaming = options.maxTokens > 8000;

    try {
      let message: Anthropic.Message;

      if (useStreaming) {
        this.logger.log(`[AIRouter] Using streaming for ${options.featureName} (maxTokens: ${options.maxTokens})`);
        const stream = this.anthropic!.messages.stream(params as any);
        message = await stream.finalMessage();
      } else {
        message = await this.anthropic!.messages.create(params as any) as Anthropic.Message;
      }

      const latencyMs = Date.now() - startTime;

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in AI response');
      }

      const data = this.extractJSON<T>(textBlock.text);

      const usage = {
        input_tokens: message.usage?.input_tokens || 0,
        output_tokens: message.usage?.output_tokens || 0,
        cache_creation_input_tokens: (message.usage as any)?.cache_creation_input_tokens || 0,
        cache_read_input_tokens: (message.usage as any)?.cache_read_input_tokens || 0,
      };

      const cost = this.usageService.calculateCost(model, usage);

      // Fire-and-forget logging
      this.usageService.log({
        userId: options.userId,
        featureName: options.featureName,
        modelName: model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        estimatedCostUsd: cost,
        latencyMs,
        success: true,
      });

      this.logger.log(
        `[AIRouter] ${options.featureName} via ${model} in ${latencyMs}ms ` +
        `(in:${usage.input_tokens} out:${usage.output_tokens} cost:$${cost.toFixed(6)})`,
      );

      return { data, usage, model, latencyMs, wasFallback: isFallback };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // Log failure (fire-and-forget)
      this.usageService.log({
        userId: options.userId,
        featureName: options.featureName,
        modelName: model,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        success: false,
        errorMessage: error?.message?.substring(0, 500),
      });

      throw error;
    }
  }

  private buildParams(model: string, options: AICallOptions): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model,
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userMessage }],
    };

    // Sonnet 4.6: add thinking (disabled) + output_config for high effort
    if (model === AI_MODELS.SONNET_4_6) {
      params.thinking = { type: 'disabled' };
      params.output_config = { effort: 'high' };
    }

    return params;
  }

  /**
   * Extract JSON from AI response text (handles markdown code blocks)
   */
  private extractJSON<T>(text: string): T {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned) as T;
  }
}
