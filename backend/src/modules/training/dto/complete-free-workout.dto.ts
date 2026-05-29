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
import { TreadmillDataDto } from './treadmill-data.dto';

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
   * Origem do registro. Default 'phone'.
   *  'apple_watch'    — corrida livre iniciada/finalizada no app companion do Apple Watch.
   *  'garmin_watch'   — corrida vinda do app Connect IQ no relógio Garmin via Bluetooth.
   *  'apple_health'   — corrida ingerida do HealthKit (iOS) via /devices/apple-health/sync.
   *  'health_connect' — corrida ingerida do Google Health Connect (Android) via
   *                     /devices/health-connect/sync (Galaxy Watch, Samsung Health, etc.).
   */
  @IsOptional()
  @IsIn([
    'phone',
    'apple_watch',
    'garmin_watch',
    'apple_health',
    'health_connect',
  ])
  source?:
    | 'phone'
    | 'apple_watch'
    | 'garmin_watch'
    | 'apple_health'
    | 'health_connect';

  /** Identificador externo (ex.: HKWorkout UUID, Garmin activity id) para dedup cross-source. */
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

  /**
   * Ambiente onde a corrida livre foi realizada. Default 'outdoor'.
   * 'treadmill' indica esteira — neste caso `route_points` pode vir vazio.
   */
  @IsOptional()
  @IsIn(['outdoor', 'treadmill'])
  environment?: 'outdoor' | 'treadmill';

  /** Metadados da esteira (Smart FTMS ou modo manual). */
  @IsOptional()
  @ValidateNested()
  @Type(() => TreadmillDataDto)
  treadmill_data?: TreadmillDataDto;
}
