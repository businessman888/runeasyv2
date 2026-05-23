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

  /**
   * Origem do registro. Default 'phone' (corrida tracked pelo iPhone via expo-location).
   * 'apple_watch' indica corrida vinda do app companion no Apple Watch via WatchConnectivity.
   * 'garmin_watch' indica corrida vinda do app companion no Garmin via Connect IQ Mobile SDK.
   */
  @IsOptional()
  @IsIn(['phone', 'apple_watch', 'garmin_watch'])
  source?: 'phone' | 'apple_watch' | 'garmin_watch';

  /**
   * Identificador externo da corrida (ex.: HKWorkout UUID, Garmin activity id
   * ou `apple_watch_<workoutId>`). Usado para deduplicação e cross-source matching.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_id?: string;

  /**
   * Modelo do relógio Garmin (ex.: "fēnix 7 Pro"). Populado quando
   * source = 'garmin_watch'.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  garmin_device_name?: string;

  /** Frequência cardíaca média em BPM. */
  @IsOptional()
  @IsNumber()
  average_heartrate?: number;

  /** Frequência cardíaca máxima em BPM. */
  @IsOptional()
  @IsNumber()
  max_heartrate?: number;

  /** Calorias ativas em kcal (estimativa do HealthKit ou wearable). */
  @IsOptional()
  @IsNumber()
  calories?: number;

  /**
   * Pace médio em segundos por km. Quando ausente, é calculado pelo backend
   * a partir de duration_seconds / distance.
   */
  @IsOptional()
  @IsNumber()
  avg_pace_seconds_per_km?: number;

  /**
   * ISO 8601 do início da corrida. Importante quando a corrida foi iniciada
   * fora do iPhone (Apple Watch sem iPhone, sync atrasado, etc.).
   * Quando ausente, o backend assume `now - duration_seconds`.
   */
  @IsOptional()
  @IsISO8601()
  started_at?: string;
}
