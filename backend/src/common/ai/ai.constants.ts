// Model identifiers
export const AI_MODELS = {
  SONNET_4_6: 'claude-sonnet-4-6',
  HAIKU_4_5: 'claude-haiku-4-5-20251001',
} as const;

// Feature names for logging
export const AI_FEATURES = {
  PLAN_GENERATION_FIRST: 'plan_generation_first_workout',
  PLAN_GENERATION_REMAINING: 'plan_generation_remaining',
  PLAN_GENERATION_LEGACY: 'plan_generation_legacy', // Now the primary method (single prompt)
  PLAN_GENERATION_FULL: 'plan_generation_full', // Alias for clarity
  FEEDBACK: 'feedback',
  READINESS: 'readiness',
  RETROSPECTIVE: 'retrospective',
} as const;

// Tier definitions
export enum AITier {
  HIGH_PERFORMANCE = 'HIGH_PERFORMANCE',
  EFFICIENCY = 'EFFICIENCY',
}

// Feature-to-tier mapping
export const FEATURE_TIER_MAP: Record<string, AITier> = {
  [AI_FEATURES.PLAN_GENERATION_FIRST]: AITier.HIGH_PERFORMANCE,
  [AI_FEATURES.PLAN_GENERATION_REMAINING]: AITier.HIGH_PERFORMANCE,
  [AI_FEATURES.PLAN_GENERATION_LEGACY]: AITier.HIGH_PERFORMANCE,
  [AI_FEATURES.PLAN_GENERATION_FULL]: AITier.HIGH_PERFORMANCE,
  [AI_FEATURES.RETROSPECTIVE]: AITier.HIGH_PERFORMANCE,
  [AI_FEATURES.FEEDBACK]: AITier.EFFICIENCY,
  [AI_FEATURES.READINESS]: AITier.EFFICIENCY,
};

// Tier-to-model mapping
export const TIER_MODEL_MAP: Record<AITier, string> = {
  [AITier.HIGH_PERFORMANCE]: AI_MODELS.SONNET_4_6,
  [AITier.EFFICIENCY]: AI_MODELS.HAIKU_4_5,
};

// Fallback model when EFFICIENCY tier fails
export const FALLBACK_MODEL = AI_MODELS.SONNET_4_6;

// Pricing per million tokens (USD) — verify against https://www.anthropic.com/pricing
export const MODEL_PRICING: Record<string, {
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
}> = {
  [AI_MODELS.SONNET_4_6]: {
    input: 3.00,
    output: 15.00,
    cache_write: 3.75,
    cache_read: 0.30,
  },
  [AI_MODELS.HAIKU_4_5]: {
    input: 0.80,
    output: 4.00,
    cache_write: 1.00,
    cache_read: 0.08,
  },
};
