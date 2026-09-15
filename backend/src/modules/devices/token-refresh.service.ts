import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { GoogleHealthOAuthService } from './providers/google-health-oauth.service';
import { DeviceProvider } from './device-providers';
import { RefreshTokenInvalidError, TokenRefresher } from './token-refresher';

// O contrato mora em `token-refresher.ts`, para não fechar ciclo de import com
// os provedores. Reexportado aqui para quem já o importava por este caminho.
export { RefreshTokenInvalidError } from './token-refresher';
export type { RefreshedTokens, TokenRefresher } from './token-refresher';

// Refresh tokens that expire within the next 30 minutes
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000;

/** O que o cron lê de `connected_devices` para renovar. */
interface RefreshableDevice {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

/** O que o `ensureValidToken` lê: o mesmo, mais o estado degradado. */
interface EnsuredDevice extends RefreshableDevice {
  refresh_failed_at: string | null;
}

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  /**
   * ── O ENCAIXE: onde um provedor se registra ──────────────────────────────
   *
   * Este mapa é o ÚNICO lugar que decide quem tem token renovável. Não há
   * `if (provider === 'x')` em lugar nenhum deste service: a query do cron
   * pergunta as chaves ao mapa, e o despacho pega o refresher por elas. Plugar
   * um provedor é uma injeção no construtor e uma entrada aqui.
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
    googleHealthOAuth: GoogleHealthOAuthService,
  ) {
    this.refreshers = new Map<DeviceProvider, TokenRefresher>([
      ['fitbit', fitbitOAuth],
      ['google_health', googleHealthOAuth],
    ]);
  }

  /** Os provedores que participam da renovação — derivado, nunca hardcoded. */
  private get refreshableProviders(): DeviceProvider[] {
    return [...this.refreshers.keys()];
  }

  /**
   * Cron job: runs every 10 minutes to refresh expiring tokens.
   *
   * Percorre os provedores registrados em `refreshers`. A query é a mesma da
   * Fase 2 — só a lista de provedores cresceu. Um token que o provedor recusou
   * de vez sai da fila pelo filtro `refresh_token IS NOT NULL` que já existia
   * (ver `markDegraded`), então nenhuma coluna nova entra no caminho quente.
   *
   * ── IDEMPOTÊNCIA: SEM GUARDA, E ISTO É UM RISCO CONHECIDO ─────────────────
   *
   * Este é o único dos cinco `@Cron` do app que não tem guarda contra execução
   * concorrente, e ele NÃO envia notificação — então a `dedupe_key` de
   * `notifications` não se aplica aqui.
   *
   * O perigo é o refresh token que ROTACIONA a cada uso, como o do Fitbit: duas
   * execuções simultâneas trocam o mesmo token, a segunda recebe
   * `invalid_grant`, e a última escrita pode gravar um token já superado —
   * desconectando o usuário em silêncio. Hoje é inofensivo porque há ZERO
   * dispositivos Fitbit conectados em produção.
   *
   * O Google não rotaciona: duas renovações concorrentes dão certo as duas e a
   * última escrita vale — a Mina 18 não o alcança, e por isso a claim atômica
   * não entrou na Fase 3.
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

    const devices = (expiringDevices ?? []) as RefreshableDevice[];
    if (devices.length === 0) {
      return;
    }

    this.logger.log(`Found ${devices.length} tokens to refresh`);

    for (const device of devices) {
      try {
        await this.refreshDeviceToken(device);
      } catch (error) {
        if (error instanceof RefreshTokenInvalidError) {
          await this.markDegraded(device, error);
          continue;
        }
        // Qualquer outra falha é transitória: só loga, e o próximo ciclo tenta
        // de novo. É o caminho do Fitbit, igual ao de antes.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to refresh token for user ${device.user_id} / ${device.provider}: ${message}`,
        );
      }
    }
  }

  /**
   * Garante um access token válido para um usuário/provedor — renovando se
   * preciso — e o devolve em texto plano.
   *
   * ⚠️ A FASE 4 É QUEM CHAMA ISTO (Mina 17). Até a Fase 3 o método existia sem
   * chamador: o fetch do Fitbit usa `DevicesService.getDecryptedToken`, que não
   * renova nada, e continua usando — ligar este método ao caminho do Fitbit
   * seria mudar provedor vivo. A ingestão do Google Health (Fase 4) deve pedir o
   * token por aqui, nunca pelo `getDecryptedToken`.
   *
   * Lança `RefreshTokenInvalidError` quando a conexão está morta (degradada, ou
   * o provedor recusou a renovação agora): quem chama deve parar de tentar para
   * este usuário — num job BullMQ, `UnrecoverableError`, senão ele retenta um
   * token morto.
   */
  async ensureValidToken(userId: string, provider: string): Promise<string> {
    const { data: device, error } = await this.supabaseService
      .from('connected_devices')
      .select(
        'id, user_id, provider, access_token, refresh_token, expires_at, refresh_failed_at',
      )
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle<EnsuredDevice>();

    if (error) {
      // Falha do banco não é "sem dispositivo" — não mandar ninguém reconectar
      // por causa de uma indisponibilidade nossa.
      throw new ServiceUnavailableException(
        `Could not read ${provider} connection: ${error.message}`,
      );
    }
    if (!device) {
      throw new NotFoundException(`No ${provider} device found for user`);
    }

    // Já marcada como morta: tentar de novo só gastaria uma chamada condenada.
    // Vem ANTES da checagem de validade — o `refresh_token` de uma linha
    // degradada é NULL, e cair no ramo "sem refresher" devolveria um access
    // token vencido como se fosse bom.
    if (device.refresh_failed_at) {
      throw new RefreshTokenInvalidError(
        `connection degraded since ${device.refresh_failed_at}`,
      );
    }

    const expiresAt = device.expires_at
      ? new Date(device.expires_at).getTime()
      : Infinity;
    const isExpired = expiresAt < Date.now() + 60 * 1000; // 1 min buffer

    if (!isExpired) {
      return this.encryptionService.decrypt(device.access_token);
    }

    const isRefreshable = this.refreshers.has(provider as DeviceProvider);

    if (!isRefreshable || !device.refresh_token) {
      // Provedor sem refresher (Polar tem token long-lived; os de registro
      // local não têm token): devolve o que está gravado.
      return this.encryptionService.decrypt(device.access_token);
    }

    try {
      return await this.refreshDeviceToken(device);
    } catch (refreshError) {
      if (refreshError instanceof RefreshTokenInvalidError) {
        await this.markDegraded(device, refreshError);
      }
      throw refreshError;
    }
  }

