import {
    IsDateString,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export const MANUAL_WORKOUT_TYPES = [
    'easy_run',     // Rodagem
    'long_run',     // Longão
    'intervals',    // Intervalados
    'fartlek',      // Fartlek
    'tempo',        // Tempo Run
    'recovery',     // Recuperação
    'progressive',  // Progressivo
] as const;

export type ManualWorkoutType = (typeof MANUAL_WORKOUT_TYPES)[number];

export class CreateManualWorkoutDto {
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    title: string;

    @IsString()
    @IsIn(MANUAL_WORKOUT_TYPES as unknown as string[])
    type: ManualWorkoutType;

    /** ISO date (YYYY-MM-DD) when the workout is scheduled */
    @IsDateString()
    scheduled_date: string;

    @IsNumber()
    @Min(0.1)
    distance_km: number;

    /** Pace meta in seconds per km (e.g. 360 = 6:00/km) */
    @IsInt()
    @Min(60)
    target_pace_seconds: number;

    /** Total duration in seconds (calculated client-side as distance * pace) */
    @IsInt()
    @Min(1)
    target_duration_seconds: number;

    /** Optional time of day (HH:mm or HH:mm:ss). Defaults to '05:00' on the table. */
    @IsOptional()
    @IsString()
    scheduled_time?: string;
}
