/**
 * Mirrors backend/src/modules/training/wellness/dto/wellness-summary.dto.ts
 * Keep these in sync when the backend DTO changes.
 */

export type ReadinessStatusColor = 'red' | 'yellow' | 'green';
export type EvolutionMetric = 'distance' | 'pace' | 'volume' | 'heartRate';

export interface ReadinessDimensions {
    sleep: number;
    legs: number;
    mood: number;
    stress: number;
    motivation: number;
}

export interface ReadinessBlock {
    hasCompletedToday: boolean;
    score: number | null;
    statusColor: ReadinessStatusColor | null;
    statusLabel: string | null;
    dimensions: ReadinessDimensions | null;
    answeredAt: string | null;
}

export interface OverviewBlock {
    weekDistanceKm: number;
    weekDistanceKmPrev: number;
    frequencyDone: number;
    frequencyPlanned: number;
    caloriesLastRun: number | null;
    durationLastRunSec: number | null;
    lastRunAvgHr: number | null;
}

export interface PerformanceMetric {
    value: number;
    prevValue: number;
    deltaPct: number | null;
    sparkline: number[];
}

export interface PerformanceBlock {
    distance: PerformanceMetric;
    frequency: PerformanceMetric;
    pace: PerformanceMetric;
    duration: PerformanceMetric;
    calories: PerformanceMetric;
    elevation: PerformanceMetric;
}

export interface HealthBlock {
    isConnected: boolean;
    provider: 'apple_health' | null;
    deviceName: string | null;
    restingHr: number | null;
    avgHr7d: number | null;
    maxHr7d: number | null;
    calories7d: number | null;
}

export interface ZonesBlock {
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

export interface WeekPoint {
    weekStart: string;
    value: number | null;
}

export interface EvolutionBlock {
    distance: WeekPoint[];
    pace: WeekPoint[];
    volume: WeekPoint[];
    heartRate: WeekPoint[];
}

export interface StreakBlock {
    current: number;
    longest: number;
    lastActivityDate: string | null;
}

export interface WellnessSummary {
    readiness: ReadinessBlock;
    overview: OverviewBlock;
    performance: PerformanceBlock;
    health: HealthBlock;
    zones: ZonesBlock;
    evolution: EvolutionBlock;
    streak: StreakBlock;
    generatedAt: string;
}
