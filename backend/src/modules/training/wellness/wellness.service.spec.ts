import { WellnessService } from './wellness.service';

describe('WellnessService Apple Watch health data', () => {
  function createService(supabase: unknown = {}) {
    return new WellnessService(
      supabase as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('recognizes apple_watch as a connected health provider', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { provider: 'apple_watch', device_name: 'Apple Watch' },
        error: null,
      }),
    };
    const service = createService({
      from: jest.fn().mockReturnValue(query),
    });

    const device = await (service as any).fetchHealthDevice('user-1');

    expect(query.in).toHaveBeenCalledWith('provider', [
      'apple_health',
      'apple_watch',
    ]);
    expect(device).toEqual({
      provider: 'apple_watch',
      device_name: 'Apple Watch',
    });
  });

  it('keeps Watch HR and active calories in the health block', () => {
    const service = createService();
    const activity = {
      average_heartrate: 145,
      max_heartrate: 178,
      calories: 382,
      type: 'easy_run',
    };

    const health = (service as any).buildHealthBlock(
      { provider: 'apple_watch', device_name: 'Apple Watch' },
      [activity],
      [activity],
    );

    expect(health).toEqual({
      isConnected: true,
      provider: 'apple_watch',
      deviceName: 'Apple Watch',
      restingHr: 145,
      avgHr7d: 145,
      maxHr7d: 178,
      calories7d: 382,
    });
  });
});
