import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database';
import { RevenueCatEvent } from '../subscription/dto/revenuecat-event.dto';

interface Influencer {
  id: string;
  name: string;
  code: string;
  commission_rate: number;
  max_commission_months: number;
  is_active: boolean;
}

interface Referral {
  id: string;
  user_id: string;
  influencer_id: string;
  code_used: string;
  applied_at: string;
  first_purchase_at: string | null;
  status: 'pending' | 'converted' | 'expired';
}

// Store fee assumed flat for v1; will become per-tier (15% / 30%) once revenue
// crosses the small-business thresholds. Lives here (not in env) so the rule
// stays auditable next to the math that uses it.
const STORE_FEE_RATE = 0.15;

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async validate(code: string): Promise<{
    valid: boolean;
    influencer_name?: string;
    discount_description?: string;
    message?: string;
  }> {
    const normalized = code.trim().toLowerCase();

    const { data, error } = await this.supabase
      .from('influencers')
      .select(
        'id, name, code, commission_rate, max_commission_months, is_active',
      )
      .ilike('code', normalized)
      .maybeSingle();

    if (error) {
      this.logger.error(`[Referral] validate query failed`, error);
      return { valid: false, message: 'Erro ao validar código' };
    }

    if (!data || !data.is_active) {
      return { valid: false, message: 'Código não encontrado' };
    }

    return {
      valid: true,
      influencer_name: data.name,
      discount_description: 'Desconto especial no seu primeiro mês',
    };
  }

  async apply(
    userId: string,
    code: string,
  ): Promise<{ applied: boolean; influencer_id: string; referral_id: string }> {
    const normalized = code.trim().toLowerCase();

    const { data: influencer, error: lookupError } = await this.supabase
      .from('influencers')
      .select('id, code, is_active')
      .ilike('code', normalized)
      .maybeSingle();

    if (lookupError) {
      this.logger.error(`[Referral] apply lookup failed`, lookupError);
      throw new NotFoundException('Código não encontrado');
    }
    if (!influencer || !influencer.is_active) {
      throw new NotFoundException('Código não encontrado');
    }

    const { data: existing } = await this.supabase
      .from('referrals')
      .select('id, influencer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      throw new ConflictException('Você já usou um código de indicação');
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from('referrals')
      .insert({
        user_id: userId,
        influencer_id: influencer.id,
        code_used: influencer.code,
      })
      .select('id, influencer_id')
      .single();

    if (insertError || !inserted) {
      // 23505 is Postgres unique_violation — race against UNIQUE(user_id).
      if ((insertError as any)?.code === '23505') {
        throw new ConflictException('Você já usou um código de indicação');
      }
      this.logger.error(`[Referral] apply insert failed`, insertError);
      throw new ConflictException('Não foi possível aplicar o código');
    }

    return {
      applied: true,
      influencer_id: inserted.influencer_id,
      referral_id: inserted.id,
    };
  }

  async getStatus(userId: string): Promise<
    | {
        has_referral: true;
        code: string;
        influencer_name: string;
        applied_at: string;
      }
    | { has_referral: false }
  > {
    const { data: referral, error } = await this.supabase
      .from('referrals')
      .select('code_used, applied_at, influencer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !referral) {
      return { has_referral: false };
    }

    const { data: influencer } = await this.supabase
      .from('influencers')
      .select('name')
      .eq('id', referral.influencer_id)
      .maybeSingle();

    return {
      has_referral: true,
      code: referral.code_used,
      influencer_name: influencer?.name ?? '',
      applied_at: referral.applied_at,
    };
  }

  /**
   * Called from the RevenueCat webhook after the user upgrade is persisted.
   * Idempotent per (referral_id, month_number) via the UNIQUE constraint on
   * the commissions table.
   */
  async processCommission(
    userId: string,
    event: RevenueCatEvent & { price?: number; currency?: string },
  ): Promise<void> {
    const { data: referral } = await this.supabase
      .from('referrals')
      .select('id, influencer_id, status')
      .eq('user_id', userId)
      .maybeSingle<Referral>();

    if (!referral) return;

    const { data: influencer } = await this.supabase
      .from('influencers')
      .select(
        'id, commission_rate, max_commission_months, total_referrals, total_commission_earned, total_revenue_generated',
      )
      .eq('id', referral.influencer_id)
      .maybeSingle<
        Influencer & {
          total_referrals: number;
          total_commission_earned: number;
          total_revenue_generated: number;
        }
      >();

    if (!influencer) return;

    const { count } = await this.supabase
      .from('commissions')
      .select('id', { count: 'exact', head: true })
      .eq('referral_id', referral.id);

    const monthNumber = (count ?? 0) + 1;
    if (monthNumber > influencer.max_commission_months) {
      this.logger.log(
        `[Referral] Commission cap reached for referral ${referral.id} (month ${monthNumber})`,
      );
      return;
    }

    const grossAmount = Number(event.price ?? 0);
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      this.logger.warn(
        `[Referral] Missing/invalid price on event ${event.id} — skipping commission`,
      );
      return;
    }

    const storeFee = round2(grossAmount * STORE_FEE_RATE);
    const netAmount = round2(grossAmount - storeFee);
    const commissionAmount = round2(
      netAmount * Number(influencer.commission_rate),
    );

    const periodStart = event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : new Date().toISOString();
    const periodEnd = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : periodStart;

    const { error: insertError } = await this.supabase
      .from('commissions')
      .insert({
        influencer_id: influencer.id,
        referral_id: referral.id,
        user_id: userId,
        month_number: monthNumber,
        gross_amount: grossAmount,
        store_fee: storeFee,
        net_amount: netAmount,
        commission_amount: commissionAmount,
        period_start: periodStart,
        period_end: periodEnd,
      });

    if (insertError) {
      // Race against UNIQUE (referral_id, month_number) → silently treat as duplicate.
      if ((insertError as any).code === '23505') {
        this.logger.log(
          `[Referral] Commission month ${monthNumber} already recorded for referral ${referral.id}`,
        );
        return;
      }
      this.logger.error(`[Referral] commissions insert failed`, insertError);
      return;
    }

    if (monthNumber === 1 && referral.status !== 'converted') {
      await this.supabase
        .from('referrals')
        .update({
          status: 'converted',
          first_purchase_at: periodStart,
        })
        .eq('id', referral.id);

      await this.supabase
        .from('influencers')
        .update({
          total_referrals: (influencer.total_referrals ?? 0) + 1,
        })
        .eq('id', influencer.id);
    }

    await this.supabase
      .from('influencers')
      .update({
        total_revenue_generated: round2(
          (Number(influencer.total_revenue_generated) || 0) + grossAmount,
        ),
        total_commission_earned: round2(
          (Number(influencer.total_commission_earned) || 0) + commissionAmount,
        ),
      })
      .eq('id', influencer.id);

    this.logger.log(
      `[Referral] Recorded commission R$${commissionAmount} (month ${monthNumber}/${influencer.max_commission_months}) for user ${userId}`,
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
