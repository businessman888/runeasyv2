export { VolumePlannerService } from './volume-planner.service';
export { VolumePlannerModule } from './volume-planner.module';
export {
  MIN_REPS,
  MIN_WARMUP_KM,
  MIN_COOLDOWN_KM,
  WEEKLY_TOTAL_TOLERANCE_KM,
} from './volume-planner.constants';
export type { Phases, SkeletonInput, WalkRunInput } from './volume-planner.service';
export type {
  WeekPhase,
  CapacityInput,
  EffectiveCapacity,
  ViabilityResult,
  WorkoutSlot,
  WeekSkeleton,
  WalkRunInterval,
  WalkRunWeek,
  PlanViability,
} from './volume-planner.types';
