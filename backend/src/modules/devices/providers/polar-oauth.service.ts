import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PolarTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number; // seconds
    x_user_id: number; // Polar user ID (numeric)
}

@Injectable()
export class PolarOAuthService {
    private readonly logger = new Logger(PolarOAuthService.name);

    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly authUri = 'https://flow.polar.com/oauth2/authorization';
    private readonly tokenUri = 'https://polarremote.com/v2/oauth2/token';
    private readonly accessLinkBaseUri = 'https://www.polaraccesslink.com/v3';

    // State store keyed by state param (in-memory, short-lived)
    private readonly stateStore = new Map<string, { userId: string; createdAt: number }>();
    private readonly STATE_TTL_MS = 10 * 60 * 1000;

    constructor(private readonly configService: ConfigService) {
        this.clientId = this.configService.get<string>('POLAR_CLIENT_ID')
            || 'c38ed64d-d8b5-4367-a463-94ff8bd673c7';
        this.clientSecret = this.configService.get<string>('POLAR_CLIENT_SECRET') || '';
        this.redirectUri = this.configService.get<string>('POLAR_REDIRECT_URI')
            || 'https://app.runeasy.com.br/api/devices/polar/callback';
    }

    /**
     * Generate the Polar authorization URL.
     * Polar uses standard OAuth 2.0 (no PKCE required).
     */
    generateAuthUrl(userId: string): { url: string; state: string } {
        this.cleanupStaleState();

        const state = crypto.randomBytes(16).toString('hex');

        this.stateStore.set(state, {
            userId,
            createdAt: Date.now(),
        });

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            state,
            scope: 'accesslink.read_all',
        });

        const url = `${this.authUri}?${params.toString()}`;
        this.logger.log(`Generated Polar auth URL for user ${userId}`);

        return { url, state };
    }

    /**
     * Exchange authorization code for tokens.
     */
    async exchangeCode(code: string, state: string): Promise<{ tokens: PolarTokenResponse; userId: string }> {
        const stateEntry = this.stateStore.get(state);

        if (!stateEntry) {
            throw new Error('Invalid or expired state parameter. Please restart the authorization flow.');
        }

        this.stateStore.delete(state);

        if (Date.now() - stateEntry.createdAt > this.STATE_TTL_MS) {
            throw new Error('Authorization session expired. Please try again.');
        }

        const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
        });

        const response = await fetch(this.tokenUri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${basicAuth}`,
                Accept: 'application/json',
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            this.logger.error(`Polar token exchange failed: ${response.status} ${errorBody}`);
            throw new Error(`Polar token exchange failed: ${response.status}`);
        }

        const tokens: PolarTokenResponse = await response.json();
        this.logger.log(`Polar tokens obtained for user ${stateEntry.userId} (polar_uid: ${tokens.x_user_id})`);

        return { tokens, userId: stateEntry.userId };
    }

    /**
     * Register user in Polar AccessLink (required after first authorization).
     * Must be called once after exchangeCode to enable data access.
     */
    async registerUser(accessToken: string, polarUserId: number): Promise<void> {
        const response = await fetch(`${this.accessLinkBaseUri}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            body: JSON.stringify({
                'member-id': `runeasy-${polarUserId}`,
            }),
        });

        // 200 = registered, 409 = already registered — both OK
        if (response.ok || response.status === 409) {
            this.logger.log(`Polar user ${polarUserId} registered in AccessLink (status: ${response.status})`);
            return;
        }

        const errorBody = await response.text();
        this.logger.error(`Polar AccessLink registration failed: ${response.status} ${errorBody}`);
        throw new Error(`Polar AccessLink registration failed: ${response.status}`);
    }

    /**
     * Pull available exercise data from Polar AccessLink.
     * Returns transaction URL or null if no new data.
     */
    async listNewExercises(accessToken: string, polarUserId: number): Promise<any[] | null> {
        // 1. Create a transaction
        const txResponse = await fetch(
            `${this.accessLinkBaseUri}/users/${polarUserId}/exercise-transactions`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            },
        );

        // 204 = no new data
        if (txResponse.status === 204) {
            this.logger.log(`No new Polar exercises for user ${polarUserId}`);
            return null;
        }

        if (!txResponse.ok) {
            const errorBody = await txResponse.text();
            this.logger.error(`Polar exercise transaction failed: ${txResponse.status} ${errorBody}`);
            throw new Error(`Polar exercise transaction failed: ${txResponse.status}`);
        }

        const txData = await txResponse.json();
        const transactionId = txData['transaction-id'];

        // 2. List exercises in the transaction
        const listResponse = await fetch(
            `${this.accessLinkBaseUri}/users/${polarUserId}/exercise-transactions/${transactionId}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            },
        );

        if (!listResponse.ok) {
            throw new Error(`Failed to list Polar exercises: ${listResponse.status}`);
        }

        const listData = await listResponse.json();
        const exerciseUrls: string[] = listData.exercises || [];

        // 3. Fetch each exercise detail
        const exercises = [];
        for (const url of exerciseUrls) {
            const exResponse = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            });

            if (exResponse.ok) {
                exercises.push(await exResponse.json());
            }
        }

        // 4. Commit the transaction
        await fetch(
            `${this.accessLinkBaseUri}/users/${polarUserId}/exercise-transactions/${transactionId}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        this.logger.log(`Fetched ${exercises.length} new Polar exercises for user ${polarUserId}`);
        return exercises;
    }

    /**
     * Verify Polar webhook signature.
     * Polar signs the body with HMAC-SHA256 using the webhook signing key.
     */
    verifyWebhookSignature(body: string, signature: string): boolean {
        const webhookSecret = this.configService.get<string>('POLAR_WEBHOOK_SECRET') || this.clientSecret;

        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(body)
            .digest('hex');

        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expected),
            );
        } catch {
            return false;
        }
    }

    // ---- Private helpers ----

    private cleanupStaleState() {
        const now = Date.now();
        for (const [key, entry] of this.stateStore.entries()) {
            if (now - entry.createdAt > this.STATE_TTL_MS) {
                this.stateStore.delete(key);
            }
        }
    }
}
