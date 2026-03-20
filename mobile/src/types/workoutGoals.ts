// ─── Workout Goals — Real-time tracking types ────────────────────────────────

/** Status de cada etapa no tracking em tempo real */
export type GoalStepStatus = 'pending' | 'active' | 'completed';

/** Tipo de métrica utilizada para verificar conclusão da meta */
export type GoalMetricType = 'distance' | 'time';

/** Representação de uma etapa/meta do treino no sistema de tracking */
export interface GoalStep {
  id: string;
  blockIndex: number;
  blockLabel: string;        // "Bloco 01", "Bloco 02 - PRINCIPAL"
  title: string;             // "Aquecimento", "Tiros de 400m", "Desaquecimento"
  type: 'warmup' | 'main' | 'cooldown';
  metricType: GoalMetricType;
  targetValue: number;       // Distância acumulada em metros (absoluta)
  currentValue: number;      // Progresso atual em metros
  description: string;
  pace?: string;             // "3:45/km" — só blocos main
  recovery?: string;         // Texto de recuperação
  status: GoalStepStatus;
}

/** Bloco de instrução vindo da API (instructions_json) */
export interface WorkoutBlockAPI {
  type: 'warmup' | 'main' | 'cooldown';
  distance_km: number;
  pace_min: number;
  pace_max: number;
}

/** Bloco transformado para UI (CalendarScreen WorkoutData.blocks) */
export interface WorkoutBlockUI {
  id: string;
  title: string;
  subtitle: string;
  type: 'warmup' | 'main' | 'cooldown';
  duration?: string;
  description?: string;
  pace?: string;
  recovery?: string;
}
