import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ActivitySyncService, WearableActivity } from './activity-sync.service';
import { DevicesService } from './devices.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';
import { SupabaseService } from '../../database/supabase.service';

@Processor('activity-sync-queue')
export class ActivitySyncProcessor extends WorkerHost {
    private readonly logger = new Logger(ActivitySyncProcessor.name);

    constructor(
        private readonly activitySyncService: ActivitySyncService,
        private readonly devicesService: DevicesService,
        private readonly fitbitOAuth: FitbitOAuthService,
        private readonly polarOAuth: PolarOAuthService,
        private readonly supabaseService: SupabaseService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);

        switch (job.name) {
            case 'sync-activity':
                return this.handleSyncActivity(job);

            case 'sync-batch':
                return this.handleSyncBatch(job);

            case 'fitbit-fetch-activity':
                return this.handleFitbitFetch(job);

            case 'polar-fetch-exercises':
                return this.handlePolarFetch(job);

            default:
                this.logger.warn(`Unknown job type: ${job.name}`);
                return { ignored: true };
        }
    }

    /**
     * Process a single wearable activity from a webhook notification.
     */
    private async handleSyncActivity(job: Job<WearableActivity>) {
        const activity = job.data;

        try {
            this.logger.log(
                `Syncing activity from ${activity.source}: ${activity.external_id} for user ${activity.user_id}`,
            );

            const result = await this.activitySyncService.processWearableActivity(activity);

            this.logger.log(`Activity sync result: ${result.action} (${result.activityId})`);
            return result;
        } catch (error) {
            this.logger.error(
                `Failed to sync activity ${activity.external_id} from ${activity.source}`,
                error,
            );
            throw error; // BullMQ will retry automatically
        }
    }

    /**
     * Process a batch of activities (e.g., initial sync after connecting a device).
     */
    private async handleSyncBatch(job: Job<{ activities: WearableActivity[] }>) {
        const { activities } = job.data;
        const results = [];

        this.logger.log(`Batch syncing ${activities.length} activities`);

        for (const activity of activities) {
            try {
                const result = await this.activitySyncService.processWearableActivity(activity);
                results.push({ externalId: activity.external_id, ...result });
            } catch (error) {
                this.logger.error(`Batch item failed: ${activity.external_id}`, error);
                results.push({ externalId: activity.external_id, action: 'error', error: (error as Error).message });
            }
        }

        const inserted = results.filter(r => r.action === 'inserted').length;
        const skipped = results.filter(r => r.action === 'skipped').length;
        const errors = results.filter(r => r.action === 'error').length;

        this.logger.log(`Batch complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);

        return { total: activities.length, inserted, skipped, errors, results };
    }

    /**
     * Fetch activity details from Fitbit API after webhook notification.
     * Looks up our user by Fitbit user ID, then fetches activity summary for the given date.
     */
    private async handleFitbitFetch(job: Job<{ fitbitUserId: string; date: string }>) {
        const { fitbitUserId, date } = job.data;

        // Find our user by Fitbit provider_user_id
        const { data: device } = await this.supabaseService
            .from('connected_devices')
            .select('user_id')
            .eq('provider', 'fitbit')
            .eq('provider_user_id', fitbitUserId)
            .single();

        if (!device) {
            this.logger.warn(`No user found for Fitbit user ${fitbitUserId}`);
            return { action: 'skipped', reason: 'user_not_found' };
        }

        const userId = device.user_id;

        // Get decrypted token (will be refreshed if needed by TokenRefreshService)
        const { accessToken } = await this.devicesService.getDecryptedToken(userId, 'fitbit');

        // Fetch activities for the date
        const response = await fetch(
            `https://api.fitbit.com/1/user/${fitbitUserId}/activities/date/${date}.json`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            },
        );

        if (!response.ok) {
            this.logger.error(`Fitbit API error: ${response.status}`);
            throw new Error(`Fitbit API error: ${response.status}`);
        }

        const data = await response.json();
        const activities: WearableActivity[] = (data.activities || [])
            .filter((a: any) => a.activityName?.toLowerCase().includes('run') || a.activityName?.toLowerCase().includes('walk'))
            .map((a: any) => this.normalizeFitbitActivity(a, userId));

        const results = [];
        for (const activity of activities) {
            const result = await this.activitySyncService.processWearableActivity(activity);
            results.push(result);
        }

        this.logger.log(`Fitbit fetch: processed ${activities.length} activities for user ${userId}`);
        return { processed: activities.length, results };
    }

    /**
     * Pull new exercises from Polar AccessLink after webhook notification.
     */
    private async handlePolarFetch(job: Job<{ polarUserId: string }>) {
        const { polarUserId } = job.data;

        // Find our user by Polar provider_user_id
        const { data: device } = await this.supabaseService
            .from('connected_devices')
            .select('user_id')
            .eq('provider', 'polar')
            .eq('provider_user_id', polarUserId)
            .single();

        if (!device) {
            this.logger.warn(`No user found for Polar user ${polarUserId}`);
            return { action: 'skipped', reason: 'user_not_found' };
        }

        const userId = device.user_id;
        const { accessToken } = await this.devicesService.getDecryptedToken(userId, 'polar');

        const exercises = await this.polarOAuth.listNewExercises(accessToken, Number(polarUserId));

        if (!exercises || exercises.length === 0) {
            return { action: 'no_new_data' };
        }

        const activities: WearableActivity[] = exercises
            .filter((e: any) => e['detailed-sport-info']?.toLowerCase().includes('running') || e.sport === 'RUNNING')
            .map((e: any) => this.normalizePolarExercise(e, userId));

        const results = [];
        for (const activity of activities) {
            const result = await this.activitySyncService.processWearableActivity(activity);
            results.push(result);
        }

        this.logger.log(`Polar fetch: processed ${activities.length} exercises for user ${userId}`);
        return { processed: activities.length, results };
    }

    // ---- Normalization helpers ----

    private normalizeFitbitActivity(raw: any, userId: string): WearableActivity {
        return {
            external_id: `fitbit_${raw.logId}`,
            source: 'fitbit',
            user_id: userId,
            name: raw.activityName || 'Fitbit Activity',
            type: raw.activityName?.toLowerCase().includes('run') ? 'Run' : 'Walk',
            start_date: raw.startTime || raw.startDate || new Date().toISOString(),
            distance: (raw.distance || 0) * 1000, // Fitbit returns km, we store meters
            moving_time: raw.activeDuration ? raw.activeDuration / 1000 : raw.duration / 1000, // ms to s
            elapsed_time: raw.duration ? raw.duration / 1000 : undefined,
            average_heartrate: raw.averageHeartRate || undefined,
            max_heartrate: raw.heartRateZones?.reduce((max: number, z: any) => Math.max(max, z.max || 0), 0) || undefined,
            calories: raw.calories || undefined,
            elevation_gain: raw.elevationGain || undefined,
        };
    }

    private normalizePolarExercise(raw: any, userId: string): WearableActivity {
        const durationMs = raw.duration ? this.parsePolarDuration(raw.duration) : 0;

        return {
            external_id: `polar_${raw.id}`,
            source: 'polar',
            user_id: userId,
            name: raw['detailed-sport-info'] || 'Polar Exercise',
            type: 'Run',
            start_date: raw['start-time'] || new Date().toISOString(),
            distance: raw.distance || 0, // Polar returns meters
            moving_time: durationMs / 1000,
            elapsed_time: durationMs / 1000,
            average_heartrate: raw['heart-rate']?.average || undefined,
            max_heartrate: raw['heart-rate']?.maximum || undefined,
            calories: raw.calories || undefined,
            elevation_gain: raw.ascent || undefined,
        };
    }

    /**
     * Parse Polar ISO 8601 duration (e.g., "PT1H30M15S") to milliseconds.
     */
    private parsePolarDuration(duration: string): number {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (!match) return 0;

        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        const seconds = parseFloat(match[3] || '0');

        return (hours * 3600 + minutes * 60 + seconds) * 1000;
    }
}
