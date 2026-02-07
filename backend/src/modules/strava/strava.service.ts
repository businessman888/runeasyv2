import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { StravaCacheService } from './strava-cache.service';

export interface StravaTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: StravaAthlete;
}

export interface StravaAthlete {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
    profile_medium: string;
    city: string;
    state: string;
    country: string;
}

export interface StravaActivity {
    id: number;
    name: string;
    type: string;
    sport_type: string;
    start_date: string;
    start_date_local: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    total_elevation_gain: number;
    average_speed: number;
    max_speed: number;
    average_heartrate?: number;
    max_heartrate?: number;
    calories?: number;
    splits_metric?: Array<{
        distance: number;
        elapsed_time: number;
        elevation_difference: number;
        moving_time: number;
        split: number;
        average_speed: number;
        average_heartrate?: number;
        pace_zone: number;
    }>;
    map?: {
        summary_polyline: string;
    };
    start_latlng?: [number, number];
}

@Injectable()
export class StravaService {
    private readonly logger = new Logger(StravaService.name);
    private readonly baseUrl = 'https://www.strava.com/api/v3';
    private readonly oauthUrl = 'https://www.strava.com/oauth';

    constructor(
        private configService: ConfigService,
        private cacheService: StravaCacheService,
    ) { }

    // ============================================
    // RETRY & BACKOFF UTILS
    // ============================================

    /**
     * Execute a function with exponential backoff retry on errors.
     * Handles 429 rate limit errors with Retry-After header.
     */
    private async fetchWithRetry<T>(
        fn: () => Promise<AxiosResponse<T>>,
        maxRetries = 3,
        baseDelay = 1000,
    ): Promise<AxiosResponse<T>> {
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                const axiosError = error as AxiosError;

                // Check for rate limit (429)
                if (axiosError.response?.status === 429) {
                    const retryAfter = parseInt(
                        axiosError.response.headers['retry-after'] as string || '60',
                        10,
                    );
                    this.logger.warn(
                        `Rate limited (429). Waiting ${retryAfter}s before retry...`,
                    );
                    await this.sleep(retryAfter * 1000);
                    continue;
                }

                // Don't retry on 4xx client errors (except 429)
                if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500) {
                    throw error;
                }

                // Exponential backoff for server errors
                if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    this.logger.warn(
                        `Request failed. Retry ${attempt + 1}/${maxRetries} after ${delay}ms`,
                    );
                    await this.sleep(delay);
                }
            }
        }

        this.logger.error(`All ${maxRetries} retry attempts failed`);
        throw lastError;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // OAUTH METHODS (no caching needed)
    // ============================================

    /**
     * Get the Strava OAuth authorization URL
     */
    getAuthorizationUrl(): string {
        const clientId = this.configService.get<string>('STRAVA_CLIENT_ID') || '';
        const redirectUri = this.configService.get<string>('STRAVA_REDIRECT_URI') || '';
        const scopes = 'read,activity:read_all,profile:read_all';

        this.logger.log('=== STRAVA AUTH URL GENERATION ===');
        this.logger.log(`STRAVA_CLIENT_ID: ${clientId ? clientId.substring(0, 5) + '...' : 'MISSING!'}`);
        this.logger.log(`STRAVA_REDIRECT_URI: ${redirectUri || 'MISSING!'}`);

        const authUrl = `${this.oauthUrl}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&approval_prompt=force`;

        this.logger.log(`Generated auth URL: ${authUrl}`);
        console.log('=== URL GERADA NO BACKEND ===');
        console.log('URL GERADA:', authUrl);

        return authUrl;
    }

    /**
     * Exchange authorization code for access tokens
     */
    async exchangeCode(code: string): Promise<StravaTokens> {
        const clientId = this.configService.get<string>('STRAVA_CLIENT_ID');
        const clientSecret = this.configService.get<string>('STRAVA_CLIENT_SECRET');

        try {
            const response = await this.fetchWithRetry(() =>
                axios.post(`${this.oauthUrl}/token`, {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error('Failed to exchange Strava code', error);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(refreshToken: string): Promise<StravaTokens> {
        const clientId = this.configService.get<string>('STRAVA_CLIENT_ID');
        const clientSecret = this.configService.get<string>('STRAVA_CLIENT_SECRET');

        try {
            const response = await this.fetchWithRetry(() =>
                axios.post(`${this.oauthUrl}/token`, {
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error('Failed to refresh Strava token', error);
            throw error;
        }
    }

    // ============================================
    // API METHODS (with caching & retry)
    // ============================================

    /**
     * Get athlete profile (no cache - rarely called)
     */
    async getAthlete(accessToken: string): Promise<StravaAthlete> {
        try {
            const response = await this.fetchWithRetry(() =>
                axios.get(`${this.baseUrl}/athlete`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error('Failed to get Strava athlete', error);
            throw error;
        }
    }

    /**
     * Get a specific activity by ID (without cache - use getActivityCached for caching)
     */
    async getActivity(activityId: number, accessToken: string): Promise<StravaActivity> {
        try {
            const response = await this.fetchWithRetry(() =>
                axios.get(`${this.baseUrl}/activities/${activityId}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get Strava activity ${activityId}`, error);
            throw error;
        }
    }

    /**
     * Get a specific activity by ID WITH CACHING.
     * Use this in queue processors to avoid duplicate requests.
     */
    async getActivityCached(activityId: number, accessToken: string): Promise<StravaActivity> {
        const cacheKey = this.cacheService.activityKey(activityId);

        // Check cache first
        const cached = this.cacheService.get<StravaActivity>(cacheKey);
        if (cached) {
            this.logger.debug(`Activity ${activityId} served from cache`);
            return cached;
        }

        // Fetch from API
        const activity = await this.getActivity(activityId, accessToken);

        // Cache the result
        this.cacheService.set(cacheKey, activity, 'ACTIVITY');

        return activity;
    }

    /**
     * Get athlete's recent activities
     */
    async getActivities(
        accessToken: string,
        page = 1,
        perPage = 30,
    ): Promise<StravaActivity[]> {
        try {
            const response = await this.fetchWithRetry(() =>
                axios.get(`${this.baseUrl}/athlete/activities`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { page, per_page: perPage },
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error('Failed to get Strava activities', error);
            throw error;
        }
    }

    // ============================================
    // WEBHOOK UTILS
    // ============================================

    /**
     * Verify webhook subscription challenge
     */
    verifyWebhook(mode: string, token: string, challenge: string): string | null {
        const verifyToken = this.configService.get<string>('STRAVA_VERIFY_TOKEN');

        if (mode === 'subscribe' && token === verifyToken) {
            return challenge;
        }
        return null;
    }

    /**
     * Get activities after a specific timestamp (for retroactive sync)
     * @param accessToken - Strava access token
     * @param afterTimestamp - Unix timestamp (seconds since epoch)
     */
    async getActivitiesAfter(
        accessToken: string,
        afterTimestamp: number,
    ): Promise<StravaActivity[]> {
        try {
            const response = await this.fetchWithRetry(() =>
                axios.get(`${this.baseUrl}/athlete/activities`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: {
                        after: afterTimestamp,
                        per_page: 50,  // Get up to 50 activities
                    },
                }),
            );
            return response.data;
        } catch (error) {
            this.logger.error('Failed to get Strava activities after timestamp', error);
            throw error;
        }
    }
}

