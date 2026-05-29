import { Injectable } from '@nestjs/common';
import { WearableActivity } from '../activity-sync.service';
import { HealthConnectActivityDto } from '../dto/health-connect-sync.dto';

/**
 * Extended WearableActivity carrying the GPS route + environment hint for
 * health_connect. gps_route is persisted as JSONB on the activities row;
 * environment ('outdoor' | 'treadmill') tells the downstream pipeline whether
 * the run had a real GPS track to expect.
 */
export interface HealthConnectWearableActivity extends WearableActivity {
  gps_route?: Array<{
    lat: number;
    lng: number;
    altitude?: number;
    timestamp: number;
  }>;
  environment: 'outdoor' | 'treadmill';
}

@Injectable()
export class HealthConnectNormalizer {
  /**
   * Convert a mobile-supplied HealthConnectActivityDto into the shape the
   * downstream ActivitySyncService.processDeviceLocalActivity expects.
   *
   * Returns `null` when the exercise_type is not running (caller must filter
   * out — we never insert non-running activities). This is defense-in-depth:
   * the mobile already filters, and the DTO's @IsIn restricts the enum, but
   * if either guard slips we still drop the record here.
   */
  normalize(
    dto: HealthConnectActivityDto,
    userId: string,
  ): HealthConnectWearableActivity | null {
    const environment = this.mapEnvironment(dto.exercise_type);
    if (!environment) return null;

    const distanceMeters = dto.distance_meters;
    const movingTime = dto.duration_seconds;

    // Average pace in min/km — same unit convention as other wearables here.
    let averagePace: number | undefined;
    if (distanceMeters > 0 && movingTime > 0) {
      const distanceKm = distanceMeters / 1000;
      const timeMinutes = movingTime / 60;
      averagePace = timeMinutes / distanceKm;
    }

    // Treadmill never has GPS — drop the field entirely so the downstream
    // upsert writes null on activities.gps_route, which is what the
    // RunSummary screen uses to switch into treadmill layout.
    const gpsRoute =
      environment === 'treadmill' ||
      !dto.gps_route ||
      dto.gps_route.length === 0
        ? undefined
        : dto.gps_route;

    return {
      // Prefix prevents collision with HKWorkout UUIDs (apple_health_*) and
      // Garmin/Fitbit/Polar IDs in the global `activities.external_id` UNIQUE.
      external_id: `hc_${dto.external_id}`,
      source: 'health_connect',
      user_id: userId,
      name: dto.source_name
        ? `Health Connect — ${dto.source_name}`
        : 'Health Connect Run',
      type: 'Run',
      start_date: dto.start_date,
      distance: distanceMeters,
      moving_time: movingTime,
      elapsed_time: movingTime,
      average_pace: averagePace,
      average_heartrate: dto.average_heartrate,
      max_heartrate: dto.max_heartrate,
      calories: dto.energy_burned_kcal,
      gps_route: gpsRoute,
      environment,
    };
  }

  /**
   * Map Health Connect exercise_type → internal environment.
   * Returns null for non-running types so the caller can skip.
   */
  private mapEnvironment(
    exerciseType?: string,
  ): 'outdoor' | 'treadmill' | null {
    switch (exerciseType) {
      case 'RUNNING':
      case 'RUNNING_OUTDOOR':
      case undefined:
        // Health Connect may publish RUNNING with no further qualifier;
        // treat as outdoor (matches the most common Galaxy Watch case).
        return 'outdoor';
      case 'RUNNING_TREADMILL':
        return 'treadmill';
      default:
        return null;
    }
  }
}
