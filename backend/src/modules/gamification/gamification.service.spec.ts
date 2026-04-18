import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService, ActivityData } from './gamification.service';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';

const makeChain = (overrides: Record<string, unknown> = {}) => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
});

describe('GamificationService', () => {
    let service: GamificationService;
    let mockSupabase: jest.Mocked<Pick<SupabaseService, 'from'>>;
    let mockNotification: jest.Mocked<Pick<NotificationService, 'createNotification' | 'sendPushNotification'>>;

    beforeEach(async () => {
        mockSupabase = { from: jest.fn().mockReturnValue(makeChain()) };
        mockNotification = {
            createNotification: jest.fn().mockResolvedValue(undefined),
            sendPushNotification: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GamificationService,
                { provide: SupabaseService, useValue: mockSupabase },
                { provide: NotificationService, useValue: mockNotification },
            ],
        }).compile();

        service = module.get<GamificationService>(GamificationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ─── calculateLevel ──────────────────────────────────────────────────

    describe('calculateLevel', () => {
        it('returns 1 for 0 XP', () => expect(service.calculateLevel(0)).toBe(1));
        it('returns 1 for 999 XP (not enough for level 2)', () => expect(service.calculateLevel(999)).toBe(1));
        it('returns 2 for exactly 1000 XP', () => expect(service.calculateLevel(1000)).toBe(2));
        it('returns higher level as XP grows', () => {
            const l5 = service.calculateLevel(5000);
            const l6 = service.calculateLevel(6000);
            expect(l6).toBeGreaterThan(l5);
        });
    });

    // ─── getPointsForNextLevel ───────────────────────────────────────────

    describe('getPointsForNextLevel', () => {
        it('returns positive value at level 1 with 0 XP', () => {
            expect(service.getPointsForNextLevel(1, 0)).toBeGreaterThan(0);
        });
        it('returns fewer points when closer to levelling up', () => {
            const far = service.getPointsForNextLevel(1, 0);
            const near = service.getPointsForNextLevel(1, 500);
            expect(near).toBeLessThan(far);
        });
    });

    // ─── checkBadges — slug-based dispatch ──────────────────────────────

    describe('checkBadges', () => {
        const buildBadge = (slug: string, overrides = {}) => ({
            id: `badge-${slug}`,
            name: slug,
            slug,
            description: '',
            icon: '',
            type: 'milestone',
            tier: 1,
            xp_reward: 100,
            criteria: {},
            ...overrides,
        });

        it('skips badges already earned by the user', async () => {
            const badge = buildBadge('primeiro_passo');
            mockSupabase.from = jest.fn().mockImplementation((table: string) => {
                if (table === 'user_badges') return makeChain({
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockResolvedValue({ data: [{ badge_id: badge.id }], error: null }),
                });
                if (table === 'badges') return makeChain({
                    select: jest.fn().mockReturnThis(),
                    order: jest.fn().mockResolvedValue({ data: [badge], error: null }),
                });
                return makeChain();
            });

            const earned = await service.checkBadges('user-1');
            expect(earned).toHaveLength(0);
        });

        it('logs a warning for badges with no registered checker (unknown slug)', async () => {
            const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => { });
            const badge = buildBadge('unknown_future_badge');

            mockSupabase.from = jest.fn().mockImplementation((table: string) => {
                if (table === 'user_badges') return makeChain({
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                });
                if (table === 'badges') return makeChain({
                    select: jest.fn().mockReturnThis(),
                    order: jest.fn().mockResolvedValue({ data: [badge], error: null }),
                });
                return makeChain();
            });

            await service.checkBadges('user-1');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown_future_badge'));
        });

        it('awards "primeiro_passo" when user has at least 1 activity', async () => {
            const badge = buildBadge('primeiro_passo');

            mockSupabase.from = jest.fn().mockImplementation((table: string) => {
                if (table === 'user_badges') {
                    const chain = makeChain();
                    chain.eq = jest.fn().mockImplementation(() => {
                        // first call (check earned) returns empty; insert calls pass
                        return { data: [], error: null, count: 0 };
                    });
                    chain.select = jest.fn().mockReturnThis();
                    chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
                    return chain;
                }
                if (table === 'badges') {
                    const chain = makeChain();
                    chain.select = jest.fn().mockReturnThis();
                    chain.order = jest.fn().mockResolvedValue({ data: [badge], error: null });
                    return chain;
                }
                if (table === 'activities') {
                    // count query returns 1
                    const chain = makeChain();
                    chain.select = jest.fn().mockReturnThis();
                    chain.eq = jest.fn().mockResolvedValue({ data: null, error: null, count: 1 });
                    return chain;
                }
                if (table === 'user_levels') {
                    const chain = makeChain();
                    chain.select = jest.fn().mockReturnThis();
                    chain.eq = jest.fn().mockReturnThis();
                    chain.single = jest.fn().mockResolvedValue({ data: { total_points: 0, current_level: 1 }, error: null });
                    chain.upsert = jest.fn().mockResolvedValue({ data: null, error: null });
                    return chain;
                }
                if (table === 'points_history') {
                    return makeChain({ insert: jest.fn().mockResolvedValue({ data: null, error: null }) });
                }
                return makeChain();
            });

            const earned = await service.checkBadges('user-1');
            expect(earned.some(b => b.slug === 'primeiro_passo')).toBe(true);
        });
    });

    // ─── Streak helpers ──────────────────────────────────────────────────

    describe('updateStreak', () => {
        it('returns 1 when no previous activity', async () => {
            mockSupabase.from = jest.fn().mockImplementation((table: string) => {
                const chain = makeChain();
                if (table === 'users') {
                    chain.select = jest.fn().mockReturnThis();
                    chain.eq = jest.fn().mockReturnThis();
                    chain.single = jest.fn().mockResolvedValue({
                        data: { current_streak: 0, last_activity_date: null },
                        error: null,
                    });
                    chain.update = jest.fn().mockReturnThis();
                }
                if (table === 'user_levels') {
                    chain.upsert = jest.fn().mockResolvedValue({ data: null, error: null });
                }
                return chain;
            });

            const streak = await service.updateStreak('user-1');
            expect(streak).toBe(1);
        });
    });
});
