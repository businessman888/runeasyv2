import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../../database';
import { ReadinessService } from '../../readiness/readiness.service';
import { StatsService } from '../../stats/stats.service';
import { UsersService } from '../../users/users.service';
import {
  WellnessSummaryResponseDto,
  ReadinessBlockDto,
  OverviewBlockDto,
  PerformanceBlockDto,
  PerformanceMetricDto,
  HealthBlockDto,
  ZonesBlockDto,
  EvolutionBlockDto,
  WeekPointDto,
  StreakBlockDto,
} from './dto/wellness-summary.dto';
import {
  getZoneFromHR,
  inferZoneFromType,
  maxHRFromAge,
  ageFromBirthDate,
  TrainingZone,
} from './helpers/zones.helper';
import {
  computeStreak,
  saoPauloTodayStr,
  toSaoPauloDateStr,
} from './helpers/streak.helper';
import { paceValueToSecondsPerKm } from '../../../common/pace-calculator';

const SAO_PAULO_OFFSET_HOURS = -3;

interface ActivityRow {
  id: string;
  start_date: string;
  distance: number | null; // meters
  moving_time: number | null; // seconds
  /**
   * Segundos por km — a unidade canônica do repo (ver pace-format.ts) e a que o
   * mobile espera (`formatPace(seconds)` em PerformanceGrid/EvolutionChart).
   *
   * Este comentário já dizia "seconds per km" enquanto TODOS os produtores
   * gravavam decimal min/km, e o resultado era visível: `Math.round(5.53)` = 6
   * fazia a tela renderizar "0:06/km". Desde 2026-07-30 os produtores gravam
   * segundos e a leitura passa por `paceValueToSecondsPerKm`, que cura o legado.
   */
  average_pace: number | null; // segundos por km
  elevation_gain: number | null; // meters
  average_heartrate: number | null;
  max_heartrate: number | null;
  calories: number | null;
  type: string | null;
  source: string | null;
}

interface WorkoutRow {
  id: string;
  scheduled_date: string;
  status: string;
  type: string | null;
  activity_id: string | null;
}

@Injectable()
export class WellnessService {
  private readonly logger = new Logger(WellnessService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly readinessService: ReadinessService,
    private readonly statsService: StatsService,
    private readonly usersService: UsersService,
  ) {}

