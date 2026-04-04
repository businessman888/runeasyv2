import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface FitbitTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    token_type: string;
    user_id: string;
    scope: string;
}

@Injectable()
export class FitbitOAuthService {
    private readonly logger = new Logger(FitbitOAuthService.name);

    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly authUri = 'https://www.fitbit.com/oauth2/authorize';
    private readonly tokenUri = 'https://api.fitbit.com/oauth2/token';

    // PKCE code verifiers keyed by state param (in-memory, short-lived)
    private readonly pkceStore = new Map<string, { verifier: string; userId: string; createdAt: number }>();

    // Cleanup stale entries older than 10 minutes
    private readonly PKCE_TTL_MS = 10 * 60 * 1000;

    constructor(private readonly configService: ConfigService) {
        this.clientId = this.configService.get<string>('FITBIT_CLIENT_ID') || '23VCWS';
        this.clientSecret = this.configService.get<string>('FITBIT_CLIENT_SECRET') || '';
        this.redirectUri = this.configService.get<string>('FITBIT_REDIRECT_URI')
            || 'https://app.runeasy.com.br/api/devices/fitbit/callback';
    }

    /**
     * Generate the Fitbit authorization URL with PKCE.
     * Returns the URL to redirect the user to and the state param for verification.
     */
    generateAuthUrl(userId: string): { url: string; state: string } {
        this.cleanupStalePkce();

        // Generate PKCE code verifier and challenge
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);
        const state = crypto.randomBytes(16).toString('hex');

        // Store verifier for callback
        this.pkceStore.set(state, {
            verifier: codeVerifier,
            userId,
            createdAt: Date.now(),
        });

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'activity heartrate profile settings',
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });

        const url = `${this.authUri}?${params.toString()}`;
        this.logger.log(`Generated Fitbit auth URL for user ${userId}`);

        return { url, state };
    }

    /**
     * Exchange authorization code for tokens using PKCE.
     */
    async exchangeCode(code: string, state: string): Promise<{ tokens: FitbitTokenResponse; userId: string }> {
        const pkceEntry = this.pkceStore.get(state);

        if (!pkceEntry) {
            throw new Error('Invalid or expired state parameter. Please restart the authorization flow.');
        }

        // Remove used entry
        this.pkceStore.delete(state);

        // Check TTL
        if (Date.now() - pkceEntry.createdAt > this.PKCE_TTL_MS) {
            throw new Error('Authorization session expired. Please try again.');
        }

        const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
            code_verifier: pkceEntry.verifier,
        });

        const response = await fetch(this.tokenUri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${basicAuth}`,
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            this.logger.error(`Fitbit token exchange failed: ${response.status} ${errorBody}`);
            throw new Error(`Fitbit token exchange failed: ${response.status}`);
        }

        const tokens: FitbitTokenResponse = await response.json();
        this.logger.log(`Fitbit tokens obtained for user ${pkceEntry.userId} (fitbit_uid: ${tokens.user_id})`);

        return { tokens, userId: pkceEntry.userId };
    }

    /**
     * Refresh an expired access token.
     */
    async refreshAccessToken(refreshToken: string): Promise<FitbitTokenResponse> {
        const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });

        const response = await fetch(this.tokenUri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${basicAuth}`,
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            this.logger.error(`Fitbit token refresh failed: ${response.status} ${errorBody}`);
            throw new Error(`Fitbit token refresh failed: ${response.status}`);
        }

        const tokens: FitbitTokenResponse = await response.json();
        this.logger.log(`Fitbit token refreshed (fitbit_uid: ${tokens.user_id})`);

        return tokens;
    }

    /**
     * Verify a Fitbit webhook notification signature.
     * Fitbit uses SHA-256 HMAC of the body with the client secret + subscriber verification code.
     */
    verifyWebhookSignature(body: string, signature: string): boolean {
        const expected = crypto
            .createHmac('sha256', `${this.clientSecret}&`)
            .update(body)
            .digest('base64');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected),
        );
    }

    // ---- PKCE helpers ----

    private generateCodeVerifier(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    private generateCodeChallenge(verifier: string): string {
        return crypto
            .createHash('sha256')
            .update(verifier)
            .digest('base64url');
    }

    private cleanupStalePkce() {
        const now = Date.now();
        for (const [key, entry] of this.pkceStore.entries()) {
            if (now - entry.createdAt > this.PKCE_TTL_MS) {
                this.pkceStore.delete(key);
            }
        }
    }
}
