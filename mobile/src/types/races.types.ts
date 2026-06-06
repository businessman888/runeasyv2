/**
 * Race types — mirror the backend `active_races` view (only active, future races).
 */

export type RaceLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
export type RaceTerrain = 'road' | 'trail' | 'track' | 'mixed';

export interface Race {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    race_date: string; // 'YYYY-MM-DD'
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
    level: RaceLevel;
    terrain: RaceTerrain | null;
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

export interface RaceSearchParams {
    search?: string;
    city?: string;
    state?: string;
    distance?: number;
    level?: RaceLevel;
    terrain?: RaceTerrain;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}
