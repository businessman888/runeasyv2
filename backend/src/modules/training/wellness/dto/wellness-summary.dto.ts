/**
 * Response DTO for GET /training/wellness-summary.
 *
 * Aggregates readiness, weekly performance, health (HealthKit/Apple Watch),
 * training zones distribution, 8-week evolution and streak so the mobile
 * Wellness dashboard can render with a single request.
 */

export type ReadinessStatusColor = 'red' | 'yellow' | 'green';
export type EvolutionMetric = 'distance' | 'pace' | 'volume' | 'heartRate';

export interface ReadinessDimensionsDto {
    sleep: number;       // 1-5
    legs: number;        // 1-5
    mood: number;        // 1-5
    stress: number;      // 1-5
    motivation: number;  // 1-5
}

export interface ReadinessBlockDto {
    hasCompletedToday: boolean;
    score: number | null;                          // 0-100 (verdict.readiness_score)
    statusColor: ReadinessStatusColor | null;
    statusLabel: string | null;                    // PT-BR ("Pronto pra treinar")
    dimensions: ReadinessDimensionsDto | null;
    answeredAt: string | null;                     // ISO timestamp
}

export interface OverviewBlockDto {
    weekDistanceKm: number;
    weekDistanceKmPrev: number;
    frequencyDone: number;
    frequencyPlanned: number;
    caloriesLastRun: number | null;
    durationLastRunSec: number | null;
    lastRunAvgHr: number | null;
}

export interface PerformanceMetricDto {
    value: number;
    prevValue: number;
    deltaPct: number | null;        // null when prevValue=0 (can't compute %)
    sparkline: number[];            // length 7 (last 7 days, Sun..Sat or last-7)
}

export interface PerformanceBlockDto {
    distance: PerformanceMetricDto;   // km
    frequency: PerformanceMetricDto;  // count
    pace: PerformanceMetricDto;       // seconds per km
    duration: PerformanceMetricDto;   // minutes
    calories: PerformanceMetricDto;   // kcal
    elevation: PerformanceMetricDto;  // meters
}

export interface HealthBlockDto {
    isConnected: boolean;
    provider: 'apple_health' | null;
    deviceName: string | null;
    restingHr: number | null;
    avgHr7d: number | null;
    maxHr7d: number | null;
    calories7d: number | null;
}

export interface ZonesBlockDto {
    z1Pct: number;
    z2Pct: number;
    z3Pct: number;
    z4Pct: number;
    z5Pct: number;
    z1Minutes: number;
    z2Minutes: number;
    z3Minutes: number;
    z4Minutes: number;
    z5Minutes: number;
    totalMinutes: number;
}

export interface WeekPointDto {
    weekStart: string;              // YYYY-MM-DD
    value: number | null;
}

export interface EvolutionBlockDto {
    distance: WeekPointDto[];       // 8 weeks, km
    pace: WeekPointDto[];           // 8 weeks, seconds per km
    volume: WeekPointDto[];         // 8 weeks, minutes
    heartRate: WeekPointDto[];      // 8 weeks, average bpm
}

export interface StreakBlockDto {
    current: number;
    longest: number;
    lastActivityDate: string | null;  // YYYY-MM-DD
}

export interface WellnessSummaryResponseDto {
    readiness: ReadinessBlockDto;
    overview: OverviewBlockDto;
    performance: PerformanceBlockDto;
    health: HealthBlockDto;
    zones: ZonesBlockDto;
    evolution: EvolutionBlockDto;
    streak: StreakBlockDto;
    generatedAt: string;             // ISO timestamp
}
