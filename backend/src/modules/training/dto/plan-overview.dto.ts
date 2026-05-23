/**
 * Response DTO for GET /training/plan/overview.
 *
 * Consolidates the active plan + all weeks + workouts grouped by week so the
 * mobile Goals screen can render with a single request.
 */

export type WeekPhase = 'base' | 'build' | 'peak' | 'taper';
export type WorkoutStatus = 'pending' | 'completed' | 'skipped' | 'missed';

export interface PlanWorkoutInstructionDto {
  type: 'warmup' | 'main' | 'cooldown';
  distance_km: number;
  pace_min: number;
  pace_max?: number | null;
}

export interface PlanWorkoutExecutedDto {
  distance_km: number;
  duration_seconds: number;
  pace_seconds_per_km: number;
}

export interface PlanWorkoutDto {
  id: string;
  day_of_week: string; // PT-BR short label: "Seg", "Ter", "Qua"...
  scheduled_date: string; // ISO date YYYY-MM-DD
  type: string; // 'easy_run', 'long_run'...
  title: string; // legível PT-BR ("Rodagem Leve", "Longão")
  distance_km: number;
  target_pace_seconds_per_km: number | null;
  instructions_json: PlanWorkoutInstructionDto[];
  status: WorkoutStatus;
  executed_data: PlanWorkoutExecutedDto | null;
}

export interface PlanWeekDto {
  week_number: number;
  phase: WeekPhase | string;
  phase_label: string; // PT-BR: "base", "desenvolvimento"...
  start_date: string;
  end_date: string;
  total_workouts: number;
  completed_workouts: number;
  is_current: boolean;
  workouts: PlanWorkoutDto[];
}

export interface PlanOverviewSummaryDto {
  plan_id: string;
  title: string; // "Plano de treino Meia Maratona"
  target_distance: string; // "Meia Maratona" | "10 Km"
  end_date: string;
  total_weeks: number;
  completed_weeks: number;
  current_week: number;
  /** REAL distance the user has actually run (sum of distance_run on completed workouts). Accumulates as they finish workouts. */
  total_distance_km: number;
  /** Planned total distance across the whole plan (sum of planned distance_km on every workout). Stays constant. */
  target_total_km: number;
  generation_status: 'partial' | 'generating' | 'complete' | 'failed' | null;
}

export interface PlanOverviewResponseDto {
  overview: PlanOverviewSummaryDto;
  weeks: PlanWeekDto[];
}
