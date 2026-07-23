/**
 * Tipos do motor determinístico de volume (Fase B).
 */

export type WeekPhase = 'base' | 'build' | 'peak' | 'taper';

/** Sinais de capacidade que chegam do onboarding (Fase A). */
export interface CapacityInput {
  currentWeeklyKm?: string | null; // 'lt5'|'5_10'|'10_20'|'20_30'|'gt30'
  recentFrequency?: string | null; // 'never'|'1x'|'2x'|'3x'|'4x_plus'
  recentDistanceKm?: number | null; // 0 = nunca correu
  level?: string | null; // fallback retrocompat
}

/** Capacidade efetiva derivada — o ponto de partida do plano. */
export interface EffectiveCapacity {
  weeklyKm: number; // volume semanal inicial
  longRunCapKm: number; // teto do longão inicial (sanidade)
  neverRan: boolean; // recentDistanceKm === 0
}

/** Resultado da viabilidade — função pura, insumo da Fase C. */
export interface ViabilityResult {
  feasible: boolean;
  requiredWeeklyIncreasePct: number; // rampa exigida p/ atingir o pico no prazo
  minWeeksRecommended: number; // semanas mínimas p/ chegar ao pico com segurança
  maxGoalKmInWindow: number; // maior meta atingível no prazo dado
  peakLongRunKm: number; // longão de pico visado para a meta
}

/** Slot de treino dentro de uma semana (corrida). */
export interface WorkoutSlot {
  slotIndex: number;
  distanceKm: number;
  isLong: boolean;
  isQuality: boolean; // slot de qualidade (intervalado/tempo)
  maxWorkKm?: number; // teto de tiros (km) p/ intervalado caber no alvo
}

/** Esqueleto de uma semana (corrida). */
export interface WeekSkeleton {
  weekNumber: number;
  phase: WeekPhase;
  isDeload: boolean;
  isPeak: boolean;
  isTaper: boolean;
  totalKm: number;
  longRunKm: number;
  workouts: WorkoutSlot[];
}

/** Um bloco corrida/caminhada por tempo (nunca corri). */
export interface WalkRunInterval {
  reps: number;
  runSeconds: number;
  walkSeconds: number;
}

/** Esqueleto de uma semana do protocolo caminhada/corrida. */
export interface WalkRunWeek {
  weekNumber: number;
  phase: WeekPhase;
  workouts: WalkRunInterval[]; // um por dia de treino
}

/** Bloco de viabilidade gravado no plan_json (registro/auditoria). */
export interface PlanViability extends ViabilityResult {
  effectiveWeeklyKm: number;
  goalKm: number;
  weeksAvailable: number;
}
