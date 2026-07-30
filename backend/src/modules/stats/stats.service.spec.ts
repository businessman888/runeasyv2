import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { SupabaseService } from '../../database';

describe('StatsService', () => {
  let service: StatsService;
  let mockSupabaseService: Partial<SupabaseService>;

  // `average_pace: 6.0` é o formato LEGADO (decimal min/km, gravado até
  // 2026-07-30). Mantido de propósito: exercita a normalização de leitura, que
  // precisa devolver 360 segundos/km — nunca 6.
  const mockActivities = [
    {
      start_date: '2024-01-15T10:00:00Z',
      distance: 5000,
      moving_time: 1800,
      average_pace: 6.0,
      elevation_gain: 50,
    },
    {
      start_date: '2024-01-16T10:00:00Z',
      distance: 10000,
      moving_time: 3600,
      average_pace: 6.0,
      elevation_gain: 100,
    },
  ];

  beforeEach(async () => {
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue({ data: mockActivities, error: null }),
        single: jest
          .fn()
          .mockResolvedValue({ data: mockActivities[0], error: null }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummaryStats', () => {
    it('should calculate total distance correctly', async () => {
      // getSummaryStats fires 3 queries (totals, best pace, longest run). The
      // builder must be awaitable at any chain depth, so model it as a chainable
      // thenable that resolves the activities at whatever point it's awaited.
      const result = { data: mockActivities, error: null };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        not: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => Promise.resolve(result)),
        then: (onF: (v: typeof result) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(onF, onR),
      });

      (mockSupabaseService.from as jest.Mock) = jest.fn(() => chain);

      const summary = await service.getSummaryStats('user-123');

      expect(summary.total_runs).toBe(2);
      expect(summary.total_distance_km).toBeCloseTo(15, 1);
    });
  });

  describe('getWeeklyStats', () => {
    it('should group activities by week', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: mockActivities, error: null }),
      });

      (mockSupabaseService.from as jest.Mock) = mockFrom;

      const weeklyStats = await service.getWeeklyStats('user-123', 4);

      expect(Array.isArray(weeklyStats)).toBe(true);
    });

    it('expõe average_pace em SEGUNDOS/km, normalizando o legado min/km', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest
          .fn()
          .mockResolvedValue({ data: mockActivities, error: null }),
      });

      (mockSupabaseService.from as jest.Mock) = mockFrom;

      const weeklyStats = await service.getWeeklyStats('user-123', 4);

      // As fixtures são 6.0 decimal min/km → 360 s/km. Sem normalização o
      // resultado seria 6, que o mobile formataria como "0:06/km".
      for (const week of weeklyStats) {
        expect(week.average_pace).toBe(360);
      }
    });
  });

  describe('getPaceProgression', () => {
    it('should return pace data sorted by date', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue({ data: mockActivities, error: null }),
      });

      (mockSupabaseService.from as jest.Mock) = mockFrom;

      const progression = await service.getPaceProgression('user-123', 10);

      expect(Array.isArray(progression)).toBe(true);
      // Mesmo contrato de unidade da agregação semanal: segundos/km.
      for (const point of progression) {
        expect(point.pace).toBe(360);
      }
    });
  });
});
