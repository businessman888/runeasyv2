import { Injectable, Logger } from '@nestjs/common';
import { StravaService, StravaActivity } from './strava.service';
import { SupabaseService } from '../../database';
import { FeedbackAIService } from '../feedback/feedback-ai.service';

export interface SyncResult {
    synced: number;
    checked: number;
    message: string;
    details: Array<{
        activity_id: number;
        workout_id: string | null;
        action: 'linked' | 'already_synced' | 'no_match';
    }>;
}

@Injectable()
export class StravaSyncService {
    private readonly logger = new Logger(StravaSyncService.name);

    constructor(
        private readonly stravaService: StravaService,
        private readonly supabaseService: SupabaseService,
        private readonly feedbackAIService: FeedbackAIService,
    ) { }

    /**
     * Sync recent Strava activities with scheduled workouts.
     * Used to recover missed webhook events.
     * @param userId - The user ID to sync
     * @param hoursBack - How many hours back to check (default: 48)
     */
    async syncRecentActivities(userId: string, hoursBack = 48): Promise<SyncResult> {
        this.logger.log(`Starting retroactive sync for user ${userId} (last ${hoursBack}h)`);

        const result: SyncResult = {
            synced: 0,
            checked: 0,
            message: '',
            details: [],
        };

        try {
            // Get user's Strava tokens
            const { data: user, error: userError } = await this.supabaseService
                .from('users')
                .select('id, strava_access_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id')
                .eq('id', userId)
                .single();

            if (userError || !user) {
                result.message = 'User not found';
                return result;
            }

            if (!user.strava_access_token) {
                result.message = 'User not connected to Strava';
                return result;
            }

            // Get valid access token (refresh if needed)
            const accessToken = await this.getValidAccessToken(user);

            // Calculate timestamp for X hours ago
            const afterTimestamp = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);

            // Fetch recent activities from Strava
            const activities = await this.stravaService.getActivitiesAfter(accessToken, afterTimestamp);
            result.checked = activities.length;

            this.logger.log(`Found ${activities.length} Strava activities in last ${hoursBack}h`);

            // Process each running activity
            for (const activity of activities) {
                // Only process running activities
                if (!['Run', 'TrailRun', 'VirtualRun'].includes(activity.type)) {
                    continue;
                }

                const syncDetail = await this.processActivity(userId, activity);
                result.details.push(syncDetail);

                if (syncDetail.action === 'linked') {
                    result.synced++;
                }
            }

            result.message = result.synced > 0
                ? `Sincronizados ${result.synced} treino(s) de ${result.checked} atividade(s)`
                : `Nenhum treino novo para sincronizar (${result.checked} atividades verificadas)`;

            this.logger.log(`Sync complete: ${result.message}`);
            return result;

        } catch (error) {
            this.logger.error('Sync failed', error);
            result.message = 'Erro ao sincronizar atividades';
            return result;
        }
    }

    /**
     * Process a single activity - check if already synced, link to workout if found
     */
    private async processActivity(
        userId: string,
        activity: StravaActivity,
    ): Promise<{ activity_id: number; workout_id: string | null; action: 'linked' | 'already_synced' | 'no_match' }> {
        const activityId = activity.id;

        // Check if activity already exists in our database (idempotency)
        const { data: existingActivity } = await this.supabaseService
            .from('strava_activities')
            .select('id')
            .eq('id', activityId)
            .single();

        if (existingActivity) {
            return { activity_id: activityId, workout_id: null, action: 'already_synced' };
        }

        // Calculate pace
        const averagePace = activity.moving_time > 0 && activity.distance > 0
            ? (activity.moving_time / 60) / (activity.distance / 1000)
            : null;

        const maxPace = activity.max_speed > 0
            ? 1000 / activity.max_speed / 60
            : null;

        // Save activity to database (upsert for safety)
        const { data: savedActivity, error: saveError } = await this.supabaseService
            .from('strava_activities')
            .upsert({
                id: activity.id,
                user_id: userId,
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
            }, { onConflict: 'id' })
            .select()
            .single();

        if (saveError) {
            this.logger.error(`Failed to save activity ${activityId}`, saveError);
            return { activity_id: activityId, workout_id: null, action: 'no_match' };
        }

        // Try to link with scheduled workout
        const workoutId = await this.linkWithWorkout(userId, activity, savedActivity.id);

        if (workoutId) {
            // Update streak and points
            await this.updateUserStreak(userId);
            await this.addActivityPoints(userId, savedActivity.id);

            return { activity_id: activityId, workout_id: workoutId, action: 'linked' };
        }

        return { activity_id: activityId, workout_id: null, action: 'no_match' };
    }

    /**
     * Link activity with scheduled workout (pending or missed)
     */
    private async linkWithWorkout(
        userId: string,
        activity: StravaActivity,
        savedActivityId: string,
    ): Promise<string | null> {
        const activityDate = new Date(activity.start_date).toISOString().split('T')[0];

        // Find pending or missed workout for this date that isn't already linked
        const { data: workout } = await this.supabaseService
            .from('workouts')
            .select('id, status')
            .eq('user_id', userId)
            .eq('scheduled_date', activityDate)
            .in('status', ['pending', 'missed'])
            .is('strava_activity_id', null)  // Not already linked
            .single();

        if (workout) {
            await this.supabaseService
                .from('workouts')
                .update({
                    strava_activity_id: activity.id,
                    status: 'completed',
                })
                .eq('id', workout.id);

            this.logger.log(`Linked activity ${activity.id} to workout ${workout.id} (was ${workout.status})`);

            // Generate AI feedback asynchronously (don't let errors fail the sync)
            try {
                this.generateFeedbackAsync(userId, workout.id, savedActivityId);
            } catch (error) {
                this.logger.warn(`Failed to generate feedback for workout ${workout.id}`, error);
            }

            return workout.id;
        }

        return null;
    }

    /**
     * Get valid access token, refreshing if expired
     */
    private async getValidAccessToken(user: any): Promise<string> {
        let accessToken = user.strava_access_token;

        if (new Date(user.strava_token_expires_at) < new Date()) {
            this.logger.log('Refreshing Strava token...');
            const newTokens = await this.stravaService.refreshToken(user.strava_refresh_token);
            accessToken = newTokens.access_token;

            await this.supabaseService
                .from('users')
                .update({
                    strava_access_token: newTokens.access_token,
                    strava_refresh_token: newTokens.refresh_token,
                    strava_token_expires_at: new Date(newTokens.expires_at * 1000).toISOString(),
                })
                .eq('id', user.id);
        }

        return accessToken;
    }

    /**
     * Update user streak and last activity date
     */
    private async updateUserStreak(userId: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const { data: userLevel } = await this.supabaseService
            .from('user_levels')
            .select('current_streak, last_activity_date, best_streak')
            .eq('user_id', userId)
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
                .eq('user_id', userId);
        }
    }

    /**
     * Add points for completing an activity
     */
    private async addActivityPoints(userId: string, activityId: string): Promise<void> {
        const { data: workout } = await this.supabaseService
            .from('workouts')
            .select('id')
            .eq('strava_activity_id', activityId)
            .single();

        const points = workout ? 75 : 50;

        await this.supabaseService.from('points_history').insert({
            user_id: userId,
            points,
            reason: workout ? 'Treino planejado completado (sync)' : 'Corrida completada (sync)',
            reference_type: 'activity',
            reference_id: activityId,
        });

        const { data: pointsData } = await this.supabaseService
            .from('points_history')
            .select('points')
            .eq('user_id', userId);

        const totalPoints = (pointsData || []).reduce((sum, p) => sum + (p.points || 0), 0);

        await this.supabaseService
            .from('user_levels')
            .update({ total_points: totalPoints })
            .eq('user_id', userId);
    }

    /**
     * Generate AI feedback asynchronously
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
            this.logger.error(`Failed to generate feedback for workout ${workoutId}`, error);
        }
    }
}
