import {
    Controller,
    Get,
    Post,
    Query,
    Headers,
    Req,
    Res,
    HttpException,
    HttpStatus,
    RawBodyRequest,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DevicesService } from './devices.service';
import { ActivitySyncService, WearableActivity } from './activity-sync.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('devices')
export class OAuthController {
    private readonly logger = new Logger(OAuthController.name);

    constructor(
        private readonly devicesService: DevicesService,
        private readonly activitySyncService: ActivitySyncService,
        private readonly fitbitOAuth: FitbitOAuthService,
        private readonly polarOAuth: PolarOAuthService,
        @InjectQueue('activity-sync-queue') private readonly syncQueue: Queue,
    ) {}

    // ============================================
    // FITBIT OAuth
    // ============================================

    /**
     * Start Fitbit OAuth flow — returns authorization URL.
     * GET /api/devices/fitbit/auth
     */
    @Get('fitbit/auth')
    async fitbitAuth(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const { url, state } = this.fitbitOAuth.generateAuthUrl(userId);
        return { url, state };
    }

    /**
     * Fitbit OAuth callback — exchanges code for tokens, stores device.
     * GET /api/devices/fitbit/callback
     */
    @Get('fitbit/callback')
    async fitbitCallback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Res() res: Response,
    ) {
        if (!code || !state) {
            return res.status(400).send('Missing code or state parameter');
        }

        try {
            const { tokens, userId } = await this.fitbitOAuth.exchangeCode(code, state);

            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

            await this.devicesService.connectDevice(userId, {
                provider: 'fitbit',
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt,
                scope: tokens.scope,
                provider_user_id: tokens.user_id,
                device_name: 'Fitbit',
            });

            this.logger.log(`Fitbit connected for user ${userId}`);

            // Redirect back to app with success
            return res.redirect(`runeasy://wearable-connected?provider=fitbit&success=true`);
        } catch (error: any) {
            this.logger.error(`Fitbit callback error: ${error.message}`);
            return res.redirect(`runeasy://wearable-connected?provider=fitbit&success=false&error=${encodeURIComponent(error.message)}`);
        }
    }

    // ============================================
    // POLAR OAuth
    // ============================================

    /**
     * Start Polar OAuth flow — returns authorization URL.
     * GET /api/devices/polar/auth
     */
    @Get('polar/auth')
    async polarAuth(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const { url, state } = this.polarOAuth.generateAuthUrl(userId);
        return { url, state };
    }

    /**
     * Polar OAuth callback — exchanges code for tokens, registers user, stores device.
     * GET /api/devices/polar/callback
     */
    @Get('polar/callback')
    async polarCallback(
        @Query('code') code: string,
        @Query('state') state: string,
        @Res() res: Response,
    ) {
        if (!code || !state) {
            return res.status(400).send('Missing code or state parameter');
        }

        try {
            const { tokens, userId } = await this.polarOAuth.exchangeCode(code, state);

            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

            // Register user in AccessLink (required for data access)
            await this.polarOAuth.registerUser(tokens.access_token, tokens.x_user_id);

            await this.devicesService.connectDevice(userId, {
                provider: 'polar',
                access_token: tokens.access_token,
                expires_at: expiresAt,
                provider_user_id: String(tokens.x_user_id),
                device_name: 'Polar',
            });

            this.logger.log(`Polar connected for user ${userId}`);

            return res.redirect(`runeasy://wearable-connected?provider=polar&success=true`);
        } catch (error: any) {
            this.logger.error(`Polar callback error: ${error.message}`);
            return res.redirect(`runeasy://wearable-connected?provider=polar&success=false&error=${encodeURIComponent(error.message)}`);
        }
    }

    // ============================================
    // WEBHOOKS
    // ============================================

    /**
     * Fitbit webhook verification (subscription setup).
     * GET /api/devices/webhooks/fitbit
     * Fitbit sends a verification request with ?verify=<code>
     */
    @Get('webhooks/fitbit')
    async fitbitWebhookVerify(@Query('verify') verify: string, @Res() res: Response) {
        const expectedCode = process.env.FITBIT_SUBSCRIBER_VERIFICATION_CODE;

        if (verify === expectedCode) {
            return res.status(204).send();
        }

        return res.status(404).send();
    }

    /**
     * Fitbit webhook receiver — receives activity notifications.
     * POST /api/devices/webhooks/fitbit
     *
     * Fitbit sends an array of notification objects.
     * Each contains: collectionType, date, ownerId, ownerType, subscriptionId
     */
    @Post('webhooks/fitbit')
    async fitbitWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Res() res: Response,
    ) {
        // Respond immediately with 204 (Fitbit requires fast response)
        res.status(204).send();

        try {
            // Verify signature
            const signature = req.headers['x-fitbit-signature'] as string;
            const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

            if (signature && !this.fitbitOAuth.verifyWebhookSignature(rawBody, signature)) {
                this.logger.warn('Fitbit webhook signature verification failed');
                return;
            }

            const notifications = req.body;

            if (!Array.isArray(notifications)) {
                this.logger.warn('Fitbit webhook: body is not an array');
                return;
            }

            for (const notification of notifications) {
                if (notification.collectionType === 'activities') {
                    // Enqueue a job to fetch the activity details from Fitbit API
                    await this.syncQueue.add('fitbit-fetch-activity', {
                        fitbitUserId: notification.ownerId,
                        date: notification.date,
                    });

                    this.logger.log(`Fitbit webhook: queued activity fetch for user ${notification.ownerId} on ${notification.date}`);
                }
            }
        } catch (error: any) {
            this.logger.error(`Fitbit webhook processing error: ${error.message}`);
        }
    }

    /**
     * Polar webhook receiver — receives AccessLink notifications.
     * POST /api/devices/webhooks/polar
     *
     * Polar sends notifications when new data is available.
     */
    @Post('webhooks/polar')
    async polarWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Res() res: Response,
    ) {
        // Respond immediately with 200
        res.status(200).send();

        try {
            const signature = req.headers['polar-webhook-signature'] as string;
            const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

            if (signature && !this.polarOAuth.verifyWebhookSignature(rawBody, signature)) {
                this.logger.warn('Polar webhook signature verification failed');
                return;
            }

            const { event, user_id: polarUserId } = req.body;

            if (event === 'EXERCISE') {
                // Enqueue a job to pull exercises from AccessLink
                await this.syncQueue.add('polar-fetch-exercises', {
                    polarUserId: String(polarUserId),
                });

                this.logger.log(`Polar webhook: queued exercise fetch for Polar user ${polarUserId}`);
            }
        } catch (error: any) {
            this.logger.error(`Polar webhook processing error: ${error.message}`);
        }
    }
}
