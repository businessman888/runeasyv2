import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DISTANCE_GOALS = ['5k', '10k', 'half_marathon', 'marathon'] as const;
const TRAINING_DAYS = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const;

export class PaceGoalFeasibilityDto {
  @IsIn(DISTANCE_GOALS)
  distance_goal: string;

  @IsString()
  @Matches(/^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/)
  time_goal: string;

  @IsInt()
  @Min(4)
  @Max(24)
  duration_weeks: number;
}

export class CustomizePlanDto extends PaceGoalFeasibilityDto {
  @IsIn(['distance', 'pace'])
  goal_kind: 'distance' | 'pace';

  @IsOptional()
  @IsString()
  time_goal: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(TRAINING_DAYS, { each: true })
  training_days: string[];

  @IsOptional()
  @IsString()
  intense_day?: string;

  @IsOptional()
  @IsString()
  target_pace?: string;
}
