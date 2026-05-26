import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TreadmillSpeedSampleDto {
  /** Tempo decorrido em segundos desde o início do treino. */
  @IsNumber()
  t: number;

  /** Velocidade instantânea em km/h. */
  @IsNumber()
  kmh: number;

  /** Inclinação instantânea em % (opcional, se a esteira FTMS reportar). */
  @IsOptional()
  @IsNumber()
  incline?: number;
}

export class TreadmillDataDto {
  /** true se a esteira é FTMS (Smart); false se foi modo manual com slider. */
  @IsBoolean()
  is_smart: boolean;

  /** Nome do dispositivo conectado via BLE (ex.: "NoblePro E8") ou "Manual". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  device_name?: string;

  @IsOptional()
  @IsNumber()
  avg_speed_kmh?: number;

  @IsOptional()
  @IsNumber()
  max_speed_kmh?: number;

  @IsOptional()
  @IsNumber()
  avg_incline?: number;

  @IsOptional()
  @IsNumber()
  total_calories?: number;

  /** Amostras de velocidade ao longo do treino para reconstruir o gráfico. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TreadmillSpeedSampleDto)
  speed_samples?: TreadmillSpeedSampleDto[];
}
