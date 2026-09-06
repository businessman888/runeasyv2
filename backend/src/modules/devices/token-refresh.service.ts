import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';

// Refresh tokens that expire within the next 30 minutes
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    private readonly fitbitOAuth: FitbitOAuthService,
  ) {}

  /**
   * Cron job: runs every 10 minutes to refresh expiring tokens.
   * Only Fitbit requires refresh — Polar tokens don't expire (long-lived).
   *
   * ── IDEMPOTÊNCIA: SEM GUARDA, E ISTO É UM RISCO CONHECIDO ─────────────────
   *
   * Este é o único dos cinco `@Cron` do app que não tem guarda contra execução
   * concorrente, e ele NÃO envia notificação — então a `dedupe_key` de
   * `notifications` não se aplica aqui.
   *
   * O perigo é outro e é pior: o `refresh_token` do Fitbit ROTACIONA a cada
   * uso. Duas execuções simultâneas trocam o mesmo token, a segunda recebe
   * `invalid_grant`, e a última escrita pode gravar um token já superado —
   * desconectando o usuário em silêncio.
   *
   * Hoje é inofensivo porque há ZERO dispositivos Fitbit conectados em
   * produção, e por isso o conserto ficou fora do escopo da tarefa de
   * notificações duplicadas (que removeu a causa comum: dois
   * `ScheduleModule.forRoot()`).
   *
   * ⚠️ ANTES DO PRIMEIRO FITBIT REAL, este loop precisa de uma claim atômica —
   * o molde é `workouts.completion_processing_id`
   * (`20260829_add_free_run_completion_identity.sql`): um `UPDATE … WHERE
   * processing_id IS NULL RETURNING` que só deixa um executor seguir.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshExpiringTokens() {
    this.logger.log('Checking for expiring tokens...');

    const threshold = new Date(Date.now() + REFRESH_THRESHOLD_MS).toISOString();

    // Find Fitbit devices with tokens expiring soon
    const { data: expiringDevices, error } = await this.supabaseService
      .from('connected_devices')
      .select('id, user_id, provider, access_token, refresh_token, expires_at')
      .eq('provider', 'fitbit')
      .not('refresh_token', 'is', null)
      .lt('expires_at', threshold);

    if (error) {
      this.logger.error(`Error querying expiring tokens: ${error.message}`);
      return;
    }

    if (!expiringDevices || expiringDevices.length === 0) {
      return;
    }

    this.logger.log(`Found ${expiringDevices.length} Fitbit tokens to refresh`);

    for (const device of expiringDevices) {
      try {
        await this.refreshFitbitToken(device);
      } catch (error: any) {
        this.logger.error(
          `Failed to refresh token for user ${device.user_id} / ${device.provider}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Refresh a single Fitbit device's tokens.
   */
  private async refreshFitbitToken(device: any) {
    const decryptedRefreshToken = this.encryptionService.decrypt(
      device.refresh_token,
    );

    const newTokens = await this.fitbitOAuth.refreshAccessToken(
      decryptedRefreshToken,
    );

    const encryptedAccessToken = this.encryptionService.encrypt(
      newTokens.access_token,
    );
    const encryptedRefreshToken = this.encryptionService.encrypt(
      newTokens.refresh_token,
    );
    const expiresAt = new Date(
      Date.now() + newTokens.expires_in * 1000,
    ).toISOString();

    const { error } = await this.supabaseService
      .from('connected_devices')
      .update({
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);

    if (error) {
      throw new Error(`DB update failed: ${error.message}`);
    }

    this.logger.log(`Token refreshed for user ${device.user_id} / fitbit`);
  }

  /**
   * Manually refresh a token for a specific user/provider.
   * Called before API requests when token might be expired.
   */
  async ensureValidToken(userId: string, provider: string): Promise<string> {
    const { data: device, error } = await this.supabaseService
      .from('connected_devices')
      .select('id, access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (error || !device) {
      throw new Error(`No ${provider} device found for user ${userId}`);
    }

    const expiresAt = device.expires_at
      ? new Date(device.expires_at).getTime()
      : Infinity;
    const isExpired = expiresAt < Date.now() + 60 * 1000; // 1 min buffer

    if (!isExpired) {
      return this.encryptionService.decrypt(device.access_token);
    }

    if (provider === 'fitbit' && device.refresh_token) {
      await this.refreshFitbitToken(device);
      // Re-read updated token
      const { data: updated } = await this.supabaseService
        .from('connected_devices')
        .select('access_token')
        .eq('id', device.id)
        .single();

      return this.encryptionService.decrypt(updated.access_token);
    }

    // Polar tokens are long-lived, no refresh needed
    return this.encryptionService.decrypt(device.access_token);
  }
}
