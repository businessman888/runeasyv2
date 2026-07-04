import { IsDateString, IsEnum, IsOptional } from 'class-validator';

/** Which table the period summary aggregates. */
export enum StatsScope {
  activities = 'activities',
  workouts = 'workouts',
}

/** Granularity of the period + chart breakdown. */
export enum StatsPeriod {
  week = 'week',
  month = 'month',
}

/**
 * Query for `GET /stats/period-summary`. All params arrive as strings from the
 * query string; class-validator validates them directly (no transform needed).
 */
export class PeriodSummaryQueryDto {
  @IsEnum(StatsScope)
  scope: StatsScope;

  @IsEnum(StatsPeriod)
  period: StatsPeriod;

  /** Anchor day (YYYY-MM-DD, São Paulo). Defaults to today when omitted. */
  @IsOptional()
  @IsDateString()
  reference_date?: string;
}

export interface PeriodBreakdownItem {
  label: string;
  distance_km: number;
}

export interface PeriodSummaryResponse {
  distance_km: number;
  time_minutes: number;
  frequency: { value: number; total: number };
  breakdown: PeriodBreakdownItem[];
}
