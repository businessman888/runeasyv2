import {
    Controller,
    Get,
    Query,
    Res,
    Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { StravaService } from './strava.service';
import { SupabaseService } from '../../database';

@Controller('auth/strava')
export class StravaAuthController {
    private readonly logger = new Logger(StravaAuthController.name);

    constructor(
        private readonly stravaService: StravaService,
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Redirect to Strava OAuth authorization
     */
    @Get('login')
    login(@Res() res: Response) {
        this.logger.log('=== STRAVA LOGIN INITIATED ===');

        const authUrl = this.stravaService.getAuthorizationUrl();

        this.logger.log(`Redirecting to Strava authorization URL: ${authUrl}`);

        if (!authUrl || authUrl.includes('client_id=&') || authUrl.includes('redirect_uri=&')) {
            this.logger.error('STRAVA_CLIENT_ID or STRAVA_REDIRECT_URI is missing!');
            this.logger.error(`Generated URL: ${authUrl}`);
            return res.status(500).send('Configuração do Strava incompleta. Verifique STRAVA_CLIENT_ID e STRAVA_REDIRECT_URI no .env');
        }

        return res.redirect(authUrl);
    }

    /**
     * Handle Strava OAuth callback
     */
    @Get('callback')
    async callback(
        @Query('code') code: string,
        @Query('error') error: string,
        @Res() res: Response,
    ) {
        const frontendUrl = this.configService.get<string>('FRONTEND_URL');

        if (error) {
            this.logger.error(`Strava OAuth error: ${error}`);
            return res.redirect(`${frontendUrl}/login?error=${error}`);
        }

        if (!code) {
            return res.redirect(`${frontendUrl}/login?error=missing_code`);
        }

        try {
            // Exchange code for tokens
            const tokens = await this.stravaService.exchangeCode(code);
            const { athlete, access_token, refresh_token, expires_at } = tokens;

            // Check if user already exists
            const { data: existingUser } = await this.supabaseService
                .from('users')
                .select('id')
                .eq('strava_athlete_id', athlete.id)
                .single();

            let userId: string;

            if (existingUser) {
                // Update existing user
                const { data: updatedUser, error: updateError } = await this.supabaseService
                    .from('users')
                    .update({
                        strava_access_token: access_token,
                        strava_refresh_token: refresh_token,
                        strava_token_expires_at: new Date(expires_at * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                        profile: {
                            firstname: athlete.firstname,
                            lastname: athlete.lastname,
                            profile_pic: athlete.profile,
                            city: athlete.city,
                            country: athlete.country,
                        },
                    })
                    .eq('id', existingUser.id)
                    .select('id')
                    .single();

                if (updateError) throw updateError;
                userId = updatedUser.id;
            } else {
                // Create new user
                const email = `strava_${athlete.id}@runeasy.app`;

                const { data: newUser, error: insertError } = await this.supabaseService
                    .from('users')
                    .insert({
                        email,
                        strava_athlete_id: athlete.id,
                        strava_access_token: access_token,
                        strava_refresh_token: refresh_token,
                        strava_token_expires_at: new Date(expires_at * 1000).toISOString(),
                        profile: {
                            firstname: athlete.firstname,
                            lastname: athlete.lastname,
                            profile_pic: athlete.profile,
                            city: athlete.city,
                            country: athlete.country,
                        },
                    })
                    .select('id')
                    .single();

                if (insertError) throw insertError;
                userId = newUser.id;

                // Create initial user_levels record
                await this.supabaseService.from('user_levels').insert({
                    user_id: userId,
                    current_level: 1,
                    total_points: 0,
                });
            }

            // Check if user has completed onboarding
            const { data: onboarding } = await this.supabaseService
                .from('user_onboarding')
                .select('completed_at')
                .eq('user_id', userId)
                .single();

            const hasCompletedOnboarding = onboarding?.completed_at != null;

            // Redirect to frontend with user info
            const redirectPath = hasCompletedOnboarding ? '/home' : '/onboarding';
            return res.redirect(`${frontendUrl}${redirectPath}?user_id=${userId}`);
        } catch (err) {
            this.logger.error('Strava callback error', err);
            return res.redirect(`${frontendUrl}/login?error=auth_failed`);
        }
    }
}
