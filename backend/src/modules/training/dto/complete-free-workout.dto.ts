import {
    IsArray,
    IsIn,
    IsISO8601,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RoutePointDto } from './workout-tracking.dto';

export class CompleteFreeWorkoutDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RoutePointDto)
    route_points: RoutePointDto[];

    @IsNumber()
    total_distance_meters: number;

    @IsNumber()
    duration_seconds: number;

    /** ISO timestamp when the run actually started (used for title + activity record). */
    @IsOptional()
    @IsISO8601()
    started_at?: string;

    /** Optional city label captured from the device locale or reverse-geocoded. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    city?: string;

    /**
     * Origem do registro. Default 'phone'. 'apple_watch' indica corrida livre
     * iniciada/finalizada no app companion do Apple Watch.
     */
    @IsOptional()
    @IsIn(['phone', 'apple_watch'])
    source?: 'phone' | 'apple_watch';

    /** Identificador externo (ex.: HKWorkout UUID) para dedup cross-source. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    external_id?: string;

    /** FC média em BPM. */
    @IsOptional()
    @IsNumber()
    average_heartrate?: number;

    /** FC máxima em BPM. */
    @IsOptional()
    @IsNumber()
    max_heartrate?: number;

    /** Calorias ativas em kcal. */
    @IsOptional()
    @IsNumber()
    calories?: number;

    /** Pace médio em segundos por km. Quando ausente, calculado pelo backend. */
    @IsOptional()
    @IsNumber()
    avg_pace_seconds_per_km?: number;
}
