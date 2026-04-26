import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { SupabaseService } from '../../database';
import { TrainingAIService } from './training-ai.service';
import { GamificationService } from '../gamification/gamification.service';

describe('TrainingService', () => {
    let service: TrainingService;
    let mockSupabaseService: Partial<SupabaseService>;
    let mockTrainingAIService: Partial<TrainingAIService>;

    const mockWorkouts = [
        { id: 'w1', type: 'easy_run', distance_km: 5, scheduled_date: '2024-01-15' },
        { id: 'w2', type: 'long_run', distance_km: 12, scheduled_date: '2024-01-17' },
    ];

    const mockPlan = {
        id: 'plan-1',
        user_id: 'user-123',
        goal: '10k',
        status: 'active',
        duration_weeks: 8,
    };

    beforeEach(async () => {
        mockSupabaseService = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
                single: jest.fn().mockResolvedValue({ data: mockPlan, error: null }),
            }),
        };

        mockTrainingAIService = {
            generateTrainingPlan: jest.fn().mockResolvedValue({
                duration_weeks: 8,
                frequency_per_week: 3,
                weeks: [
                    {
                        week_number: 1,
                        workouts: [
                            { type: 'easy_run', distance_km: 5, day_of_week: 1, segments: [], objective: 'Build base', tips: [] },
                        ],
                    },
                ],
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TrainingService,
                { provide: SupabaseService, useValue: mockSupabaseService },
                { provide: TrainingAIService, useValue: mockTrainingAIService },
                { provide: GamificationService, useValue: { awardPoints: jest.fn() } },
                { provide: getQueueToken('feedback-queue'), useValue: { add: jest.fn() } },
            ],
        }).compile();

        service = module.get<TrainingService>(TrainingService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getActivePlan', () => {
        it('should return active plan for user', async () => {
            const result = await service.getActivePlan('user-123');
            expect(result).toEqual(mockPlan);
            expect(mockSupabaseService.from).toHaveBeenCalledWith('training_plans');
        });

        it('should return null when no active plan', async () => {
            (mockSupabaseService.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            });

            const result = await service.getActivePlan('user-456');
            expect(result).toBeNull();
        });
    });

    describe('getWorkouts', () => {
        it('should return workouts for date range', async () => {
            (mockSupabaseService.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
            });

            const result = await service.getWorkouts('user-123', '2024-01-01', '2024-01-31');
            expect(result).toEqual(mockWorkouts);
            expect(result.length).toBe(2);
        });
    });

    describe('getUpcomingWorkouts', () => {
        it('should return upcoming pending workouts', async () => {
            (mockSupabaseService.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue({ data: mockWorkouts, error: null }),
            });

            const result = await service.getUpcomingWorkouts('user-123', 5);
            expect(result).toEqual(mockWorkouts);
        });
    });

    describe('skipWorkout', () => {
        it('should mark workout as skipped with reason', async () => {
            const skippedWorkout = { ...mockWorkouts[0], status: 'skipped', skip_reason: 'sick' };

            (mockSupabaseService.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: skippedWorkout, error: null }),
            });

            const result = await service.skipWorkout('user-123', 'w1', 'sick');
            expect(result.status).toBe('skipped');
            expect(result.skip_reason).toBe('sick');
        });
    });

    describe('getWorkout', () => {
        it('should return single workout with plan details', async () => {
            const workoutWithPlan = { ...mockWorkouts[0], training_plans: mockPlan };

            (mockSupabaseService.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: workoutWithPlan, error: null }),
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            });

            const result = await service.getWorkout('user-123', 'w1');
            expect(result.training_plans).toBeDefined();
        });
    });
});
