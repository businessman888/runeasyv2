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
    description: string;
    icon: string;
    type: string;
    tier: number;
    criteria: Record<string, unknown>;
}

export interface UserBadge {
    id: string;
    user_id: string;
    badge_id: string;
    earned_at: string;
    badge?: Badge;
}

@Injectable()
export class GamificationService {
    private readonly logger = new Logger(GamificationService.name);

    // Level thresholds (points required for each level)
    private readonly levelThresholds = [
        0,       // Level 1: 0 pts
        100,     // Level 2: 100 pts
        300,     // Level 3: 300 pts
        600,     // Level 4: 600 pts
        1000,    // Level 5: 1000 pts
        1500,    // Level 6: 1500 pts
        2200,    // Level 7: 2200 pts
        3000,    // Level 8: 3000 pts
        4000,    // Level 9: 4000 pts
        5200,    // Level 10: 5200 pts
        6600,    // Level 11: 6600 pts
        8200,    // Level 12: 8200 pts
        10000,   // Level 13: 10000 pts
        12000,   // Level 14: 12000 pts
        15000,   // Level 15: 15000 pts
    ];

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationService: NotificationService,
    ) { }

    /**
     * Get user's gamification stats
     */
    async getUserStats(userId: string): Promise<UserLevel | null> {
        const { data, error } = await this.supabaseService
            .from('user_levels')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    /**
     * Get all badges with user's earned status
     */
    async getBadges(userId: string): Promise<(Badge & { earned: boolean; earned_at?: string })[]> {
        // Get all badges
        const { data: allBadges, error: badgesError } = await this.supabaseService
            .from('badges')
            .select('*')
            .order('tier', { ascending: true });

        if (badgesError) throw badgesError;

        // Get user's earned badges
        const { data: userBadges } = await this.supabaseService
            .from('user_badges')
            .select('badge_id, earned_at')
            .eq('user_id', userId);

        const earnedMap = new Map(
            (userBadges || []).map((ub) => [ub.badge_id, ub.earned_at])
        );

        return (allBadges || []).map((badge) => ({
            ...badge,
            earned: earnedMap.has(badge.id),
            earned_at: earnedMap.get(badge.id),
        }));
    }

    /**
     * Add points to user and recalculate level
     */
    async addPoints(
        userId: string,
        points: number,
        reason: string,
        referenceType?: string,
        referenceId?: string,
    ): Promise<{ newTotal: number; levelUp: boolean; newLevel: number }> {
        // Get current stats
        const currentStats = await this.getUserStats(userId);
        const currentPoints = currentStats?.total_points || 0;
        const currentLevel = currentStats?.current_level || 1;
        const newTotal = currentPoints + points;

        // Calculate new level
        const newLevel = this.calculateLevel(newTotal);
        const levelUp = newLevel > currentLevel;

        // Update user_levels
        await this.supabaseService
            .from('user_levels')
            .upsert({
                user_id: userId,
                total_points: newTotal,
                current_level: newLevel,
                updated_at: new Date().toISOString(),
            });

        // Record points history
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

    /**
     * Calculate level based on total points
     * Level 1->2: 1000 XP
     * Level 2->3: 1100 XP
     * Level 3->4: 1200 XP
     * Pattern: 1000 + (level - 1) * 100
     */
    calculateLevel(totalPoints: number): number {
        let level = 1;
        let pointsNeeded = 0;

        while (pointsNeeded <= totalPoints) {
            const nextLevelPoints = 1000 + (level - 1) * 100;
            pointsNeeded += nextLevelPoints;

            if (pointsNeeded > totalPoints) {
                return level;
            }
            level++;
        }

        return level;
    }

    /**
     * Get points needed for next level
     * Returns points still needed to reach next level
     */
    getPointsForNextLevel(currentLevel: number, totalPoints: number): number {
        // Calculate total points needed to reach current level
        let pointsToCurrentLevel = 0;
        for (let i = 1; i < currentLevel; i++) {
            pointsToCurrentLevel += 1000 + (i - 1) * 100;
        }

        // Points needed for next level
        const pointsForNextLevel = 1000 + (currentLevel - 1) * 100;

        // Points already earned towards next level
        const pointsInCurrentLevel = totalPoints - pointsToCurrentLevel;

        // Points still needed
        return pointsForNextLevel - pointsInCurrentLevel;
    }

    /**
     * Check and award badges after an activity
     */
    async checkBadges(userId: string, activityData?: any): Promise<Badge[]> {
        const earnedBadges: Badge[] = [];

        // Get user's current badges
        const { data: userBadges } = await this.supabaseService
            .from('user_badges')
            .select('badge_id')
            .eq('user_id', userId);

        const earnedBadgeIds = new Set((userBadges || []).map((ub) => ub.badge_id));

        // Get all badges
        const { data: allBadges } = await this.supabaseService
            .from('badges')
            .select('*');

        if (!allBadges) return earnedBadges;

        // Get user stats for checking criteria
        const userStats = await this.getUserStats(userId);

        // Get user's activity count and data
        const { count: activityCount } = await this.supabaseService
            .from('activities')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        for (const badge of allBadges) {
            if (earnedBadgeIds.has(badge.id)) continue;

            let earned = false;

            // Check by badge type and name
            switch (badge.type) {
                case 'milestone': {
                    if (badge.name === 'Primeiro Passo') {
                        // First workout completed
                        earned = (activityCount || 0) >= 1;
                    } else if (badge.name === 'Maratonista') {
                        // Completed run >= 21km
                        if (activityData?.distance) {
                            earned = activityData.distance / 1000 >= 21;
                        }
                    }
                    break;
                }

                case 'performance': {
                    if (badge.name === 'Velocista I') {
                        // Pace < 5:30/km on 5k+ run
                        if (activityData?.average_speed && activityData?.distance >= 5000) {
                            const paceMinPerKm = (1000 / activityData.average_speed) / 60; // Convert to min/km
                            earned = paceMinPerKm <= 5.5; // 5:30 = 5.5 minutes
                        }
                    } else if (badge.name === 'Velocista II') {
                        // Pace < 5:00/km on 5k+ run
                        if (activityData?.average_speed && activityData?.distance >= 5000) {
                            const paceMinPerKm = (1000 / activityData.average_speed) / 60;
                            earned = paceMinPerKm <= 5.0; // 5:00 = 5 minutes
                        }
                    } else if (badge.name === 'Superação') {
                        // Improved pace by 5% in 30 days
                        // Get best pace from 30 days ago
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                        const { data: oldActivities } = await this.supabaseService
                            .from('activities')
                            .select('average_speed, distance')
                            .eq('user_id', userId)
                            .gte('distance', 5000)
                            .lte('start_date', thirtyDaysAgo.toISOString())
                            .order('average_speed', { ascending: false })
                            .limit(1);

                        if (oldActivities?.[0] && activityData?.average_speed) {
                            const oldPace = (1000 / oldActivities[0].average_speed) / 60;
                            const newPace = (1000 / activityData.average_speed) / 60;
                            const improvement = ((oldPace - newPace) / oldPace) * 100;
                            earned = improvement >= 5;
                        }
                    }
                    break;
                }

                case 'consistency': {
                    if (badge.name === 'Consistente') {
                        // 12 workouts in last 30 days
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                        const { count: recentWorkouts } = await this.supabaseService
                            .from('activities')
                            .select('*', { count: 'exact', head: true })
                            .eq('user_id', userId)
                            .gte('start_date', thirtyDaysAgo.toISOString());

                        earned = (recentWorkouts || 0) >= 12;
                    } else if (badge.name === 'Semana Completa') {
                        // Completed all workouts from current week's plan
                        const { data: weekWorkouts } = await this.supabaseService
                            .from('workouts')
                            .select('status')
                            .eq('user_id', userId)
                            .gte('scheduled_date', new Date(new Date().setDate(new Date().getDate() - 7)).toISOString());

                        if (weekWorkouts && weekWorkouts.length > 0) {
                            const allCompleted = weekWorkouts.every(w => w.status === 'completed');
                            earned = allCompleted && weekWorkouts.length >= 3; // At least 3 workouts
                        }
                    }
                    break;
                }

                case 'streak': {
                    if (badge.name === 'Chama Eterna') {
                        // 30-day streak
                        earned = (userStats?.current_streak || 0) >= 30;
                    }
                    break;
                }

                case 'exploration': {
                    if (badge.name === 'Na Chuva e no Sol') {
                        // Trained in 5 different weather conditions
                        // This would require weather data from activities
                        // For now, we'll check if user has activities in different times of day
                        const { data: activities } = await this.supabaseService
                            .from('activities')
                            .select('start_date')
                            .eq('user_id', userId);

                        if (activities) {
                            const hours = new Set<number>(activities.map((a: any) => new Date(a.start_date).getHours()));
                            // Consider different time ranges as "different conditions"
                            const conditions = new Set<string>();
                            hours.forEach((h: number) => {
                                if (h >= 5 && h < 9) conditions.add('morning');
                                if (h >= 12 && h < 15) conditions.add('noon');
                                if (h >= 17 && h < 20) conditions.add('evening');
                                if (h >= 20 || h < 5) conditions.add('night');
                                if (h >= 9 && h < 12) conditions.add('late_morning');
                            });
                            earned = conditions.size >= 5;
                        }
                    }
                    break;
                }

                case 'adherence': {
                    if (badge.name === 'Fiel ao Plano') {
                        // 80% adherence to plan for 4 weeks (28 days)
                        const fourWeeksAgo = new Date();
                        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

                        const { data: plannedWorkouts } = await this.supabaseService
                            .from('workouts')
                            .select('status')
                            .eq('user_id', userId)
                            .gte('scheduled_date', fourWeeksAgo.toISOString());

                        if (plannedWorkouts && plannedWorkouts.length > 0) {
                            const completedCount = plannedWorkouts.filter(w => w.status === 'completed').length;
                            const adherenceRate = (completedCount / plannedWorkouts.length) * 100;
                            earned = adherenceRate >= 80;
                        }
                    }
                    break;
                }
            }

            if (earned) {
                // Award badge
                await this.supabaseService.from('user_badges').insert({
                    user_id: userId,
                    badge_id: badge.id,
                });

                // Add points for badge
                await this.addPoints(userId, 100, `Badge conquistado: ${badge.name}`, 'badge', badge.id);

                // Create achievement notification
                await this.notificationService.createNotification(
                    userId,
                    'achievement',
                    '🏆 Nova Conquista!',
                    `Parabéns! Você desbloqueou: ${badge.name}`,
                    {
                        badge_id: badge.id,
                        badge_name: badge.name,
                        screen: 'Badges', // Navigate to badges screen
                    },
                );

                // Send push notification
                await this.notificationService.sendPushNotification(
                    userId,
                    '🏆 Nova Conquista!',
                    `Parabéns! Você desbloqueou: ${badge.name}`,
                    {
                        type: 'achievement',
                        badge_id: badge.id,
                        screen: 'Badges',
                    },
                    { channelId: 'achievements' },
                );

                earnedBadges.push(badge);
                this.logger.log(`User ${userId} earned badge: ${badge.name}`);
            }
        }

        return earnedBadges;
    }

    /**
     * Get user's points history
     */
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
}
