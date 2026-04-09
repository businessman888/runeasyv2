import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator';

/**
 * Single GPS point from HKWorkoutRoute.
 * Mobile extracts and sends pre-normalized shape to keep backend agnostic.
 */
export class AppleHealthGpsPointDto {
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
 * One running workout extracted from HealthKit on the mobile side.
 * Mobile is responsible for filtering only HKWorkoutActivityTypeRunning.
 */
export class AppleHealthActivityDto {
    @IsString()
    external_id: string; // HKWorkout.uuid (raw, without source prefix)

    @IsString()
    start_date: string; // ISO timestamp

    @IsString()
    end_date: string; // ISO timestamp

    @IsNumber()
    duration_seconds: number;

    @IsNumber()
    distance_meters: number;

    @IsOptional()
    @IsNumber()
    total_energy_burned_kcal?: number;

    @IsOptional()
    @IsNumber()
    average_heartrate?: number;

    @IsOptional()
    @IsNumber()
    max_heartrate?: number;

    @IsOptional()
    @IsString()
    source_name?: string; // HKSourceRevision (e.g., "Apple Watch", "Nike Run Club")

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AppleHealthGpsPointDto)
    gps_route?: AppleHealthGpsPointDto[];
}

/**
 * Batch payload: mobile posts a list of recent runs.
 * The backend deduplicates per-activity; sending a batch reduces HTTP overhead.
 */
export class AppleHealthSyncDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => AppleHealthActivityDto)
    activities: AppleHealthActivityDto[];
}
