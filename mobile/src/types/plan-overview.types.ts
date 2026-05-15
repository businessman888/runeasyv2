export type PlanWeekPhase = 'base' | 'build' | 'peak' | 'taper' | string;
export type PlanWorkoutStatus = 'pending' | 'completed' | 'skipped' | 'missed';

export interface PlanWorkoutInstruction {
    type: 'warmup' | 'main' | 'cooldown';
    distance_km: number;
    pace_min: number;
    pace_max?: number | null;
}

export interface PlanWorkoutExecuted {
    distance_km: number;
    duration_seconds: number;
    pace_seconds_per_km: number;
}

export interface PlanWorkout {
    id: string;
    day_of_week: string;
    scheduled_date: string;
    type: string;
    title: string;
    distance_km: number;
    target_pace_seconds_per_km: number | null;
    instructions_json: PlanWorkoutInstruction[];
    status: PlanWorkoutStatus;
    executed_data: PlanWorkoutExecuted | null;
}

export interface PlanWeek {
    week_number: number;
    phase: PlanWeekPhase;
    phase_label: string;
    start_date: string;
    end_date: string;
    total_workouts: number;
    completed_workouts: number;
    is_current: boolean;
    workouts: PlanWorkout[];
}

export interface PlanOverviewSummary {
    plan_id: string;
    title: string;
    target_distance: string;
    end_date: string;
    total_weeks: number;
    completed_weeks: number;
    current_week: number;
    total_distance_km: number;
    generation_status: 'partial' | 'generating' | 'complete' | 'failed' | null;
}

export interface PlanOverviewResponse {
    overview: PlanOverviewSummary;
    weeks: PlanWeek[];
}
