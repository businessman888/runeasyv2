import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export type ActivityResultScope = 'plan' | 'activity';

export class RecentActivityResultsQueryDto {
  @IsIn(['plan', 'activity'])
  source: ActivityResultScope;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  limit?: number;
}

export interface ActivityResultRoutePointDto {
  latitude: number;
  longitude: number;
}

export interface ActivityResultBadgeDto {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}
