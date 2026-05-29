import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

/**
 * Single GPS point from Health Connect ExerciseRoute.
 *
 * Mobile pre-normalizes the shape (lat/lng/altitude/timestamp epoch ms) so the
 * backend stays agnostic to the SDK's native LocationRecord structure.
 *
 * Treadmill runs (RUNNING_TREADMILL) never have GPS — the entire `gps_route`
 * field is optional on the parent ActivityDto and may be omitted.
 */
export class HealthConnectGpsPointDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsOptional()
  @IsNumber()
  altitude?: number;

  @IsNumber()
  timestamp: number; // epoch ms
}

/**
 * One running workout extracted from Health Connect on the mobile side.
 *
 * Mobile is responsible for filtering ExerciseSessionRecord to running types
 * only (RUNNING and RUNNING_TREADMILL); the normalizer rejects everything else.
 */
export class HealthConnectActivityDto {
  @IsString()
  external_id: string; // ExerciseSessionRecord.metadata.id (raw, normalizer adds 'hc_' prefix)

  @IsISO8601()
  start_date: string;

  @IsISO8601()
  end_date: string;

  @IsNumber()
  duration_seconds: number;

  @IsNumber()
  distance_meters: number;

  @IsOptional()
  @IsNumber()
  energy_burned_kcal?: number;

  @IsOptional()
  @IsNumber()
  average_heartrate?: number;

  @IsOptional()
  @IsNumber()
  max_heartrate?: number;

  /**
   * Health Connect ExerciseType identifier. Examples:
   *   - 'RUNNING' / 'RUNNING_OUTDOOR' → environment 'outdoor'
   *   - 'RUNNING_TREADMILL'           → environment 'treadmill'
   * Anything else is rejected by the normalizer (returns null).
   */
  @IsOptional()
  @IsIn(['RUNNING', 'RUNNING_OUTDOOR', 'RUNNING_TREADMILL'])
  exercise_type?: string;

  /**
   * Originating app that wrote the session (e.g., "Samsung Health", "Strava").
   * Surfaced into `activities.name` for context. Optional.
   */
  @IsOptional()
  @IsString()
  source_name?: string;

  /**
   * GPS route. Explicitly optional and nullable — treadmill sessions never
   * have it, and even outdoor sessions may omit it when the source app
   * doesn't publish a HealthConnect ExerciseRoute. The normalizer must
   * handle missing/empty arrays without throwing.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthConnectGpsPointDto)
  gps_route?: HealthConnectGpsPointDto[];
}

/**
 * Batch payload: mobile posts a list of recent runs in a single request.
 * The backend deduplicates per-activity; sending a batch reduces HTTP overhead.
 */
export class HealthConnectSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HealthConnectActivityDto)
  activities: HealthConnectActivityDto[];
}
