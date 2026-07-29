import { ArchetypeKey } from '../../../common/archetype';

/**
 * Prévia determinística do plano (BriefingScreen, PRÉ-pagamento).
 *
 * ⚠️ SEM IA. Só motores puros (VolumePlannerService + PaceCalculatorService) —
 * os mesmos que a geração real usa, então o treino #1 mostrado aqui é o treino
 * #1 que o usuário vai receber (parity por construção, não por coincidência).
 *
 * A geração com IA (~7 min, com custo) só roda APÓS o pagamento.
 */

/** Bloco caminhada/corrida — só no modo `walk_run` (por tempo, sem pace). */
export interface WalkRunStructureDto {
  reps: number;
  runSeconds: number;
  walkSeconds: number;
}

export interface PreviewWorkoutDto {
  /** 'easy_run' | 'long_run' | 'walk_run' | … (mesmos tipos do plano real). */
  type: string;
  /** Zona-alvo. `null` no walk/run (pessoa sem VDOT). */
  zone: string | null;
  /** `null` no walk/run — o treino é por TEMPO, não por distância. */
  distanceKm: number | null;
  durationSeconds: number;
  /**
   * Faixa de pace em SEGUNDOS/KM inteiros (mesma unidade do reparo de pace).
   * `null` no walk/run: NÃO fabricar pace para quem não tem VDOT.
   */
  paceRangeSeconds: { min: number; max: number } | null;
  /** Só no walk/run. */
  structure?: WalkRunStructureDto;
}

export interface PreviewViabilityDto {
  feasible: boolean;
  minWeeksRecommended: number;
  maxGoalKmInWindow: number;
  peakLongRunKm: number;
  requiredWeeklyIncreasePct: number;
  /**
   * Só para PROVAS: a rampa exigida passou do limiar dedicado (bem mais
   * tolerante que o `feasible`). O Briefing usa ISTO — e não `feasible` — para
   * decidir o tom da projeção no caminho de prova: quase metade das provas
   * plausíveis é `feasible: false` com risco perfeitamente aceitável, e
   * esconder a projeção nelas parecia pessimismo sem motivo na tela de compra.
   * Sempre `false` fora do caminho de prova.
   */
  raceRiskWarning: boolean;
}

export interface PlanPreviewDto {
  /** 'walk_run' quando o usuário nunca correu; 'run' caso contrário. */
  mode: 'run' | 'walk_run';
  week1FirstWorkout: PreviewWorkoutDto;
  archetypeKey: ArchetypeKey;
  /** Limitação/lesão declarada — compõe com qualquer arquétipo. */
  hasLimitation: boolean;
  /** Capacidade efetiva usada no cálculo (km/semana). 0 no walk/run. */
  effectiveWeeklyKm: number;
  /** Volume total da semana 1 (km). `null` no walk/run. */
  week1TotalKm: number | null;
  viability: PreviewViabilityDto;
}