  async getSummary(userId: string): Promise<WellnessSummaryResponseDto> {
    const today = this.getSaoPauloToday();
    const currentWeek = this.getWeekWindow(today, 0);
    const previousWeek = this.getWeekWindow(today, -1);
    const last56Days = new Date(today.getTime() - 56 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      readinessStatus,
      readinessAnswers,
      userProfile,
      currentWeekActivities,
      previousWeekActivities,
      weeklyStats,
      evolutionActivities,
      streakActivities,
      currentWeekWorkouts,
      previousWeekWorkouts,
      healthDevice,
      lastRunActivity,
    ] = await Promise.all([
      this.readinessService.getReadinessStatus(userId).catch((err) => {
        this.logger.warn(`Readiness fetch failed: ${err?.message}`);
        return null;
      }),
      this.fetchTodayReadinessAnswers(userId),
      this.getUserProfileSafe(userId),
      this.fetchActivities(userId, currentWeek.start, currentWeek.end),
      this.fetchActivities(userId, previousWeek.start, previousWeek.end),
      this.statsService.getWeeklyStats(userId, 8).catch((err) => {
        this.logger.warn(`Weekly stats failed: ${err?.message}`);
        return [];
      }),
      this.fetchActivities(userId, last56Days, today),
      this.fetchActivityDates(userId, last90Days),
      this.fetchWorkouts(userId, currentWeek.start, currentWeek.end),
      this.fetchWorkouts(userId, previousWeek.start, previousWeek.end),
      this.fetchHealthDevice(userId),
      this.fetchLastRunActivity(userId),
    ]);

    const age = ageFromBirthDate(userProfile?.birth_date);
    const maxHR = maxHRFromAge(age);

    const readiness = this.buildReadinessBlock(
      readinessStatus,
      readinessAnswers,
    );
    const performance = this.buildPerformanceBlock(
      currentWeekActivities,
      previousWeekActivities,
      currentWeekWorkouts,
      previousWeekWorkouts,
      currentWeek,
    );
    const overview = this.buildOverviewBlock(
      performance,
      currentWeekWorkouts,
      lastRunActivity,
    );
    const zones = this.buildZonesBlock(
      currentWeekActivities,
      currentWeekWorkouts,
      maxHR,
    );
    const health = this.buildHealthBlock(
      healthDevice,
      currentWeekActivities,
      evolutionActivities,
    );
    const evolution = this.buildEvolutionBlock(
      weeklyStats,
      evolutionActivities,
    );
    const streak = this.buildStreakBlock(streakActivities);

    return {
      readiness,
      overview,
      performance,
      health,
      zones,
      evolution,
      streak,
      generatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------
  // Date / week helpers (Sunday-based — matches StatsService.getWeeklyStats)
  // ------------------------------------------------------------------

  private getSaoPauloToday(): Date {
    const nowUtc = new Date();
    const sp = new Date(
      nowUtc.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );
    return new Date(
      Date.UTC(
        sp.getUTCFullYear(),
        sp.getUTCMonth(),
        sp.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  /**
   * Week window relative to `today`. weekOffset=0 → current week,
   * weekOffset=-1 → previous week. Sunday→Saturday, [start, end).
   */
  private getWeekWindow(
    today: Date,
    weekOffset: number,
  ): { start: Date; end: Date } {
    const dayOfWeek = today.getUTCDay(); // 0=Sunday
    const start = new Date(today);
    start.setUTCDate(today.getUTCDate() - dayOfWeek + weekOffset * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { start, end };
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  private async fetchActivities(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<ActivityRow[]> {
    const { data, error } = await this.supabaseService
      .from('activities')
      .select(
        'id, start_date, distance, moving_time, average_pace, elevation_gain, average_heartrate, max_heartrate, calories, type, source',
      )
      .eq('user_id', userId)
      .gte('start_date', start.toISOString())
      .lt('start_date', end.toISOString())
      .order('start_date', { ascending: true });

    if (error) {
      this.logger.warn(`fetchActivities failed: ${error.message}`);
      return [];
    }
    return (data || []) as ActivityRow[];
  }

  private async fetchActivityDates(
    userId: string,
    since: Date,
  ): Promise<string[]> {
    const { data, error } = await this.supabaseService
      .from('activities')
      .select('start_date')
      .eq('user_id', userId)
      .gte('start_date', since.toISOString())
      .order('start_date', { ascending: false });

    if (error) {
      this.logger.warn(`fetchActivityDates failed: ${error.message}`);
      return [];
    }
    return (data || []).map((r: { start_date: string }) => r.start_date);
  }

  private async fetchWorkouts(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<WorkoutRow[]> {
    const startStr = toSaoPauloDateStr(start.toISOString());
    const endStr = toSaoPauloDateStr(end.toISOString());

    const { data, error } = await this.supabaseService
      .from('workouts')
      .select('id, scheduled_date, status, type, activity_id')
      .eq('user_id', userId)
      .gte('scheduled_date', startStr)
      .lt('scheduled_date', endStr);

    if (error) {
      this.logger.warn(`fetchWorkouts failed: ${error.message}`);
      return [];
    }
    return (data || []) as WorkoutRow[];
  }

  private async fetchHealthDevice(
    userId: string,
  ): Promise<{ provider: string; device_name: string | null } | null> {
    const { data, error } = await this.supabaseService
      .from('connected_devices')
      .select('provider, device_name')
      .eq('user_id', userId)
      .eq('provider', 'apple_health')
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(`fetchHealthDevice failed: ${error.message}`);
      return null;
    }
    return data || null;
  }

  private async fetchTodayReadinessAnswers(userId: string): Promise<{
    sleep: number;
    legs: number;
    mood: number;
    stress: number;
    motivation: number;
  } | null> {
    // Mirrors ReadinessService's window: midnight São Paulo (today 00:00 SP = 03:00 UTC).
    const today = this.getSaoPauloToday();
    const windowStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        -SAO_PAULO_OFFSET_HOURS,
        0,
        0,
        0,
      ),
    );

    const { data, error } = await this.supabaseService
      .from('readiness_history')
      .select('check_in_answers')
      .eq('user_id', userId)
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.check_in_answers) return null;
    return data.check_in_answers;
  }

  private async fetchLastRunActivity(
    userId: string,
  ): Promise<ActivityRow | null> {
    const { data, error } = await this.supabaseService
      .from('activities')
      .select(
        'id, start_date, distance, moving_time, average_pace, elevation_gain, average_heartrate, max_heartrate, calories, type, source',
      )
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(`fetchLastRunActivity failed: ${error.message}`);
      return null;
    }
    return (data as ActivityRow) || null;
  }

  private async getUserProfileSafe(userId: string): Promise<{
    birth_date?: { day: number; month: number; year: number };
  } | null> {
    try {
      const user = await this.usersService.getUser(userId);
      return user?.profile || null;
    } catch (err: any) {
      this.logger.warn(`getUserProfileSafe failed: ${err?.message}`);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Block builders
  // ------------------------------------------------------------------

  private buildReadinessBlock(
    status: any,
    answers: {
      sleep: number;
      legs: number;
      mood: number;
      stress: number;
      motivation: number;
    } | null,
  ): ReadinessBlockDto {
    if (!status?.hasCompletedToday || !status?.todayVerdict) {
      return {
        hasCompletedToday: false,
        score: null,
        statusColor: null,
        statusLabel: null,
        dimensions: null,
        answeredAt: null,
      };
    }
    const v = status.todayVerdict;
    return {
      hasCompletedToday: true,
      score: typeof v.readiness_score === 'number' ? v.readiness_score : null,
      statusColor: v.status_color || null,
      statusLabel: v.status_label || null,
      dimensions: answers,
      answeredAt: v.generated_at || null,
    };
  }

  private buildPerformanceBlock(
    currentActivities: ActivityRow[],
    previousActivities: ActivityRow[],
    currentWorkouts: WorkoutRow[],
    previousWorkouts: WorkoutRow[],
    currentWeek: { start: Date; end: Date },
  ): PerformanceBlockDto {
    const sum = (arr: ActivityRow[], pick: (a: ActivityRow) => number) =>
      arr.reduce((acc, a) => acc + (pick(a) || 0), 0);

    // Pace médio ponderado pela distância, em segundos/km. `paceValueToSecondsPerKm`
    // normaliza linhas legadas em decimal min/km para a unidade canônica.
    const avgWeighted = (arr: ActivityRow[]): number => {
      const totalDist = sum(arr, (a) => a.distance || 0);
      if (totalDist <= 0) return 0;
      const weightedPace = arr.reduce((acc, a) => {
        const paceSec = paceValueToSecondsPerKm(a.average_pace);
        if (paceSec == null || !a.distance) return acc;
        return acc + paceSec * a.distance;
      }, 0);
      return weightedPace / totalDist;
    };

    const distanceCurr = sum(
      currentActivities,
      (a) => (a.distance || 0) / 1000,
    );
    const distancePrev = sum(
      previousActivities,
      (a) => (a.distance || 0) / 1000,
    );

    const freqCurr = currentActivities.length;
    const freqPrev = previousActivities.length;

    const paceCurr = avgWeighted(currentActivities);
    const pacePrev = avgWeighted(previousActivities);

    const durCurr = sum(currentActivities, (a) => (a.moving_time || 0) / 60);
    const durPrev = sum(previousActivities, (a) => (a.moving_time || 0) / 60);

    const calCurr = sum(currentActivities, (a) => a.calories || 0);
    const calPrev = sum(previousActivities, (a) => a.calories || 0);

    const elevCurr = sum(currentActivities, (a) => a.elevation_gain || 0);
    const elevPrev = sum(previousActivities, (a) => a.elevation_gain || 0);

    return {
      distance: this.buildMetric(
        round2(distanceCurr),
        round2(distancePrev),
        this.sparkline7(
          currentActivities,
          currentWeek.start,
          (a) => (a.distance || 0) / 1000,
        ),
      ),
      frequency: this.buildMetric(
        freqCurr,
        freqPrev,
        this.sparkline7(currentActivities, currentWeek.start, () => 1),
      ),
      pace: this.buildMetric(
        Math.round(paceCurr),
        Math.round(pacePrev),
        this.sparkline7(
          currentActivities,
          currentWeek.start,
          (a) => paceValueToSecondsPerKm(a.average_pace) ?? 0,
        ),
      ),
      duration: this.buildMetric(
        Math.round(durCurr),
        Math.round(durPrev),
        this.sparkline7(
          currentActivities,
          currentWeek.start,
          (a) => (a.moving_time || 0) / 60,
        ),
      ),
      calories: this.buildMetric(
        Math.round(calCurr),
        Math.round(calPrev),
        this.sparkline7(
          currentActivities,
          currentWeek.start,
          (a) => a.calories || 0,
        ),
      ),
      elevation: this.buildMetric(
        Math.round(elevCurr),
        Math.round(elevPrev),
        this.sparkline7(
          currentActivities,
          currentWeek.start,
          (a) => a.elevation_gain || 0,
        ),
      ),
    };
  }

  private buildMetric(
    value: number,
    prevValue: number,
    sparkline: number[],
  ): PerformanceMetricDto {
    let deltaPct: number | null = null;
    if (prevValue > 0) {
      deltaPct = Math.round(((value - prevValue) / prevValue) * 1000) / 10;
    }
    return { value, prevValue, deltaPct, sparkline };
  }

  private sparkline7(
    activities: ActivityRow[],
    weekStart: Date,
    pick: (a: ActivityRow) => number,
  ): number[] {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    for (const a of activities) {
      const aDate = new Date(a.start_date);
      const aSpStr = toSaoPauloDateStr(a.start_date);
      const wsStr = toSaoPauloDateStr(weekStart.toISOString());
      const diffDays = Math.floor(
        (Date.parse(aSpStr) - Date.parse(wsStr)) / (1000 * 60 * 60 * 24),
      );
      if (diffDays >= 0 && diffDays < 7) {
        buckets[diffDays] += pick(a);
      } else {
        // safety net: bucket by raw weekday if scheduling drift
        const wd = aDate.getUTCDay();
        if (wd >= 0 && wd < 7) buckets[wd] += pick(a);
      }
    }
    return buckets.map((v) => round2(v));
  }

  private buildOverviewBlock(
    performance: PerformanceBlockDto,
    currentWorkouts: WorkoutRow[],
    lastRun: ActivityRow | null,
  ): OverviewBlockDto {
    const plannedStatuses = new Set(['pending', 'completed', 'missed']);
    const frequencyPlanned = currentWorkouts.filter((w) =>
      plannedStatuses.has(w.status),
    ).length;
    const frequencyDone = currentWorkouts.filter(
      (w) => w.status === 'completed',
    ).length;

    return {
      weekDistanceKm: performance.distance.value,
      weekDistanceKmPrev: performance.distance.prevValue,
      frequencyDone: frequencyDone || performance.frequency.value,
      frequencyPlanned,
      caloriesLastRun: lastRun?.calories ?? null,
      durationLastRunSec: lastRun?.moving_time ?? null,
      lastRunAvgHr: lastRun?.average_heartrate ?? null,
    };
  }

  private buildZonesBlock(
    activities: ActivityRow[],
    workouts: WorkoutRow[],
    maxHR: number,
  ): ZonesBlockDto {
    const minutes: Record<TrainingZone, number> = {
      Z1: 0,
      Z2: 0,
      Z3: 0,
      Z4: 0,
      Z5: 0,
    };

    // Build a map from activity_id → workout type to enrich activities
    // that came from a planned workout but have no HR.
    const workoutByActivity = new Map<string, WorkoutRow>();
    for (const w of workouts) {
      if (w.activity_id) workoutByActivity.set(w.activity_id, w);
    }

    for (const a of activities) {
      const durMin = (a.moving_time || 0) / 60;
      if (durMin <= 0) continue;

      let zone: TrainingZone;
      if (a.average_heartrate && a.average_heartrate > 0) {
        zone = getZoneFromHR(a.average_heartrate, maxHR);
      } else {
        const wk = workoutByActivity.get(a.id);
        zone = inferZoneFromType(wk?.type || a.type);
      }
      minutes[zone] += durMin;
    }

    const total =
      minutes.Z1 + minutes.Z2 + minutes.Z3 + minutes.Z4 + minutes.Z5;
    const pct = (m: number) => (total > 0 ? Math.round((m / total) * 100) : 0);

    return {
      z1Pct: pct(minutes.Z1),
      z2Pct: pct(minutes.Z2),
      z3Pct: pct(minutes.Z3),
      z4Pct: pct(minutes.Z4),
      z5Pct: pct(minutes.Z5),
      z1Minutes: Math.round(minutes.Z1),
      z2Minutes: Math.round(minutes.Z2),
      z3Minutes: Math.round(minutes.Z3),
      z4Minutes: Math.round(minutes.Z4),
      z5Minutes: Math.round(minutes.Z5),
      totalMinutes: Math.round(total),
    };
  }

  private buildHealthBlock(
    device: { provider: string; device_name: string | null } | null,
    currentWeekActivities: ActivityRow[],
    last8wActivities: ActivityRow[],
  ): HealthBlockDto {
    if (!device) {
      return {
        isConnected: false,
        provider: null,
        deviceName: null,
        restingHr: null,
        avgHr7d: null,
        maxHr7d: null,
        calories7d: null,
      };
    }

    const hrValues = currentWeekActivities
      .map((a) => a.average_heartrate)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const maxValues = currentWeekActivities
      .map((a) => a.max_heartrate)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const calories7d = currentWeekActivities.reduce(
      (acc, a) => acc + (a.calories || 0),
      0,
    );

    // Resting HR proxy: minimum average HR across recovery runs in the
    // last 8w. Not a true RHR (no continuous sample stream), but the
    // most representative value we can derive without HealthKit RHR query.
    const recoveryHrs = last8wActivities
      .filter(
        (a) =>
          a.type === 'recovery' ||
          a.type === 'easy_run' ||
          a.type === 'rodagem',
      )
      .map((a) => a.average_heartrate)
      .filter((v): v is number => typeof v === 'number' && v > 0);

    return {
      isConnected: true,
      provider: 'apple_health',
      deviceName: device.device_name || null,
      restingHr: recoveryHrs.length ? Math.min(...recoveryHrs) : null,
      avgHr7d: hrValues.length
        ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
        : null,
      maxHr7d: maxValues.length ? Math.max(...maxValues) : null,
      calories7d: calories7d > 0 ? Math.round(calories7d) : null,
    };
  }

  private buildEvolutionBlock(
    weeklyStats: Array<{
      week_start: string;
      total_distance_km: number;
      total_workouts: number;
      average_pace: number;
      total_time_minutes: number;
    }>,
    evolutionActivities: ActivityRow[],
  ): EvolutionBlockDto {
    // Build last-8-weeks scaffold (Sundays) so we always return 8 points.
    const today = this.getSaoPauloToday();
    const todayDow = today.getUTCDay();
    const sundays: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - todayDow - i * 7);
      sundays.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
      );
    }

    const statsByWeek = new Map(weeklyStats.map((s) => [s.week_start, s]));

    // Aggregate average HR per week from evolutionActivities
    const hrByWeek = new Map<string, { sum: number; count: number }>();
    for (const a of evolutionActivities) {
      if (!a.average_heartrate) continue;
      const aDate = new Date(a.start_date);
      const dow = aDate.getUTCDay();
      const ws = new Date(aDate);
      ws.setUTCDate(aDate.getUTCDate() - dow);
      const key = `${ws.getUTCFullYear()}-${String(ws.getUTCMonth() + 1).padStart(2, '0')}-${String(ws.getUTCDate()).padStart(2, '0')}`;
      const existing = hrByWeek.get(key) || { sum: 0, count: 0 };
      existing.sum += a.average_heartrate;
      existing.count += 1;
      hrByWeek.set(key, existing);
    }

    const distance: WeekPointDto[] = sundays.map((ws) => ({
      weekStart: ws,
      value: statsByWeek.get(ws)?.total_distance_km ?? 0,
    }));
    const pace: WeekPointDto[] = sundays.map((ws) => {
      const v = statsByWeek.get(ws)?.average_pace ?? 0;
      return { weekStart: ws, value: v > 0 ? v : null };
    });
    const volume: WeekPointDto[] = sundays.map((ws) => ({
      weekStart: ws,
      value: statsByWeek.get(ws)?.total_time_minutes ?? 0,
    }));
    const heartRate: WeekPointDto[] = sundays.map((ws) => {
      const h = hrByWeek.get(ws);
      return {
        weekStart: ws,
        value: h && h.count > 0 ? Math.round(h.sum / h.count) : null,
      };
    });

    return { distance, pace, volume, heartRate };
  }

  private buildStreakBlock(activityDates: string[]): StreakBlockDto {
    const result = computeStreak(activityDates);
    return {
      current: result.current,
      longest: result.longest,
      lastActivityDate: result.lastActivityDate,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
