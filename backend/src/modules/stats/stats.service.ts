import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';

export interface WeeklyStats {
    week_start: string;
    total_distance_km: number;
    total_workouts: number;
    average_pace: number;
    total_elevation: number;
    total_time_minutes: number;
}

export interface MonthlyStats {
    month: string;
    total_distance_km: number;
    total_workouts: number;
    average_pace: number;
    consistency_percent: number;
}

export interface PaceProgression {
    date: string;
    workout_type: string;
    pace: number;
    distance_km: number;
}

@Injectable()
export class StatsService {
    private readonly logger = new Logger(StatsService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Get weekly statistics for the user
     */
    async getWeeklyStats(userId: string, weeks = 12): Promise<WeeklyStats[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (weeks * 7));

        const { data, error } = await this.supabaseService
            .from('activities')
            .select('start_date, distance, moving_time, average_pace, elevation_gain')
            .eq('user_id', userId)
            .gte('start_date', startDate.toISOString())
            .order('start_date', { ascending: true });

        if (error) throw error;

        // Group by week
        const weeklyMap = new Map<string, {
            distance: number;
            time: number;
            elevation: number;
            count: number;
            paceSum: number;
        }>();

        data?.forEach((activity) => {
            const date = new Date(activity.start_date);
            // Get start of week (Sunday)
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().split('T')[0];

            const existing = weeklyMap.get(weekKey) || {
                distance: 0,
                time: 0,
                elevation: 0,
                count: 0,
                paceSum: 0,
            };

            weeklyMap.set(weekKey, {
                distance: existing.distance + (activity.distance || 0),
                time: existing.time + (activity.moving_time || 0),
                elevation: existing.elevation + (activity.elevation_gain || 0),
                count: existing.count + 1,
                paceSum: existing.paceSum + (activity.average_pace || 0),
            });
        });

        return Array.from(weeklyMap.entries()).map(([week_start, stats]) => ({
            week_start,
            total_distance_km: Math.round((stats.distance / 1000) * 100) / 100,
            total_workouts: stats.count,
            average_pace: stats.count > 0 ? Math.round((stats.paceSum / stats.count) * 100) / 100 : 0,
            total_elevation: Math.round(stats.elevation),
            total_time_minutes: Math.round(stats.time / 60),
        }));
    }

    /**
     * Get monthly statistics for the user
     */
    async getMonthlyStats(userId: string, months = 6): Promise<MonthlyStats[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const { data: activities, error: actError } = await this.supabaseService
            .from('activities')
            .select('start_date, distance, average_pace')
            .eq('user_id', userId)
            .gte('start_date', startDate.toISOString())
            .order('start_date', { ascending: true });

        if (actError) throw actError;

        // Get planned workouts for consistency calculation
        const { data: workouts, error: wkError } = await this.supabaseService
            .from('workouts')
            .select('scheduled_date, status')
            .eq('user_id', userId)
            .gte('scheduled_date', startDate.toISOString().split('T')[0]);

        if (wkError) throw wkError;

        // Group activities by month
        const monthlyMap = new Map<string, {
            distance: number;
            count: number;
            paceSum: number;
        }>();

        activities?.forEach((activity) => {
            const date = new Date(activity.start_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            const existing = monthlyMap.get(monthKey) || { distance: 0, count: 0, paceSum: 0 };
            monthlyMap.set(monthKey, {
                distance: existing.distance + (activity.distance || 0),
                count: existing.count + 1,
                paceSum: existing.paceSum + (activity.average_pace || 0),
            });
        });

        // Group workouts by month for consistency
        const workoutsMap = new Map<string, { total: number; completed: number }>();
        workouts?.forEach((workout) => {
            const date = new Date(workout.scheduled_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            const existing = workoutsMap.get(monthKey) || { total: 0, completed: 0 };
            workoutsMap.set(monthKey, {
                total: existing.total + 1,
                completed: existing.completed + (workout.status === 'completed' ? 1 : 0),
            });
        });

        return Array.from(monthlyMap.entries()).map(([month, stats]) => {
            const workoutStats = workoutsMap.get(month) || { total: 0, completed: 0 };
            const consistency = workoutStats.total > 0
                ? Math.round((workoutStats.completed / workoutStats.total) * 100)
                : 0;

            return {
                month,
                total_distance_km: Math.round((stats.distance / 1000) * 100) / 100,
                total_workouts: stats.count,
                average_pace: stats.count > 0 ? Math.round((stats.paceSum / stats.count) * 100) / 100 : 0,
                consistency_percent: consistency,
            };
        });
    }

    /**
     * Get pace progression data for charts
     */
    async getPaceProgression(userId: string, limit = 20): Promise<PaceProgression[]> {
        const { data, error } = await this.supabaseService
            .from('activities')
            .select('start_date, average_pace, distance, name')
            .eq('user_id', userId)
            .not('average_pace', 'is', null)
            .order('start_date', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return (data || []).reverse().map((activity) => ({
            date: activity.start_date.split('T')[0],
            workout_type: this.inferWorkoutType(activity.name, activity.distance),
            pace: activity.average_pace,
            distance_km: Math.round((activity.distance / 1000) * 100) / 100,
        }));
    }

    /**
     * Get user summary stats
     */
    async getSummaryStats(userId: string) {
        const { data: activities, error } = await this.supabaseService
            .from('activities')
            .select('distance, moving_time, elevation_gain')
            .eq('user_id', userId);

        if (error) throw error;

        const totalDistance = activities?.reduce((sum, a) => sum + (a.distance || 0), 0) || 0;
        const totalTime = activities?.reduce((sum, a) => sum + (a.moving_time || 0), 0) || 0;
        const totalElevation = activities?.reduce((sum, a) => sum + (a.elevation_gain || 0), 0) || 0;
        const totalRuns = activities?.length || 0;

        // Get best pace
        const { data: bestPace } = await this.supabaseService
            .from('activities')
            .select('average_pace')
            .eq('user_id', userId)
            .not('average_pace', 'is', null)
            .order('average_pace', { ascending: true })
            .limit(1);

        // Get longest run
        const { data: longestRun } = await this.supabaseService
            .from('activities')
            .select('distance')
            .eq('user_id', userId)
            .order('distance', { ascending: false })
            .limit(1);

        return {
            total_distance_km: Math.round((totalDistance / 1000) * 100) / 100,
            total_time_hours: Math.round((totalTime / 3600) * 10) / 10,
            total_elevation_m: Math.round(totalElevation),
            total_runs: totalRuns,
            best_pace: bestPace?.[0]?.average_pace || null,
            longest_run_km: longestRun?.[0] ? Math.round((longestRun[0].distance / 1000) * 10) / 10 : null,
        };
    }

    private inferWorkoutType(name: string, distance: number): string {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('interval') || nameLower.includes('fartlek')) return 'intervals';
        if (nameLower.includes('tempo') || nameLower.includes('threshold')) return 'tempo';
        if (nameLower.includes('recovery') || nameLower.includes('recuperação')) return 'recovery';
        if (distance > 15000) return 'long_run';
        return 'easy_run';
    }
}
