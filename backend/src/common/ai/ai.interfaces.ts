export interface AICallOptions {
  /** Feature name from AI_FEATURES constant — used for tier routing and logging */
  featureName: string;
  /** User ID for per-user usage tracking */
  userId?: string;
  /** System prompt — string or structured blocks with cache_control */
  systemPrompt:
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }>;
  /** User message content */
  userMessage: string;
  /** Maximum output tokens */
  maxTokens: number;
  /** Override auto-routed model (bypasses tier mapping) */
  model?: string;
  /** Enable fallback to Sonnet if Haiku fails (default: true for EFFICIENCY tier) */
  enableFallback?: boolean;
  /**
   * Timeout (ms) desta requisição, sobrescreve o default do SDK (10 min). Usar
   * em gerações longas (plano completo ~7 min) pra não serem cortadas perto do
   * teto de 10 min. Aplicado por-requisição, não muda o cliente global.
   */
  timeoutMs?: number;
  /**
   * maxRetries desta requisição, sobrescreve o default do SDK (2). Na geração de
   * plano usamos 1 (não 2): o SDK reperga o transitório barato uma vez (429 é no
   * início da requisição) e a Etapa 3 (retry no training.service, cataloga rede
   * também) cobre o resto, limitando o encadeamento SDK×Etapa3. Outras chamadas
   * mantêm o default.
   */
  maxRetries?: number;
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
