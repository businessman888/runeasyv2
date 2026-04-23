import {
    IsArray,
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
}
