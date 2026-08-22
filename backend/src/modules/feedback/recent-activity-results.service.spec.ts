import { RecentActivityResultsService } from './recent-activity-results.service';
import { SupabaseService } from '../../database';

interface QueryResult {
  data: Record<string, unknown>[];
  error: null;
}

function query(result: QueryResult) {
  const builder = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    not: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockImplementation(() => Promise.resolve(result));
  return builder;
}

describe('RecentActivityResultsService', () => {
  it('returns a compact outdoor route, real metric series and linked badges', async () => {
    const route = Array.from({ length: 120 }, (_, index) => ({
      latitude: -23.55 + index * 0.0001,
      longitude: -46.63 + index * 0.0001,
      altitude: 720 + (index % 7),
      timestamp: 1_700_000_000_000 + index * 5_000,
      speed: 3,
    }));
    const resultsByTable = {
      workouts: query({
        data: [
          {
            id: 'workout-1',
            activity_id: 'activity-1',
            source: 'plan',
            title: 'Rodagem leve',
            distance_km: 5,
            created_at: '2026-08-21T10:00:00Z',
          },
        ],
        error: null,
      }),
      activities: query({
        data: [
          {
            id: 'activity-1',
            name: 'Corrida RunEasy',
            distance: 5_120,
            moving_time: 1_800,
            average_pace: 351,
            elevation_gain: 42,
            start_date: '2026-08-21T10:00:00Z',
            gps_route: route,
            environment: 'outdoor',
          },
        ],
        error: null,
      }),
      ai_feedbacks: query({
        data: [
          {
            id: 'feedback-1',
            activity_id: 'activity-1',
            workout_id: 'workout-1',
            status: 'completed',
            hero_message: 'Bom treino',
            created_at: '2026-08-21T10:10:00Z',
          },
        ],
        error: null,
      }),
      workout_routes: query({ data: [], error: null }),
      user_badges: query({
        data: [
          {
            activity_id: 'activity-1',
            badges: {
              id: 'badge-1',
              name: 'Primeiros 5 km',
              slug: 'primeiros_5k',
              icon: 'shield',
            },
          },
        ],
        error: null,
      }),
    };
    const supabase = {
      from: jest.fn(
        (table: keyof typeof resultsByTable) => resultsByTable[table],
      ),
    } as unknown as SupabaseService;
    const service = new RecentActivityResultsService(supabase);

    const result = await service.getRecent('user-1', 'plan', 5);

    expect(result).toHaveLength(1);
    expect(result[0].activity.route_preview).toHaveLength(80);
    expect(result[0].activity.metric_series.pace.length).toBeGreaterThan(0);
    expect(result[0].achievements).toEqual({
      count: 1,
      badges: [
        {
          id: 'badge-1',
          name: 'Primeiros 5 km',
          slug: 'primeiros_5k',
          icon: 'shield',
        },
      ],
    });
  });

  it('returns treadmill speed/time series and never exposes a GPS route', async () => {
    const resultsByTable = {
      workouts: query({
        data: [
          {
            id: 'workout-2',
            activity_id: 'activity-2',
            source: 'manual',
            created_at: '2026-08-20T10:00:00Z',
          },
        ],
        error: null,
      }),
      activities: query({
        data: [
          {
            id: 'activity-2',
            name: 'Treino na esteira',
            distance: 3_000,
            moving_time: 1_200,
            average_pace: 400,
            start_date: '2026-08-20T10:00:00Z',
            environment: 'treadmill',
            treadmill_data: {
              avg_speed_kmh: 9,
              speed_samples: [
                { t: 0, kmh: 8 },
                { t: 600, kmh: 9 },
                { t: 1_200, kmh: 10 },
              ],
            },
          },
        ],
        error: null,
      }),
      ai_feedbacks: query({ data: [], error: null }),
      workout_routes: query({ data: [], error: null }),
      user_badges: query({ data: [], error: null }),
    };
    const supabase = {
      from: jest.fn(
        (table: keyof typeof resultsByTable) => resultsByTable[table],
      ),
    } as unknown as SupabaseService;
    const service = new RecentActivityResultsService(supabase);

    const result = await service.getRecent('user-1', 'activity', 5);

    expect(result[0].activity.environment).toBe('treadmill');
    expect(result[0].activity.route_preview).toEqual([]);
    expect(result[0].activity.average_speed_kmh).toBe(9);
    expect(result[0].activity.metric_series.speed).toEqual([8, 9, 10]);
    expect(result[0].activity.metric_series.time).toEqual([0, 600, 1200]);
  });
});