  /**
   * Renova o token de um device, despachando para o refresher do provedor, e
   * devolve o access token novo em texto plano.
   *
   * A mecânica (descriptografar → trocar → recriptografar → gravar) é a mesma
   * para qualquer provedor OAuth; só a troca em si é específica, e ela vem do
   * mapa. Por isso não há ramo por provedor aqui.
   */
  private async refreshDeviceToken(device: RefreshableDevice): Promise<string> {
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

    const update: Record<string, string> = {
      access_token: this.encryptionService.encrypt(newTokens.access_token),
      expires_at: new Date(
        Date.now() + newTokens.expires_in * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Quem ROTACIONA (Fitbit) manda um refresh token novo, que substitui o
    // antigo — o que o Fitbit grava fica exatamente como antes. O Google não
    // rotaciona e não manda: o antigo segue valendo, e regravá-lo seria
    // sobrescrever o token com nada.
    if (newTokens.refresh_token) {
      update.refresh_token = this.encryptionService.encrypt(
        newTokens.refresh_token,
      );
    }

    // Só quando o provedor informa — hoje, só o Google em modo Teste.
    if (typeof newTokens.refresh_token_expires_in === 'number') {
      update.refresh_token_expires_at = new Date(
        Date.now() + newTokens.refresh_token_expires_in * 1000,
      ).toISOString();
    }

    const { error } = await this.supabaseService
      .from('connected_devices')
      .update(update)
      .eq('id', device.id);

    if (error) {
      throw new Error(`DB update failed: ${error.message}`);
    }

    this.logger.log(`Token refreshed for user ${device.user_id} / ${provider}`);
    return newTokens.access_token;
  }

  /**
   * Grava o estado degradado: o provedor recusou o refresh token de vez e o
   * usuário precisa reconectar. É o que a Fase 5 lê para mostrar "reconecte" —
   * hoje "conectado" deriva da mera existência da linha (Mina 21).
   *
   * O `refresh_token` vai a NULL junto. Um refresh token rejeitado não serve
   * para nada, e zerá-lo faz o filtro que o cron JÁ TEM (`refresh_token IS NOT
   * NULL`) tirá-lo da fila. Sem isso, um token morto de modo Teste seria
   * retentado a cada 10 min, para sempre. O `last_refresh_error` guarda o
   * motivo. As duas colunas voltam a NULL quando o usuário reconecta.
   *
   * Falhar ao gravar não pode derrubar o loop do cron: loga e segue.
   */
  private async markDegraded(
    device: RefreshableDevice,
    error: RefreshTokenInvalidError,
  ): Promise<void> {
    this.logger.warn(
      `Refresh token rejected for user ${device.user_id} / ${device.provider}: ${error.reason} — marking connection degraded`,
    );

    const now = new Date().toISOString();
    const { error: dbError } = await this.supabaseService
      .from('connected_devices')
      .update({
        refresh_token: null,
        refresh_failed_at: now,
        last_refresh_error: error.reason,
        updated_at: now,
      })
      .eq('id', device.id);

    if (dbError) {
      this.logger.error(
        `Failed to mark device ${device.id} degraded: ${dbError.message}`,
      );
    }
  }
}
