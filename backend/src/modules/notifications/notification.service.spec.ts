import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { SupabaseService } from '../../database';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockSupabaseService: Partial<SupabaseService>;

  beforeEach(async () => {
    mockSupabaseService = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { push_token: 'ExponentPushToken[xxx]' },
          error: null,
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPushToken', () => {
    it('should return push token when exists', async () => {
      const token = await service.getPushToken('user-123');
      expect(token).toBe('ExponentPushToken[xxx]');
    });

    it('should return null when token not found', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const token = await service.getPushToken('user-456');
      expect(token).toBeNull();
    });
  });

  describe('savePushToken', () => {
    it('should save push token successfully', async () => {
      const updateMock = jest.fn().mockReturnThis();
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        update: updateMock,
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(
        service.savePushToken('user-123', 'ExponentPushToken[yyy]'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendPushNotification', () => {
    it('should return false when no push token', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { push_token: null }, error: null }),
      });

      const result = await service.sendPushNotification(
        'user-123',
        'Test Title',
        'Test Body',
      );

      expect(result).toBe(false);
    });

    it('should return false for invalid token format', async () => {
      (mockSupabaseService.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { push_token: 'invalid-token' },
          error: null,
        }),
      });

      const result = await service.sendPushNotification(
        'user-123',
        'Test Title',
        'Test Body',
      );

      expect(result).toBe(false);
    });
  });
});
