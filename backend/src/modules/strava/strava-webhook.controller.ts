import {
    Controller,
    Get,
    Post,
    Query,
    Body,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StravaService } from './strava.service';
import { SupabaseService } from '../../database';
import { FeedbackAIService } from '../feedback/feedback-ai.service';
import { GamificationService } from '../gamification/gamification.service';

interface WebhookEvent {
    object_type: 'activity' | 'athlete';
    object_id: number;
    aspect_type: 'create' | 'update' | 'delete';
    owner_id: number;
    subscription_id: number;
    event_time: number;
    updates?: Record<string, unknown>;
}

@Controller('webhooks/strava')
export class StravaWebhookController {
    private readonly logger = new Logger(StravaWebhookController.name);

    constructor(
        private readonly stravaService: StravaService,
        private readonly supabaseService: SupabaseService,
        private readonly configService: ConfigService,
        private readonly feedbackAIService: FeedbackAIService,
        private readonly gamificationService: GamificationService,
    ) { }

    /**
     * GET /webhooks/strava - Strava webhook subscription verification
     * Called by Strava when setting up the webhook subscription
     * 
     * This endpoint is PUBLIC and should not require authentication
     */
    @Get()
    verifySubscription(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
    ) {
        this.logger.log(`Webhook verification request - mode: ${mode}, token: ${token}`);

        // Verify that mode is 'subscribe' AND token matches
        const expectedToken = 'runeasy_webhook_verify_token_2025';

        if (mode === 'subscribe' && token === expectedToken) {
            this.logger.log('✅ Webhook verification successful');
            // Return exactly as Strava expects
            return { 'hub.challenge': challenge };
        }

        this.logger.warn(`❌ Webhook verification failed - Invalid mode or token`);
        throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    /**
     * Handle incoming webhook events (POST request from Strava)
     */
    @Post()
    async handleWebhookEvent(@Body() event: WebhookEvent) {
        this.logger.log(`Received Strava webhook: ${JSON.stringify(event)}`);

        // Only process activity create events for now
        if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
            return { status: 'ignored', reason: 'Not an activity create event' };
        }

        try {
            // Find user by Strava athlete ID
            const { data: user, error: userError } = await this.supabaseService
                .from('users')
                .select('id, strava_access_token, strava_refresh_token, strava_token_expires_at')
                .eq('strava_athlete_id', event.owner_id)
                .single();

            if (userError || !user) {
                this.logger.warn(`User not found for athlete_id: ${event.owner_id}`);
                return { status: 'ignored', reason: 'User not found' };
            }

            // Check if token needs refresh
            let accessToken = user.strava_access_token;
            if (new Date(user.strava_token_expires_at) < new Date()) {
                this.logger.log('Refreshing Strava token...');
                const newTokens = await this.stravaService.refreshToken(user.strava_refresh_token);
                accessToken = newTokens.access_token;

                // Update tokens in database
                await this.supabaseService
                    .from('users')
                    .update({
                        strava_access_token: newTokens.access_token,
                        strava_refresh_token: newTokens.refresh_token,
                        strava_token_expires_at: new Date(newTokens.expires_at * 1000).toISOString(),
                    })
                    .eq('id', user.id);
            }

            // Fetch full activity details from Strava
            const activity = await this.stravaService.getActivity(event.object_id, accessToken);

            // Only process running activities
            if (!['Run', 'TrailRun', 'VirtualRun'].includes(activity.type)) {
                return { status: 'ignored', reason: 'Not a running activity' };
            }

            // Calculate pace (min/km)
            const averagePace = activity.moving_time > 0 && activity.distance > 0
                ? (activity.moving_time / 60) / (activity.distance / 1000)
                : null;

            const maxPace = activity.max_speed > 0
                ? 1000 / activity.max_speed / 60
                : null;

            // Save activity to database
            const { data: savedActivity, error: saveError } = await this.supabaseService
                .from('strava_activities')
                .insert({
                    id: activity.id,
                    user_id: user.id,
                    name: activity.name,
                    type: activity.type,
                    start_date: activity.start_date,
                    distance: activity.distance,
                    moving_time: activity.moving_time,
                    elapsed_time: activity.elapsed_time,
                    average_pace: averagePace,
                    max_pace: maxPace,
                    elevation_gain: activity.total_elevation_gain,
                    average_heartrate: activity.average_heartrate,
                    max_heartrate: activity.max_heartrate,
                    calories: activity.calories,
                    splits_metric: activity.splits_metric,
                    map_polyline: activity.map?.summary_polyline,
                    start_latlng: activity.start_latlng,
                    raw_data: activity,
                })
                .select()
                .single();

            if (saveError) {
                this.logger.error('Failed to save activity', saveError);
                throw saveError;
            }

            // Try to link with scheduled workout
            const activityDate = new Date(activity.start_date).toISOString().split('T')[0];
            const { data: workout } = await this.supabaseService
                .from('workouts')
                .select('id, distance_km')
                .eq('user_id', user.id)
                .eq('scheduled_date', activityDate)
                .eq('status', 'pending')
                .single();

            let goalMet = false;
            let xpEarned = 0;
            const distanceKm = activity.distance / 1000;

            if (workout) {
                await this.supabaseService
                    .from('workouts')
                    .update({
                        strava_activity_id: activity.id,
                        status: 'completed',
                    })
                    .eq('id', workout.id);

                this.logger.log(`Linked activity ${activity.id} to workout ${workout.id}`);

                // Check if goal was met (at least 90% of planned distance)
                const plannedDistanceKm = workout.distance_km || 0;
                goalMet = distanceKm >= plannedDistanceKm * 0.9;

                if (goalMet) {
                    // Calculate XP based on distance: 100 XP per km
                    xpEarned = Math.round(distanceKm * 100);
                    this.logger.log(`Goal met! ${distanceKm.toFixed(2)} km >= ${(plannedDistanceKm * 0.9).toFixed(2)} km (90% of ${plannedDistanceKm} km)`);
                } else {
                    this.logger.log(`Goal NOT met! ${distanceKm.toFixed(2)} km < ${(plannedDistanceKm * 0.9).toFixed(2)} km (90% of ${plannedDistanceKm} km)`);
                }

                // Generate AI feedback asynchronously (fire and forget)
                this.generateFeedbackAsync(user.id, workout.id, savedActivity.id);
            }

            // Update user streak and last activity date
            const today = new Date().toISOString().split('T')[0];
            const { data: userLevel } = await this.supabaseService
                .from('user_levels')
                .select('current_streak, last_activity_date, best_streak')
                .eq('user_id', user.id)
                .single();

            if (userLevel) {
                let newStreak = 1;
                const lastDate = userLevel.last_activity_date;

                if (lastDate) {
                    const daysDiff = Math.floor(
                        (new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (daysDiff === 1) {
                        newStreak = userLevel.current_streak + 1;
                    } else if (daysDiff === 0) {
                        newStreak = userLevel.current_streak;
                    }
                }

                await this.supabaseService
                    .from('user_levels')
                    .update({
                        current_streak: newStreak,
                        best_streak: Math.max(newStreak, userLevel.best_streak || 0),
                        last_activity_date: today,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', user.id);
            }

            // Only add XP if goal was met
            if (xpEarned > 0) {
                await this.supabaseService.from('points_history').insert({
                    user_id: user.id,
                    points: xpEarned,
                    reason: `Treino completado - ${distanceKm.toFixed(2)}km`,
                    reference_type: 'activity',
                    reference_id: savedActivity.id,
                });

                // Update total points - get sum from points_history
                const { data: pointsData } = await this.supabaseService
                    .from('points_history')
                    .select('points')
                    .eq('user_id', user.id);

                const totalPoints = (pointsData || []).reduce((sum, p) => sum + (p.points || 0), 0);

                // Calculate new level using gamification service
                const currentLevel = this.gamificationService.calculateLevel(totalPoints);

                await this.supabaseService
                    .from('user_levels')
                    .update({
                        total_points: totalPoints,
                        current_level: currentLevel,
                    })
                    .eq('user_id', user.id);

                this.logger.log(`User ${user.id} earned ${xpEarned} XP (${distanceKm.toFixed(2)}km). Total: ${totalPoints} XP, Level: ${currentLevel}`);
            } else {
                this.logger.log(`User ${user.id} did not earn XP - goal not met or no linked workout`);
            }

            this.logger.log(`Successfully processed activity ${activity.id}`);
            return { status: 'processed', activity_id: activity.id };
        } catch (error) {
            this.logger.error('Failed to process webhook event', error);
            throw new HttpException('Processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Generate AI feedback asynchronously after workout completion
     * This is fire-and-forget to not block the webhook response
     */
    private async generateFeedbackAsync(
        userId: string,
        workoutId: string,
        activityId: string,
    ): Promise<void> {
        try {
            await this.feedbackAIService.generateFeedback(userId, workoutId, activityId);
            this.logger.log(`AI feedback generated for workout ${workoutId}`);
        } catch (error) {
            // Log error but don't throw - this is fire and forget
            this.logger.error(`Failed to generate feedback for workout ${workoutId}`, error);
        }
    }
}
