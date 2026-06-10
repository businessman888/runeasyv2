import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { AI_FEATURES } from './ai.constants';

export type AiQuotaCategory = 'feedback' | 'plan';

// Daily caps for Free users. Pro users are unlimited.
const FREE_DAILY_LIMITS: Record<AiQuotaCategory, number> = {
  feedback: 10,
  plan: 2,
};

// feature_name values counted per category. For plans we count only the
// "initiating" generations (not the REMAINING background continuation), so a
// single plan generation counts once even though it logs multiple rows.
const CATEGORY_FEATURES: Record<AiQuotaCategory, string[]> = {
  feedback: [AI_FEATURES.FEEDBACK],
  plan: [
    AI_FEATURES.PLAN_GENERATION_FIRST,
    AI_FEATURES.PLAN_GENERATION_LEGACY,
    AI_FEATURES.PLAN_GENERATION_FULL,
  ],
};

const SAO_PAULO_OFFSET_HOURS = -3;

/**
 * Enforces a per-user daily ceiling on expensive AI generations, protecting
 * against runaway Claude API cost. Counts completed generations logged in
 * `ai_usage_logs` for the current day (São Paulo time). Pro subscribers are
 * exempt. Reuses the existing usage-logging infrastructure — no extra table.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Throws HTTP 429 if the user has reached their daily limit for `category`.
   * Use for explicit user-triggered generations (e.g. plan creation) where a
   * clear error is the right response.
   */
  async assertWithinLimit(
    userId: string,
    category: AiQuotaCategory,
  ): Promise<void> {
    const ok = await this.isWithinLimit(userId, category);
    if (!ok) {
      const limit = FREE_DAILY_LIMITS[category];
      throw new HttpException(
        `Limite diário de IA atingido (${limit} ${category === 'plan' ? 'gerações de plano' : 'feedbacks'} por dia no plano gratuito). Assine o RunEasy Pro para uso ilimitado.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Non-throwing check. Returns true when the user may proceed. Use for
   * fire-and-forget side effects (e.g. background feedback) that should be
   * skipped — not error out the parent request — when over quota. No-op (true)
   * for Pro users; fails open (true) on infrastructure errors.
   */
  async isWithinLimit(
    userId: string,
    category: AiQuotaCategory,
  ): Promise<boolean> {
    try {
      if (await this.isPro(userId)) return true;

      const startOfDayIso = this.startOfDaySaoPauloIso();
      const { count, error } = await this.supabaseService
        .from('ai_usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('feature_name', CATEGORY_FEATURES[category])
        .gte('created_at', startOfDayIso);

      if (error) {
        this.logger.warn(
          `[AiQuota] count failed for ${userId}/${category}: ${error.message}`,
        );
        return true; // fail open
      }

      return (count ?? 0) < FREE_DAILY_LIMITS[category];
    } catch (err) {
      this.logger.warn(
        `[AiQuota] unexpected error for ${userId}/${category}: ${(err as Error)?.message}`,
      );
      return true; // fail open
    }
  }

  private async isPro(userId: string): Promise<boolean> {
    const { data } = await this.supabaseService
      .from('users')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();
    return (data?.subscription_plan ?? 'free') === 'pro';
  }

  /** Start of the current calendar day in São Paulo, as a UTC ISO string. */
  private startOfDaySaoPauloIso(): string {
    const now = new Date();
    // Shift to São Paulo wall-clock, zero the time, shift back to UTC.
    const sp = new Date(
      now.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );
    sp.setUTCHours(0, 0, 0, 0);
    return new Date(
      sp.getTime() - SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    ).toISOString();
  }
}
