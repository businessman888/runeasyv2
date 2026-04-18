import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';

export interface UserLevel {
    id: string;
    user_id: string;
    current_level: number;
    total_points: number;
    performance_score: number;
    consistency_score: number;
    adherence_score: number;
    best_5k_pace: number | null;
    best_10k_pace: number | null;
    current_streak: number;
    best_streak: number;
}

export interface Badge {
    id: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    type: string;
    tier: number;
    xp_reward: number;
    criteria: Record<string, unknown>;
}

export interface UserBadge {
    id: string;
    user_id: string;
    badge_id: string;
    earned_at: string;
    badge?: Badge;
}

export interface WorkoutXPData {
    distance_km: number;
    pace_seconds_per_km: number;
    workoutId: string;
    elevation_gain?: number;
}

export interface ActivityData {
    distance?: number;        // meters
    average_speed?: number;   // m/s
    elapsed_time?: number;    // seconds
    moving_time?: number;     // seconds
    total_elevation_gain?: number; // meters
    start_date?: string;
}

export interface RankingUser {
    id: string;
    profile: { firstname?: string; lastname?: string; profile_pic?: string };
    total_xp: number;
    current_streak: number;
}

export interface RankingResponse {
    rankings: (RankingUser & { rank: number })[];
    userPosition: { rank: number; total_xp: number; current_streak: number; profile: Record<string, unknown> };
    totalParticipants: number;
    cohortInfo?: { month: number; year: number; totalCompetitors: number };
}

type BadgeChecker = (userId: string, activityData?: ActivityData) => Promise<boolean>;

@Injectable()
export class GamificationService {
    private readonly logger = new Logger(GamificationService.name);

    private readonly SAO_PAULO_OFFSET_HOURS = -3;

