export interface AICallOptions {
  /** Feature name from AI_FEATURES constant — used for tier routing and logging */
  featureName: string;
  /** User ID for per-user usage tracking */
  userId?: string;
  /** System prompt — string or structured blocks with cache_control */
  systemPrompt: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  /** User message content */
  userMessage: string;
  /** Maximum output tokens */
  maxTokens: number;
  /** Override auto-routed model (bypasses tier mapping) */
  model?: string;
  /** Enable fallback to Sonnet if Haiku fails (default: true for EFFICIENCY tier) */
  enableFallback?: boolean;
}

export interface AICallResult<T = unknown> {
  /** Parsed JSON response data */
  data: T;
  /** Token usage from the API response */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  /** Actual model used (may differ from requested if fallback triggered) */
  model: string;
  /** Round-trip latency in milliseconds */
  latencyMs: number;
  /** Whether the fallback model was used */
  wasFallback: boolean;
}

export interface UsageLogEntry {
  userId?: string;
  featureName: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}
