import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TreadmillDataDto } from './treadmill-data.dto';

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
   * 'apple_watch'    — corrida vinda do app companion no Apple Watch via WatchConnectivity.
   * 'garmin_watch'   — corrida vinda do app companion no Garmin via Connect IQ Mobile SDK.
   * 'apple_health'   — corrida ingerida do HealthKit (iOS) via /devices/apple-health/sync.
   *                    Pode ter vindo originalmente do Apple Watch, Nike Run Club, Strava, etc.
   * 'health_connect' — corrida ingerida do Google Health Connect (Android) via
   *                    /devices/health-connect/sync. Galaxy Watch publica aqui via Samsung Health.
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

  /**
   * Ambiente onde o treino foi realizado. Default 'outdoor' (corrida ao ar
   * livre com GPS). 'treadmill' indica corrida em esteira — neste caso
   * `route_points` pode vir vazio e `treadmill_data` traz as métricas FTMS
   * ou do modo manual.
   */
  @IsOptional()
  @IsIn(['outdoor', 'treadmill'])
  environment?: 'outdoor' | 'treadmill';

  /** Metadados da esteira (Smart FTMS ou modo manual). */
  @IsOptional()
  @ValidateNested()
  @Type(() => TreadmillDataDto)
  treadmill_data?: TreadmillDataDto;

  /**
   * Percepção de esforço REPORTADA pelo atleta (Borg CR10, 1–10). Opcional —
   * nunca bloqueia a conclusão.
   *
   * O app coleta o RPE DEPOIS da conclusão (RunSummary / CoachAnalysis, sem
   * pressão de tempo) e envia por `PATCH /training/workouts/:id/rpe`, porque a
   * WorkoutProcessingScreen submete a conclusão já no mount — antes de qualquer
   * interação possível. Este campo existe para as origens que JÁ conhecem o RPE
   * no momento do envio (fila offline que carregava o valor, relógio, importação
   * de terceiro) chegarem sem um segundo roundtrip.
   *
   * NÃO confundir com `metadata.perceived_effort`, que é o esforço PRESCRITO
   * pela IA.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rpe?: number;
}
