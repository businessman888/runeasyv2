import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';
import { VALID_PROVIDERS, DeviceProvider } from './device-providers';
import { GoogleHealthOAuthService } from './providers/google-health-oauth.service';
import { TokenRevoker } from './token-revoker';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  /**
   * Quem sabe revogar o grant do lado do provedor. Mesmo desenho do mapa de
   * `refreshers` do `TokenRefreshService`: o ÚNICO lugar que decide, sem
   * `if (provider === …)`. Só o Google Health está aqui — Fitbit, Polar e os de
   * registro local desconectam exatamente como sempre desconectaram.
   */
  private readonly revokers: ReadonlyMap<DeviceProvider, TokenRevoker>;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly encryptionService: EncryptionService,
    googleHealthOAuth: GoogleHealthOAuthService,
  ) {
    this.revokers = new Map<DeviceProvider, TokenRevoker>([
      ['google_health', googleHealthOAuth],
    ]);
  }

  /**
   * Connect a wearable device for a user.
   * Encrypts tokens before storage. Upserts on (user_id, provider).
   */
  async connectDevice(userId: string, dto: ConnectDeviceDto) {
    this.validateProvider(dto.provider);

    // apple_health is a local iOS permission — no OAuth token exists.
    const encryptedAccessToken = dto.access_token
      ? this.encryptionService.encrypt(dto.access_token)
      : null;
    const encryptedRefreshToken = dto.refresh_token
      ? this.encryptionService.encrypt(dto.refresh_token)
      : null;

    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .upsert(
        {
          user_id: userId,
          provider: dto.provider,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          expires_at: dto.expires_at || null,
          scope: dto.scope || null,
          provider_user_id: dto.provider_user_id || null,
          device_name: dto.device_name || null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Colunas novas entram SÓ quando o DTO traz o ciclo de vida do
          // refresh token — hoje, só o callback do Google Health. O payload de
          // Apple Health, Apple Watch, Garmin, Fitbit e Polar fica byte a byte
          // igual ao de antes, e continua funcionando mesmo num banco sem as
          // migrations. Travado em `devices.service.spec.ts`.
          //
          // Na (re)conexão o estado degradado volta a NULL: o usuário acabou
          // de autorizar de novo, então a conexão está viva.
          ...(dto.refresh_token_expires_at !== undefined
            ? {
                refresh_token_expires_at: dto.refresh_token_expires_at,
                refresh_failed_at: null,
                last_refresh_error: null,
              }
            : {}),
        },
        { onConflict: 'user_id,provider' },
      )
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to connect device: ${error.message}`, error);
      throw error;
    }

    this.logger.log(`Device connected: ${dto.provider} for user ${userId}`);

    return this.sanitizeDevice(data);
  }

  /**
   * List all connected devices for a user (without decrypted tokens).
   */
  async listDevices(userId: string) {
    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select(
        'id, provider, provider_user_id, device_name, scope, expires_at, connected_at, updated_at',
      )
      .eq('user_id', userId)
      .order('connected_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to list devices: ${error.message}`, error);
      throw error;
    }

    return data || [];
  }

  /**
   * Disconnect (remove) a device for a user.
   *
   * Para provedor com revoker registrado (hoje só o Google Health), o grant é
   * revogado do lado do provedor ANTES de apagar a linha (Mina 22) — senão o
   * acesso aos dados de saúde continuaria vivo na conta do usuário depois de ele
   * pedir para desconectar. Para escopos restritos de saúde, isso é
   * conformidade, não higiene.
   *
   * Revogar falhando NÃO impede a desconexão local: o usuário pediu para
   * desconectar. Loga e segue. Sem revoker, o caminho é o de antes.
   */
  async disconnectDevice(userId: string, provider: string) {
    this.validateProvider(provider);

    const revoker = this.revokers.get(provider as DeviceProvider);
    if (revoker) {
      await this.revokeAtProvider(userId, provider, revoker);
    }

    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to disconnect device: ${error.message}`, error);
      throw new NotFoundException(`Device ${provider} not found for user`);
    }

    this.logger.log(`Device disconnected: ${provider} for user ${userId}`);

    return { success: true, provider };
  }

  /**
   * Revoga o grant no provedor com o refresh token — revogá-lo derruba o grant
   * inteiro — ou, na falta dele (conexão degradada, refresh token já zerado),
   * com o access token.
   *
   * Best-effort: qualquer falha — leitura, token ilegível, provedor recusando —
   * só loga. A decisão sobre o 404 continua sendo do DELETE que vem depois,
   * como sempre foi.
   */
  private async revokeAtProvider(
    userId: string,
    provider: string,
    revoker: TokenRevoker,
  ): Promise<void> {
    try {
      const { data, error } = await this.supabaseService
        .from('connected_devices')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('provider', provider)
        .maybeSingle<{
          access_token: string | null;
          refresh_token: string | null;
        }>();

      if (error) {
        this.logger.warn(
          `Could not read ${provider} tokens to revoke for user ${userId}: ${error.message}`,
        );
        return;
      }

      const encryptedToken = data?.refresh_token ?? data?.access_token;
      if (!encryptedToken) return;

      await revoker.revokeToken(this.encryptionService.decrypt(encryptedToken));
      this.logger.log(`Grant revoked at ${provider} for user ${userId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not revoke ${provider} grant for user ${userId}: ${message} — disconnecting locally anyway`,
      );
    }
  }

  /**
   * Get decrypted access token for a provider (internal use only, e.g., for API calls).
   */
  async getDecryptedToken(
    userId: string,
    provider: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  }> {
    this.validateProvider(provider);

    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `No connected ${provider} device found for user`,
      );
    }

    return {
      accessToken: this.encryptionService.decrypt(data.access_token),
      refreshToken: data.refresh_token
        ? this.encryptionService.decrypt(data.refresh_token)
        : null,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Update tokens (used after OAuth refresh).
   */
  async updateTokens(
    userId: string,
    provider: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: string,
  ) {
    const encryptedAccessToken = this.encryptionService.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? this.encryptionService.encrypt(refreshToken)
      : undefined;

    const updateData: Record<string, any> = {
      access_token: encryptedAccessToken,
      updated_at: new Date().toISOString(),
    };

    if (encryptedRefreshToken) {
      updateData.refresh_token = encryptedRefreshToken;
    }
    if (expiresAt) {
      updateData.expires_at = expiresAt;
    }

    const { error } = await this.supabaseService
      .from('connected_devices')
      .update(updateData)
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      this.logger.error(`Failed to update tokens: ${error.message}`, error);
      throw error;
    }

    this.logger.log(`Tokens updated for ${provider} / user ${userId}`);
  }

  /**
   * Check if a user has a specific provider connected.
   */
  async isConnected(userId: string, provider: string): Promise<boolean> {
    const { data } = await this.supabaseService
      .from('connected_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    return !!data;
  }

  // ---- Private helpers ----

  /**
   * Guarda de profundidade. A validação de borda vive no `@IsIn` do
   * `ConnectDeviceDto`, mas nem todo caminho passa por um DTO: `provider` chega
   * como parâmetro de rota em `disconnectDevice`/`isConnected`, e como string
   * literal nos callbacks de OAuth.
   *
   * `BadRequestException` e não `Error` cru: provedor inválido é entrada
   * inválida do cliente (400), não falha do servidor (500).
   */
  private validateProvider(provider: string) {
    if (!VALID_PROVIDERS.includes(provider as DeviceProvider)) {
      throw new BadRequestException(
        `Invalid provider: ${provider}. Valid: ${VALID_PROVIDERS.join(', ')}`,
      );
    }
  }

  /**
   * Strip sensitive fields before returning to client.
   */
  private sanitizeDevice(device: any) {
    const { access_token, refresh_token, ...safe } = device;
    return safe;
  }
}
