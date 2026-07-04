import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import {
  PeriodSummaryQueryDto,
  StatsScope,
  StatsPeriod,
  PeriodSummaryResponse,
  PeriodBreakdownItem,
} from './dto/period-summary-query.dto';
import {
  saoPauloTodayStr,
  toSaoPauloDateStr,
} from '../training/wellness/helpers/streak.helper';

interface PeriodRecord {
  dayStr: string; // local (São Paulo) YYYY-MM-DD
  distanceKm: number;
  seconds: number;
}
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

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

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get weekly statistics for the user
   */
  async getWeeklyStats(userId: string, weeks = 12): Promise<WeeklyStats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);

    const { data, error } = await this.supabaseService
      .from('activities')
      .select('start_date, distance, moving_time, average_pace, elevation_gain')
      .eq('user_id', userId)
      .gte('start_date', startDate.toISOString())
      .order('start_date', { ascending: true });

    if (error) throw error;

    // Group by week
    const weeklyMap = new Map<
      string,
      {
        distance: number;
        time: number;
        elevation: number;
        count: number;
        paceSum: number;
      }
    >();

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
      average_pace:
        stats.count > 0
          ? Math.round((stats.paceSum / stats.count) * 100) / 100
          : 0,
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
    const monthlyMap = new Map<
      string,
      {
        distance: number;
        count: number;
        paceSum: number;
      }
    >();

    activities?.forEach((activity) => {
      const date = new Date(activity.start_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthlyMap.get(monthKey) || {
        distance: 0,
        count: 0,
        paceSum: 0,
      };
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
        completed:
          existing.completed + (workout.status === 'completed' ? 1 : 0),
      });
    });

    return Array.from(monthlyMap.entries()).map(([month, stats]) => {
      const workoutStats = workoutsMap.get(month) || { total: 0, completed: 0 };
      const consistency =
        workoutStats.total > 0
          ? Math.round((workoutStats.completed / workoutStats.total) * 100)
          : 0;

      return {
        month,
        total_distance_km: Math.round((stats.distance / 1000) * 100) / 100,
        total_workouts: stats.count,
        average_pace:
          stats.count > 0
            ? Math.round((stats.paceSum / stats.count) * 100) / 100
            : 0,
        consistency_percent: consistency,
      };
    });
  }

  /**
   * Get pace progression data for charts
   */
  async getPaceProgression(
    userId: string,
    limit = 20,
  ): Promise<PaceProgression[]> {
    const { data, error } = await this.supabaseService
      .from('activities')
      .select('start_date, average_pace, distance, name')
      .eq('user_id', userId)
      .not('average_pace', 'is', null)
      .order('start_date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).reverse().map((activity) => ({
      date: (activity.start_date ?? '').split('T')[0],
      workout_type: this.inferWorkoutType(activity.name, activity.distance),
      pace: activity.average_pace,
      distance_km: Math.round(((activity.distance ?? 0) / 1000) * 100) / 100,
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

    const totalDistance =
      activities?.reduce((sum, a) => sum + (a.distance || 0), 0) || 0;
    const totalTime =
      activities?.reduce((sum, a) => sum + (a.moving_time || 0), 0) || 0;
    const totalElevation =
      activities?.reduce((sum, a) => sum + (a.elevation_gain || 0), 0) || 0;
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
      longest_run_km: longestRun?.[0]
        ? Math.round((longestRun[0].distance / 1000) * 10) / 10
        : null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Period summary — Distância/Tempo/Freq + per-bar breakdown, scoped by
  // period (week/month) AND by scope (activities = executed, workouts =
  // planned). Powers the Calendar stats card. Independent from
  // getSummaryStats (all-time), which other screens still consume.
  // ──────────────────────────────────────────────────────────────────────
  async getPeriodSummary(
    userId: string,
    query: PeriodSummaryQueryDto,
  ): Promise<PeriodSummaryResponse> {
    const referenceDate = query.reference_date || saoPauloTodayStr();
    const { startStr, endStr } = this.getPeriodBounds(
      query.period,
      referenceDate,
    );
    const periodDays = this.countDaysInclusive(startStr, endStr);

    let records: PeriodRecord[];

    if (query.scope === StatsScope.workouts) {
      // Planned data — scheduled_date is a plain local date (no TZ).
      const { data, error } = await this.supabaseService
        .from('workouts')
        .select(
          'scheduled_date, distance_km, target_duration_seconds, target_pace_seconds',
        )
        .eq('user_id', userId)
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr);
      if (error) throw error;
      records = (data || []).map((w) => {
        const km = Number(w.distance_km) || 0;
        // Prefer stored planned duration; fall back to distance × target pace
        // (AI plan workouts don't always persist target_duration_seconds).
        const seconds =
          Number(w.target_duration_seconds) ||
          (w.target_pace_seconds ? km * Number(w.target_pace_seconds) : 0);
        return { dayStr: w.scheduled_date as string, distanceKm: km, seconds };
      });
    } else {
      // Executed data — start_date is a UTC timestamp. Query a São-Paulo-aware
      // window, then bucket each row by its local (SP) day.
      const { data, error } = await this.supabaseService
        .from('activities')
        .select('start_date, distance, moving_time')
        .eq('user_id', userId)
        .gte('start_date', `${startStr}T00:00:00-03:00`)
        .lte('start_date', `${endStr}T23:59:59-03:00`);
      if (error) throw error;
      records = (data || []).map((a) => ({
        dayStr: toSaoPauloDateStr(a.start_date as string),
        distanceKm: (Number(a.distance) || 0) / 1000, // meters → km
        seconds: Number(a.moving_time) || 0,
      }));
    }

    // The activities window can bleed one edge day — keep only local days
    // actually inside the period.
    records = records.filter((r) => r.dayStr >= startStr && r.dayStr <= endStr);

    const totalDistanceKm = records.reduce((s, r) => s + r.distanceKm, 0);
    const totalSeconds = records.reduce((s, r) => s + r.seconds, 0);
    // Freq = DISTINCT days with activity/workout (fixes the old "count of
    // activities" bug where two runs on one day counted as 2).
    const activeDays = new Set(records.map((r) => r.dayStr)).size;

    return {
      distance_km: Math.round(totalDistanceKm * 10) / 10,
      time_minutes: Math.round(totalSeconds / 60),
      frequency: { value: activeDays, total: periodDays },
      breakdown: this.buildBreakdown(records, query.period, referenceDate),
    };
  }

  /** Inclusive [start, end] date-string bounds for the period (São Paulo). */
  private getPeriodBounds(
    period: StatsPeriod,
    referenceDate: string,
  ): { startStr: string; endStr: string } {
    const [y, m, d] = referenceDate.split('-').map(Number);
    if (period === StatsPeriod.month) {
      const mm = String(m).padStart(2, '0');
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        startStr: `${y}-${mm}-01`,
        endStr: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    // week: Sunday..Saturday containing referenceDate
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const startStr = this.addDaysStr(referenceDate, -dow);
    return { startStr, endStr: this.addDaysStr(startStr, 6) };
  }

  private addDaysStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  private countDaysInclusive(startStr: string, endStr: string): number {
    const [ys, ms, ds] = startStr.split('-').map(Number);
    const [ye, me, de] = endStr.split('-').map(Number);
    const diff = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
    return Math.round(diff / 86400000) + 1;
  }

  /** week → 7 bars (Dom-Sab); month → 4-5 bars by calendar week ("Sem N"). */
  private buildBreakdown(
    records: PeriodRecord[],
    period: StatsPeriod,
    referenceDate: string,
  ): PeriodBreakdownItem[] {
    const round1 = (v: number) => Math.round(v * 10) / 10;

    if (period === StatsPeriod.week) {
      const sums = new Array<number>(7).fill(0);
      for (const r of records) {
        const [y, m, d] = r.dayStr.split('-').map(Number);
        const idx = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0..6
        sums[idx] += r.distanceKm;
      }
      return WEEKDAY_LABELS.map((label, i) => ({
        label,
        distance_km: round1(sums[i]),
      }));
    }

    // month: bucket by calendar week-of-month (Dom-Sab weeks)
    const [y, m] = referenceDate.split('-').map(Number);
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const numWeeks = Math.ceil((daysInMonth + firstDow) / 7);
    const sums = new Array<number>(numWeeks).fill(0);
    for (const r of records) {
      const dayOfMonth = Number(r.dayStr.split('-')[2]);
      const idx = Math.floor((dayOfMonth - 1 + firstDow) / 7);
      if (idx >= 0 && idx < numWeeks) sums[idx] += r.distanceKm;
    }
    return sums.map((v, i) => ({ label: `Sem ${i + 1}`, distance_km: round1(v) }));
  }

  private inferWorkoutType(
    name: string | null | undefined,
    distance: number | null | undefined,
  ): string {
    // Atividades manuais/livres ou importadas podem vir sem nome — evita crash
    // em name.toLowerCase() (era um 500 latente em getPaceProgression).
    const nameLower = (name ?? '').toLowerCase();
    if (nameLower.includes('interval') || nameLower.includes('fartlek'))
      return 'intervals';
    if (nameLower.includes('tempo') || nameLower.includes('threshold'))
      return 'tempo';
    if (nameLower.includes('recovery') || nameLower.includes('recuperação'))
      return 'recovery';
    if ((distance ?? 0) > 15000) return 'long_run';
    return 'easy_run';
  }
}
