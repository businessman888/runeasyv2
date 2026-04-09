import { Injectable } from '@nestjs/common';
import { WearableActivity } from '../activity-sync.service';
import { AppleHealthActivityDto } from '../dto/apple-health-sync.dto';

/**
 * Extended WearableActivity carrying the GPS route points for apple_health.
 * gps_route is stored separately in the activities.gps_route jsonb column.
 */
export interface AppleHealthWearableActivity extends WearableActivity {
    gps_route?: Array<{
        lat: number;
        lng: number;
        altitude?: number;
        timestamp: number;
    }>;
}

@Injectable()
export class AppleHealthNormalizer {
    /**
     * Convert a mobile-supplied AppleHealthActivityDto into the shape
     * the ActivitySyncService expects, with an extra gps_route field.
     *
     * Mobile already filters to running workouts only; we prefix the
     * external_id to avoid colliding with UUIDs from other providers.
     */
    normalize(dto: AppleHealthActivityDto, userId: string): AppleHealthWearableActivity {
        const distanceMeters = dto.distance_meters;
        const movingTime = dto.duration_seconds;

        // Average pace in min/km (same unit as other wearables in this codebase)
        let averagePace: number | undefined;
        if (distanceMeters > 0 && movingTime > 0) {
            const distanceKm = distanceMeters / 1000;
            const timeMinutes = movingTime / 60;
            averagePace = timeMinutes / distanceKm;
        }

        return {
            external_id: `apple_health_${dto.external_id}`,
            source: 'apple_health',
            user_id: userId,
            name: dto.source_name ? `Apple Health — ${dto.source_name}` : 'Apple Health Run',
            type: 'Run',
            start_date: dto.start_date,
            distance: distanceMeters,
            moving_time: movingTime,
            elapsed_time: movingTime,
            average_pace: averagePace,
            average_heartrate: dto.average_heartrate,
            max_heartrate: dto.max_heartrate,
            calories: dto.total_energy_burned_kcal,
            gps_route: dto.gps_route,
        };
    }
}
