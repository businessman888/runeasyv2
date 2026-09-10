import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { DeviceProvider } from './device-providers';

// Refresh tokens that expire within the next 30 minutes
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * O que um provedor OAuth em nuvem precisa oferecer para participar da
 * renovação automática de token.
 *
 * Só isto. Quem implementa não precisa saber que existe cron, criptografia ou
 * banco — troca um refresh token por um par novo e devolve.
 */
export interface TokenRefresher {
  refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number; // segundos
  }>;
}

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  /**
   * ── O ENCAIXE: onde um provedor novo se registra ─────────────────────────
   *
   * Este mapa é o ÚNICO lugar que decide quem tem token renovável. Não há
   * `if (provider === 'x')` em lugar nenhum deste service: a query do cron
   * pergunta as chaves ao mapa, e o despacho pega o refresher por elas.
   *
   * Para plugar a Google Health (Fase 3): injete o service dela no construtor
   * e acrescente uma entrada aqui. Nada mais neste arquivo muda.
   *
   * ── QUEM ESTÁ FORA, E POR QUE ISSO É DELIBERADO ─────────────────────────
   *
   * `polar` NÃO entra. Os tokens da Polar são long-lived e o fluxo nunca os
   * renovou — a query antiga filtrava `provider = 'fitbit'` justamente para
   * excluí-lo. Registrar a Polar aqui não seria "generalizar", seria estrear
   * um comportamento que ela nunca teve.
   *
   * Os provedores de registro local (`garmin`, `apple_watch`, `apple_health`,
   * `health_connect`) também ficam de fora por construção: não têm token.
   */
  private readonly refreshers: ReadonlyMap<DeviceProvider, TokenRefresher>;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    fitbitOAuth: FitbitOAuthService,
  ) {
    this.refreshers = new Map<DeviceProvider, TokenRefresher>([
      ['fitbit', fitbitOAuth],
    ]);
  }

  /** Os provedores que participam da renovação — derivado, nunca hardcoded. */
  private get refreshableProviders(): DeviceProvider[] {
    return [...this.refreshers.keys()];
  }

  /**
   * Cron job: runs every 10 minutes to refresh expiring tokens.
   *
   * Percorre os provedores registrados em `refreshers` — hoje só o Fitbit, que
   * é exatamente o conjunto que a query filtrava à mão antes.
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

    const providers = this.refreshableProviders;
    if (providers.length === 0) {
      return;
    }

    const threshold = new Date(Date.now() + REFRESH_THRESHOLD_MS).toISOString();

    // Devices de provedores renováveis com token expirando em breve.
    // `.in(providers)` com um único registrado é a mesma query que o
    // `.eq('provider','fitbit')` anterior.
    const { data: expiringDevices, error } = await this.supabaseService
      .from('connected_devices')
      .select('id, user_id, provider, access_token, refresh_token, expires_at')
      .in('provider', providers)
      .not('refresh_token', 'is', null)
      .lt('expires_at', threshold);

    if (error) {
      this.logger.error(`Error querying expiring tokens: ${error.message}`);
      return;
    }

    if (!expiringDevices || expiringDevices.length === 0) {
      return;
    }

    this.logger.log(`Found ${expiringDevices.length} tokens to refresh`);

    for (const device of expiringDevices) {
      try {
        await this.refreshDeviceToken(device);
      } catch (error: any) {
        this.logger.error(
          `Failed to refresh token for user ${device.user_id} / ${device.provider}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Renova o token de um device, despachando para o refresher do provedor.
   *
   * A mecânica (descriptografar → trocar → recriptografar → gravar) é a mesma
   * para qualquer provedor OAuth; só a troca em si é específica, e ela vem do
   * mapa. Por isso não há ramo por provedor aqui.
   */
  private async refreshDeviceToken(device: any) {
    const provider = device.provider as DeviceProvider;
    const refresher = this.refreshers.get(provider);

    if (!refresher) {
      // Só acontece se a query e o mapa divergirem — não deveria, já que a
      // query é derivada do próprio mapa.
      throw new Error(`No token refresher registered for provider ${provider}`);
    }

    const decryptedRefreshToken = this.encryptionService.decrypt(
      device.refresh_token,
    );

    const newTokens = await refresher.refreshAccessToken(decryptedRefreshToken);

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

    this.logger.log(`Token refreshed for user ${device.user_id} / ${provider}`);
  }

  /**
   * Manually refresh a token for a specific user/provider.
   * Called before API requests when token might be expired.
   *
   * ⚠️ NINGUÉM CHAMA ISTO HOJE (Mina 17). O caminho real de fetch usa
   * `DevicesService.getDecryptedToken`, que não renova nada — fora da janela
   * de 30 min do cron, uma chamada usa token vencido e leva 401. Ligar este
   * método ao caminho de fetch é mudança de comportamento em provedor vivo, e
   * por isso ficou para a Fase 3; aqui ele só acompanha a generalização.
   */
  async ensureValidToken(userId: string, provider: string): Promise<string> {
    const { data: device, error } = await this.supabaseService
      .from('connected_devices')
      // `provider` entra no select porque `refreshDeviceToken` despacha por ele.
      .select('id, provider, access_token, refresh_token, expires_at')
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

    const isRefreshable = this.refreshers.has(provider as DeviceProvider);

    if (isRefreshable && device.refresh_token) {
      await this.refreshDeviceToken(device);
      // Re-read updated token
      const { data: updated } = await this.supabaseService
        .from('connected_devices')
        .select('access_token')
        .eq('id', device.id)
        .single();

      return this.encryptionService.decrypt(updated.access_token);
    }

    // Provedor sem refresher registrado (Polar tem token long-lived; os de
    // registro local não têm token): devolve o que está gravado.
    return this.encryptionService.decrypt(device.access_token);
  }
}
