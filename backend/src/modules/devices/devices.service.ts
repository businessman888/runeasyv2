import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';

const VALID_PROVIDERS = ['garmin', 'fitbit', 'polar', 'apple_watch'] as const;
type Provider = typeof VALID_PROVIDERS[number];

@Injectable()
export class DevicesService {
    private readonly logger = new Logger(DevicesService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly encryptionService: EncryptionService,
    ) {}

    /**
     * Connect a wearable device for a user.
     * Encrypts tokens before storage. Upserts on (user_id, provider).
     */
    async connectDevice(userId: string, dto: ConnectDeviceDto) {
        this.validateProvider(dto.provider);

        const encryptedAccessToken = this.encryptionService.encrypt(dto.access_token);
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
            .select('id, provider, provider_user_id, device_name, scope, expires_at, connected_at, updated_at')
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
     */
    async disconnectDevice(userId: string, provider: string) {
        this.validateProvider(provider);

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
     * Get decrypted access token for a provider (internal use only, e.g., for API calls).
     */
    async getDecryptedToken(userId: string, provider: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
        this.validateProvider(provider);

        const { data, error } = await this.supabaseService
            .from('connected_devices')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();

        if (error || !data) {
            throw new NotFoundException(`No connected ${provider} device found for user`);
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

    private validateProvider(provider: string) {
        if (!VALID_PROVIDERS.includes(provider as Provider)) {
            throw new Error(`Invalid provider: ${provider}. Valid: ${VALID_PROVIDERS.join(', ')}`);
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
