// ─── Workout Goals — Real-time tracking types ────────────────────────────────

/** Status de cada etapa no tracking em tempo real */
export type GoalStepStatus = 'pending' | 'active' | 'completed';

/** Tipo de métrica utilizada para verificar conclusão da meta */
export type GoalMetricType = 'distance' | 'time';

// ─── Estrutura vinda da API (instructions_json) ──────────────────────────────
// Espelha o schema do backend (training-ai.service.ts). Dois formatos:
//   • Simples  → warmup / main / cooldown contínuos (easy_run, tempo, long_run…)
//   • Repeat   → intervalados: `reps` blocos de work intercalados com recovery
// Cada sub-bloco é definido por distância OU por tempo — nunca ambos.

/** Sub-bloco de esforço (work ou recovery) dentro de um intervalado. */
export interface SegmentEffortAPI {
  distance_km?: number;
  duration_seconds?: number;
  // Faixa-alvo em SEGUNDOS/KM (min = mais rápido, max = mais lento). Planos antigos
  // podem trazer decimal min/km — use utils/pace (tolera ambos).
  pace_min: number;
  pace_max: number;
  zone?: string;
}

/** Segmento simples e contínuo (aquecimento, principal contínuo, desaquecimento). */
export interface SimpleSegmentAPI {
  type: 'warmup' | 'main' | 'cooldown';
  distance_km?: number;
  duration_seconds?: number;
  // Faixa-alvo em SEGUNDOS/KM (min = mais rápido, max = mais lento). Ver SegmentEffortAPI.
  pace_min: number;
  pace_max: number;
  zone?: string;
  description?: string;
  coach_note?: string;
}

/** Segmento de repetição (intervalados): `reps` × (work + recovery). */
export interface RepeatSegmentAPI {
  type: 'repeat';
  reps: number;
  work: SegmentEffortAPI;
  recovery: SegmentEffortAPI;
  zone?: string;
  description?: string;
  coach_note?: string;
}

/** Um bloco de instrução vindo da API. */
export type WorkoutBlockAPI = SimpleSegmentAPI | RepeatSegmentAPI;

// ─── Etapa exposta para a UI (GoalsModal) ────────────────────────────────────
// Auto-contida: já traz o rótulo de quantidade, o progresso 0..1 e a recuperação
// REAL (nada de placeholder). Um `repeat` vira UMA etapa; o progresso e o rótulo
// ao vivo ("Tiro 3/8") são derivados do motor de execução interno do hook.

/** Representação de uma etapa/meta do treino no sistema de tracking */
export interface GoalStep {
  id: string;
  blockIndex: number;
  blockLabel: string;        // "Bloco 01", "Bloco 02 - PRINCIPAL"
  title: string;             // "Aquecimento", "Principal", "Intervalado"
  type: 'warmup' | 'main' | 'cooldown' | 'repeat';
  /** Rótulo de quantidade do bloco: "1.0 km", "5:00 min" ou "8× 400m". */
  amountLabel: string;
  description: string;
  /** Pace-alvo exibido (bloco principal / work do intervalado). "4:00/km". */
  pace?: string;
  /** Recuperação REAL do intervalado. "Recuperação 90s · trote" — undefined nos demais. */
  recovery?: string;
  /** Rótulo ao vivo do sub-bloco ativo de um repeat: "Tiro 3/8" | "Trote 3/8". */
  liveLabel?: string;
  /** Progresso do bloco, 0..1 — alimenta a barra da etapa ativa. */
  progress01: number;
  status: GoalStepStatus;
}

/** Bloco transformado para UI (CalendarScreen WorkoutData.blocks) */
export interface WorkoutBlockUI {
  id: string;
  title: string;
  subtitle: string;
  type: 'warmup' | 'main' | 'cooldown' | 'repeat';
  duration?: string;
  description?: string;
  pace?: string;
  recovery?: string;
}