    // Level thresholds (points required for each level)
    private readonly levelThresholds = [
        0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200,
        6600, 8200, 10000, 12000, 15000,
    ];

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationService: NotificationService,
    ) { }

    // ─── Badge Checker Registry ────────────────────────────────────────────

    private getBadgeCheckers(): Record<string, BadgeChecker> {
        return {
            // Milestone
            primeiro_passo:    this.check_primeiro_passo.bind(this),
            maratonista:       this.check_single_distance_km(21),
            maratona_completa: this.check_single_distance_km(42.195),
            cinquenta_km:      this.check_total_distance_km(50),
            centuriao:         this.check_total_distance_km(100),
            quinhentos_km:     this.check_total_distance_km(500),
            mil_km:            this.check_total_distance_km(1000),
            subidor:           this.check_single_elevation_m(500),
            alpinista:         this.check_total_elevation_m(5000),

            // Performance — pace
            velocista_i:       this.check_pace_on_distance(5.5, 5),
            velocista_ii:      this.check_pace_on_distance(5.0, 5),
            velocista_iii:     this.check_pace_on_distance(4.5, 5),
            velocista_iv:      this.check_pace_on_distance(4.0, 5),
            foguete:           this.check_pace_on_distance(3.5, 1),
            superacao:         this.check_superacao.bind(this),

            // Performance — tempo
            uma_hora:          this.check_single_duration_min(60),
            duas_horas:        this.check_single_duration_min(120),

            // Consistency
            consistente:       this.check_activity_count_in_days(12, 30),
            semana_completa:   this.check_semana_completa.bind(this),

            // Streak
            ignicao:           this.check_streak(7),
            chama_viva:        this.check_streak(14),
            chama_eterna:      this.check_streak(30),
            imortal:           this.check_streak(60),

            // Exploration
            na_chuva_e_no_sol: this.check_all_time_periods.bind(this),
            madrugador:        this.check_runs_in_time_window(5, 7, 5),
            noturno:           this.check_runs_in_time_window(20, 24, 5),
            diversificado:     this.check_all_weekdays.bind(this),

            // Adherence
            fiel_ao_plano:     this.check_fidelidade_plano.bind(this),
        };
    }

    // ─── Individual Badge Checkers ─────────────────────────────────────────

    private async check_primeiro_passo(userId: string): Promise<boolean> {
        const { count } = await this.supabaseService
            .from('activities')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        return (count || 0) >= 1;
    }

    private check_single_distance_km(thresholdKm: number): BadgeChecker {
        return async (_userId: string, activityData?: ActivityData): Promise<boolean> => {
            if (!activityData?.distance) return false;
            return activityData.distance / 1000 >= thresholdKm;
        };
    }

    private check_total_distance_km(thresholdKm: number): BadgeChecker {
        return async (userId: string): Promise<boolean> => {
            const { data } = await this.supabaseService
                .from('activities')
                .select('distance')
                .eq('user_id', userId);
            const totalKm = (data || []).reduce((acc, a) => acc + ((a.distance || 0) / 1000), 0);
            return totalKm >= thresholdKm;
        };
    }

    private check_single_elevation_m(thresholdM: number): BadgeChecker {
        return async (_userId: string, activityData?: ActivityData): Promise<boolean> => {
            return (activityData?.total_elevation_gain || 0) >= thresholdM;
        };
    }

    private check_total_elevation_m(thresholdM: number): BadgeChecker {
        return async (userId: string): Promise<boolean> => {
            const { data } = await this.supabaseService
                .from('activities')
                .select('total_elevation_gain')
                .eq('user_id', userId);
            const totalM = (data || []).reduce((acc, a) => acc + ((a.total_elevation_gain || 0)), 0);
            return totalM >= thresholdM;
        };
    }

    private check_pace_on_distance(maxPaceMinKm: number, minDistanceKm: number): BadgeChecker {
        return async (_userId: string, activityData?: ActivityData): Promise<boolean> => {
            if (!activityData?.average_speed || !activityData?.distance) return false;
            if (activityData.distance < minDistanceKm * 1000) return false;
            const paceMinPerKm = (1000 / activityData.average_speed) / 60;
            return paceMinPerKm <= maxPaceMinKm;
        };
    }

    private async check_superacao(userId: string, activityData?: ActivityData): Promise<boolean> {
        if (!activityData?.average_speed) return false;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: oldActivities } = await this.supabaseService
            .from('activities')
            .select('average_speed')
            .eq('user_id', userId)
            .gte('distance', 5000)
            .lte('start_date', thirtyDaysAgo.toISOString())
            .order('average_speed', { ascending: false })
            .limit(1);

        if (!oldActivities?.[0]) return false;

        const oldPace = (1000 / oldActivities[0].average_speed) / 60;
        const newPace = (1000 / activityData.average_speed) / 60;
        const improvement = ((oldPace - newPace) / oldPace) * 100;
        return improvement >= 5;
    }

    private check_single_duration_min(thresholdMin: number): BadgeChecker {
        return async (_userId: string, activityData?: ActivityData): Promise<boolean> => {
            const durationSeconds = activityData?.elapsed_time ?? activityData?.moving_time ?? 0;
            return durationSeconds / 60 >= thresholdMin;
        };
    }

    private check_activity_count_in_days(count: number, days: number): BadgeChecker {
        return async (userId: string): Promise<boolean> => {
            const since = new Date();
            since.setDate(since.getDate() - days);
            const { count: recent } = await this.supabaseService
                .from('activities')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('start_date', since.toISOString());
            return (recent || 0) >= count;
        };
    }

    private async check_semana_completa(userId: string): Promise<boolean> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: weekWorkouts } = await this.supabaseService
            .from('workouts')
            .select('status')
            .eq('user_id', userId)
            .gte('scheduled_date', sevenDaysAgo.toISOString());

        if (!weekWorkouts || weekWorkouts.length < 3) return false;
        return weekWorkouts.every(w => w.status === 'completed');
    }

    private check_streak(days: number): BadgeChecker {
        return async (userId: string): Promise<boolean> => {
            const stats = await this.getUserStats(userId);
            return (stats?.current_streak || 0) >= days;
        };
    }

    private async check_all_time_periods(userId: string): Promise<boolean> {
        const { data: activities } = await this.supabaseService
            .from('activities')
            .select('start_date')
            .eq('user_id', userId);

        if (!activities) return false;

        const conditions = new Set<string>();
        for (const a of activities) {
            const h = new Date(a.start_date).getHours();
            if (h >= 0 && h < 5)  conditions.add('madrugada');
            if (h >= 5 && h < 9)  conditions.add('manha');
            if (h >= 9 && h < 17) conditions.add('tarde');
            if (h >= 17 && h < 20) conditions.add('fim_de_tarde');
            if (h >= 20)           conditions.add('noite');
        }
        return conditions.size >= 5;
    }

    private check_runs_in_time_window(hourFrom: number, hourTo: number, threshold: number): BadgeChecker {
        return async (userId: string): Promise<boolean> => {
            const { data: activities } = await this.supabaseService
                .from('activities')
                .select('start_date')
                .eq('user_id', userId);

            if (!activities) return false;

            const count = activities.filter(a => {
                const h = new Date(a.start_date).getHours();
                return h >= hourFrom && h < hourTo;
            }).length;

            return count >= threshold;
        };
    }

    private async check_all_weekdays(userId: string): Promise<boolean> {
        const { data: activities } = await this.supabaseService
            .from('activities')
            .select('start_date')
            .eq('user_id', userId);

        if (!activities) return false;

        const weekdays = new Set(activities.map(a => new Date(a.start_date).getDay()));
        return weekdays.size >= 7;
    }

    private async check_fidelidade_plano(userId: string): Promise<boolean> {
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        const { data: plannedWorkouts } = await this.supabaseService
            .from('workouts')
            .select('status')
            .eq('user_id', userId)
            .gte('scheduled_date', fourWeeksAgo.toISOString());

        if (!plannedWorkouts || plannedWorkouts.length === 0) return false;

        const completedCount = plannedWorkouts.filter(w => w.status === 'completed').length;
        return (completedCount / plannedWorkouts.length) * 100 >= 80;
    }

    // ─── Core Public API ───────────────────────────────────────────────────

    async getUserStats(userId: string): Promise<UserLevel | null> {
        const { data, error } = await this.supabaseService
            .from('user_levels')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    async getBadges(userId: string): Promise<(Badge & { earned: boolean; earned_at?: string })[]> {
        const { data: allBadges, error: badgesError } = await this.supabaseService
            .from('badges')
            .select('*')
            .order('tier', { ascending: true });

        if (badgesError) throw badgesError;

        const { data: userBadges } = await this.supabaseService
            .from('user_badges')
            .select('badge_id, earned_at')
            .eq('user_id', userId);

        const earnedMap = new Map(
            (userBadges || []).map(ub => [ub.badge_id, ub.earned_at]),
        );

        return (allBadges || []).map(badge => ({
            ...badge,
            earned: earnedMap.has(badge.id),
            earned_at: earnedMap.get(badge.id),
        }));
    }

    async addPoints(
        userId: string,
        points: number,
        reason: string,
        referenceType?: string,
        referenceId?: string,
    ): Promise<{ newTotal: number; levelUp: boolean; newLevel: number }> {
        const currentStats = await this.getUserStats(userId);
        const currentPoints = currentStats?.total_points || 0;
        const currentLevel = currentStats?.current_level || 1;
        const newTotal = currentPoints + points;
        const newLevel = this.calculateLevel(newTotal);
        const levelUp = newLevel > currentLevel;

        await this.supabaseService.from('user_levels').upsert({
            user_id: userId,
            total_points: newTotal,
            current_level: newLevel,
            updated_at: new Date().toISOString(),
        });

        await this.supabaseService.from('points_history').insert({
            user_id: userId,
            points,
            reason,
            reference_type: referenceType,
            reference_id: referenceId,
        });

        if (levelUp) {
            this.logger.log(`User ${userId} leveled up to ${newLevel}!`);
        }

        return { newTotal, levelUp, newLevel };
    }

    async checkBadges(userId: string, activityData?: ActivityData): Promise<Badge[]> {
        const earnedBadges: Badge[] = [];

        const [userBadgesResult, allBadgesResult] = await Promise.all([
            this.supabaseService.from('user_badges').select('badge_id').eq('user_id', userId),
            this.supabaseService.from('badges').select('*'),
        ]);

        const earnedBadgeIds = new Set((userBadgesResult.data || []).map(ub => ub.badge_id));
        const allBadges: Badge[] = allBadgesResult.data || [];

        if (allBadges.length === 0) return earnedBadges;

        const checkers = this.getBadgeCheckers();

        for (const badge of allBadges) {
            if (earnedBadgeIds.has(badge.id)) continue;

            const checker = checkers[badge.slug];
            if (!checker) {
                this.logger.warn(`No checker registered for badge slug: ${badge.slug}`);
                continue;
            }

            let earned = false;
            try {
                earned = await checker(userId, activityData);
            } catch (err) {
                this.logger.error(`Checker error for badge ${badge.slug}: ${err}`);
                continue;
            }

            if (!earned) continue;

            await this.supabaseService.from('user_badges').insert({
                user_id: userId,
                badge_id: badge.id,
            });

            const xp = badge.xp_reward ?? 100;
            await this.addPoints(userId, xp, `Badge conquistado: ${badge.name}`, 'badge', badge.id);

            await this.notificationService.createNotification(
                userId,
                'achievement',
                '🏆 Nova Conquista!',
                `Parabéns! Você desbloqueou: ${badge.name}`,
                { badge_id: badge.id, badge_name: badge.name, screen: 'Badges' },
            );

            await this.notificationService.sendPushNotification(
                userId,
                '🏆 Nova Conquista!',
                `Parabéns! Você desbloqueou: ${badge.name}`,
                { type: 'achievement', badge_id: badge.id, screen: 'Badges' },
                { channelId: 'achievements' },
            );

            earnedBadges.push(badge);
            this.logger.log(`User ${userId} earned badge: ${badge.name} (+${xp} XP)`);
        }

        return earnedBadges;
    }

    async getPointsHistory(userId: string, limit = 50) {
        const { data, error } = await this.supabaseService
            .from('points_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    }

    // ─── Level Calculation ─────────────────────────────────────────────────

    calculateLevel(totalPoints: number): number {
        let level = 1;
        let pointsNeeded = 0;

        while (true) {
            const nextLevelPoints = 1000 + (level - 1) * 100;
            pointsNeeded += nextLevelPoints;
            if (pointsNeeded > totalPoints) return level;
            level++;
        }
    }

    getPointsForNextLevel(currentLevel: number, totalPoints: number): number {
        let pointsToCurrentLevel = 0;
        for (let i = 1; i < currentLevel; i++) {
            pointsToCurrentLevel += 1000 + (i - 1) * 100;
        }
        const pointsForNextLevel = 1000 + (currentLevel - 1) * 100;
        const pointsInCurrentLevel = totalPoints - pointsToCurrentLevel;
        return pointsForNextLevel - pointsInCurrentLevel;
    }

    // ─── Streak Logic ──────────────────────────────────────────────────────

    private getSaoPauloToday(): string {
        const now = new Date();
        const sp = new Date(now.getTime() + this.SAO_PAULO_OFFSET_HOURS * 3600 * 1000);
        return sp.toISOString().split('T')[0];
    }

    private getSaoPauloYesterday(): string {
        const now = new Date();
        const sp = new Date(now.getTime() + this.SAO_PAULO_OFFSET_HOURS * 3600 * 1000);
        sp.setDate(sp.getDate() - 1);
        return sp.toISOString().split('T')[0];
    }

    async updateStreak(userId: string): Promise<number> {
        const today = this.getSaoPauloToday();
        const yesterday = this.getSaoPauloYesterday();

        const { data: user } = await this.supabaseService
            .from('users')
            .select('current_streak, last_activity_date')
            .eq('id', userId)
            .single();

        const lastDate = user?.last_activity_date;
        const currentStreak = user?.current_streak || 0;
        let newStreak: number;

        if (lastDate === today) {
            return currentStreak;
        } else if (lastDate === yesterday) {
            newStreak = currentStreak + 1;
        } else {
            newStreak = 1;
        }

        await this.supabaseService
            .from('users')
            .update({ current_streak: newStreak, last_activity_date: today })
            .eq('id', userId);

        const bestStreak = Math.max(newStreak, currentStreak);
        await this.supabaseService.from('user_levels').upsert({
            user_id: userId,
            current_streak: newStreak,
            best_streak: bestStreak,
            updated_at: new Date().toISOString(),
        });

        this.logger.log(`User ${userId} streak updated to ${newStreak}`);
        return newStreak;
    }

    // ─── XP Award Logic ────────────────────────────────────────────────────

    async awardWorkoutXP(userId: string, workout: WorkoutXPData): Promise<number> {
        let totalAwarded = 0;

        const { data: userData } = await this.supabaseService
            .from('users')
            .select('total_xp')
            .eq('id', userId)
            .single();

        if ((userData?.total_xp || 0) === 0) {
            await this.addPoints(userId, 100, 'Primeiro treino concluído!', 'workout', workout.workoutId);
            totalAwarded += 100;
        }

        const distanceXP = Math.floor(workout.distance_km) * 10;
        if (distanceXP > 0) {
            await this.addPoints(userId, distanceXP, `Distância: ${workout.distance_km.toFixed(1)}km`, 'workout', workout.workoutId);
            totalAwarded += distanceXP;
        }

        await this.addPoints(userId, 50, 'Treino concluído', 'workout', workout.workoutId);
        totalAwarded += 50;

        if (workout.pace_seconds_per_km > 0 && workout.pace_seconds_per_km < 360) {
            await this.addPoints(userId, 20, 'Pace abaixo de 6:00/km', 'workout', workout.workoutId);
            totalAwarded += 20;
        }

        if (workout.distance_km >= 10) {
            await this.addPoints(userId, 50, 'Corrida longa (10km+)', 'workout', workout.workoutId);
            totalAwarded += 50;
        }

        if (workout.distance_km >= 21) {
            await this.addPoints(userId, 100, 'Ultra distância (21km+)', 'workout', workout.workoutId);
            totalAwarded += 100;
        }

        if (workout.elevation_gain && workout.elevation_gain >= 100) {
            await this.addPoints(userId, 15, 'Elevação significativa (100m+)', 'workout', workout.workoutId);
            totalAwarded += 15;
        }

        const { data: updatedUser } = await this.supabaseService
            .from('users')
            .select('current_streak')
            .eq('id', userId)
            .single();

        if ((updatedUser?.current_streak || 0) > 1) {
            await this.addPoints(userId, 30, `Streak de ${updatedUser.current_streak} dias`, 'workout', workout.workoutId);
            totalAwarded += 30;
        }

        this.logger.log(`User ${userId} awarded ${totalAwarded} XP for workout ${workout.workoutId}`);
        return totalAwarded;
    }

    // ─── Ranking Queries ───────────────────────────────────────────────────

    async getGlobalRanking(userId: string, limit = 50): Promise<RankingResponse> {
        const [rankingsResult, userResult, countResult] = await Promise.all([
            this.supabaseService
                .from('users')
                .select('id, profile, total_xp, current_streak')
                .gt('total_xp', 0)
                .order('total_xp', { ascending: false })
                .limit(limit),
            this.supabaseService
                .from('users')
                .select('id, profile, total_xp, current_streak')
                .eq('id', userId)
                .single(),
            this.supabaseService
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gt('total_xp', 0),
        ]);

        const rankings = (rankingsResult.data || []).map((user: RankingUser, index: number) => ({
            ...user,
            rank: index + 1,
        }));

        const userXP = userResult.data?.total_xp || 0;
        const { count: usersAbove } = await this.supabaseService
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('total_xp', userXP);

        return {
            rankings,
            userPosition: {
                rank: (usersAbove || 0) + 1,
                total_xp: userResult.data?.total_xp || 0,
                current_streak: userResult.data?.current_streak || 0,
                profile: userResult.data?.profile || {},
            },
            totalParticipants: countResult.count || 0,
        };
    }

    async getCohortRanking(userId: string, limit = 50): Promise<RankingResponse> {
        const { data: currentUser } = await this.supabaseService
            .from('users')
            .select('id, profile, total_xp, current_streak, created_at')
            .eq('id', userId)
            .single();

        if (!currentUser) {
            return {
                rankings: [],
                userPosition: { rank: 0, total_xp: 0, current_streak: 0, profile: {} },
                totalParticipants: 0,
            };
        }

        const createdAt = new Date(currentUser.created_at);
        const cohortMonth = createdAt.getMonth() + 1;
        const cohortYear = createdAt.getFullYear();

        const startOfMonth = `${cohortYear}-${String(cohortMonth).padStart(2, '0')}-01T00:00:00.000Z`;
        const endOfMonth = cohortMonth === 12
            ? `${cohortYear + 1}-01-01T00:00:00.000Z`
            : `${cohortYear}-${String(cohortMonth + 1).padStart(2, '0')}-01T00:00:00.000Z`;

        const [rankingsResult, countResult] = await Promise.all([
            this.supabaseService
                .from('users')
                .select('id, profile, total_xp, current_streak')
                .gte('created_at', startOfMonth)
                .lt('created_at', endOfMonth)
                .order('total_xp', { ascending: false })
                .limit(limit),
            this.supabaseService
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfMonth)
                .lt('created_at', endOfMonth),
        ]);

        const rankings = (rankingsResult.data || []).map((user: RankingUser, index: number) => ({
            ...user,
            rank: index + 1,
        }));

        const { count: usersAboveInCohort } = await this.supabaseService
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfMonth)
            .lt('created_at', endOfMonth)
            .gt('total_xp', currentUser.total_xp || 0);

        return {
            rankings,
            userPosition: {
                rank: (usersAboveInCohort || 0) + 1,
                total_xp: currentUser.total_xp || 0,
                current_streak: currentUser.current_streak || 0,
                profile: currentUser.profile || {},
            },
            totalParticipants: countResult.count || 0,
            cohortInfo: { month: cohortMonth, year: cohortYear, totalCompetitors: countResult.count || 0 },
        };
    }
}
