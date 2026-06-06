import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database';
import { RaceQueryDto } from './dto/race-query.dto';

/**
 * Shape returned by the `active_races` view (status='active' AND race_date >= today,
 * with a computed days_until_race). This is the only race surface the app consumes.
 */
export interface Race {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  race_date: string;
  race_time: string | null;
  registration_deadline: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  venue: string | null;
  latitude: number | null;
  longitude: number | null;
  distances: number[];
  distances_labels: string[];
  main_distance: number;
  level: 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
  terrain: 'road' | 'trail' | 'track' | 'mixed' | null;
  is_championship: boolean | null;
  series_name: string | null;
  tags: string[] | null;
  registration_url: string | null;
  official_website: string | null;
  image_url: string | null;
  image_thumbnail_url: string | null;
  price_min: number | null;
  price_max: number | null;
  is_free: boolean | null;
  organizer_name: string | null;
  days_until_race: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps the onboarding distance goal to the race levels worth suggesting.
const GOAL_LEVEL_MAP: Record<string, string[]> = {
  '5k': ['beginner', 'all_levels'],
  '10k': ['beginner', 'intermediate', 'all_levels'],
  half_marathon: ['intermediate', 'all_levels'],
  marathon: ['advanced', 'all_levels'],
  general_fitness: ['beginner', 'all_levels'],
};

@Injectable()
export class RacesService {
  private readonly logger = new Logger(RacesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Lists active races with optional filters. Reads from the `active_races` view,
   * which already enforces status='active' AND race_date >= CURRENT_DATE.
   */
  async findActive(query: RaceQueryDto): Promise<Race[]> {
    let q = this.supabase
      .from('active_races')
      .select('*')
      .order('race_date', { ascending: true });

    if (query.search) {
      q = q.ilike('name', `%${query.search}%`);
    }
    if (query.city) {
      q = q.ilike('city', `%${query.city}%`);
    }
    if (query.state) {
      q = q.eq('state', query.state.toUpperCase());
    }
    if (query.distance != null && !Number.isNaN(query.distance)) {
      q = q.contains('distances', [query.distance]);
    }
    if (query.level) {
      q = q.in('level', [query.level, 'all_levels']);
    }
    if (query.terrain) {
      q = q.eq('terrain', query.terrain);
    }
    if (query.dateFrom) {
      q = q.gte('race_date', query.dateFrom);
    }
    if (query.dateTo) {
      q = q.lte('race_date', query.dateTo);
    }

    const { data, error } = await q.limit(query.limit ?? 50);
    if (error) {
      this.logger.error(`findActive failed: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []) as Race[];
  }

  /** Fetches a single active race by UUID or slug. */
  async findOne(idOrSlug: string): Promise<Race> {
    const column = UUID_RE.test(idOrSlug) ? 'id' : 'slug';
    const { data, error } = await this.supabase
      .from('active_races')
      .select('*')
      .eq(column, idOrSlug)
      .single();

    if (error || !data) {
      throw new NotFoundException('Prova não encontrada ou não disponível');
    }
    return data as Race;
  }

  /** Suggestions based on the user's onboarding distance goal. */
  async getSuggestedRaces(userId: string): Promise<Race[]> {
    const { data: onboarding } = await this.supabase
      .from('user_onboarding')
      .select('goal')
      .eq('user_id', userId)
      .single();

    const levels =
      GOAL_LEVEL_MAP[onboarding?.goal ?? 'general_fitness'] ??
      GOAL_LEVEL_MAP.general_fitness;

    const { data, error } = await this.supabase
      .from('active_races')
      .select('*')
      .in('level', levels)
      .order('race_date', { ascending: true })
      .limit(10);

    if (error) {
      this.logger.error(`getSuggestedRaces failed: ${error.message}`);
      return [];
    }
    return (data ?? []) as Race[];
  }
}
