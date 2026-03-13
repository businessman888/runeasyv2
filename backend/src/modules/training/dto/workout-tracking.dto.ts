import { IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RoutePointDto {
    @IsNumber()
    latitude: number;

    @IsNumber()
    longitude: number;

    @IsOptional()
    @IsNumber()
    altitude?: number | null;

    @IsNumber()
    timestamp: number;

    @IsOptional()
    @IsNumber()
    speed?: number | null;

    @IsOptional()
    @IsNumber()
    accuracy?: number | null;
}

export class CreateWorkoutTrackingDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RoutePointDto)
    route_points: RoutePointDto[];

    @IsNumber()
    total_distance_meters: number;

    @IsNumber()
    duration_seconds: number;
}
