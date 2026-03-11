import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import { SupabaseService } from '../../database';

describe('GamificationService', () => {
    let service: GamificationService;
    let mockSupabaseService: Partial<SupabaseService>;

    const mockUser = {
        id: 'user-123',
        current_level: 3,
        current_xp: 150,
        total_points: 500,
        current_streak: 5,
        best_streak: 10,
    };

    beforeEach(async () => {
        mockSupabaseService = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GamificationService,
                { provide: SupabaseService, useValue: mockSupabaseService },
            ],
        }).compile();

        service = module.get<GamificationService>(GamificationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('calculateLevel', () => {
        it('should return level 1 for 0 XP', () => {
            const level = service.calculateLevel(0);
            expect(level).toBe(1);
        });

        it('should return level 2 for 100 XP', () => {
            const level = service.calculateLevel(100);
            expect(level).toBe(2);
        });

        it('should return level 5 for 1000 XP', () => {
            const level = service.calculateLevel(1000);
            expect(level).toBe(5);
        });

        it('should return level 10 for 10000 XP', () => {
            const level = service.calculateLevel(10000);
            expect(level).toBe(10);
        });
    });

    describe('getPointsForNextLevel', () => {
        it('should return points needed for level 2 when at level 1', () => {
            const points = service.getPointsForNextLevel(1, 0);
            expect(points).toBeGreaterThan(0);
        });

        it('should return fewer points needed when closer to level up', () => {
            const pointsAtStart = service.getPointsForNextLevel(1, 0);
            const pointsNearLevelUp = service.getPointsForNextLevel(1, 50);
            expect(pointsNearLevelUp).toBeLessThan(pointsAtStart);
        });
    });
});
