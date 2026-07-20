/**
 * Motor de segmentos PURO (Fase 4). Expande os blocos do treino numa timeline
 * sequencial de sub-etapas (um `repeat` de N reps → 2N sub-etapas work/recovery)
 * e avança um cursor conforme a distância/tempo acumulados.
 *
 * É a versão estendida do motor interno de `useWorkoutGoals.buildExecSteps` —
 * agora carrega a faixa de pace, a zona e o kind/rep, e é PURA (sem React), para
 * o orquestrador consumir do background (locationTask). Como distância e tempo são
 * eixos mistos, os offsets de início de cada sub-etapa só se conhecem em runtime;
 * por isso o cursor é avançado incrementalmente e persistido pelo chamador (MMKV).
 */

import type {
  WorkoutBlockAPI,
  SegmentEffortAPI,
  RepeatSegmentAPI,
  SimpleSegmentAPI,
} from '../types/workoutGoals';

export type SegMetric = 'distance' | 'time';
export type SegKind = 'warmup' | 'main' | 'cooldown' | 'work' | 'recovery';

export interface SegStep {
  index: number; // posição global na timeline
  blockIndex: number;
  kind: SegKind;
  metric: SegMetric;
  /** Alvo: metros (distance) ou milissegundos (time). */
  target: number;
  /** Faixa-alvo de pace em segundos/km (min = rápido, max = lento). */
  paceMin: number;
  paceMax: number;
  /** Para work/recovery de um repeat. */
  repIndex?: number;
  repTotal?: number;
}

export interface SegCursor {
  idx: number;
  startDist: number; // metros no início da sub-etapa ativa
  startTs: number; // timestamp (ms) no início da sub-etapa ativa
}

export interface SegAdvance {
  cursor: SegCursor;
  active: SegStep | null;
  /** Progresso no eixo da métrica (m ou ms). */
  progress: number;
  /** Falta para o fim da sub-etapa (m ou ms). */
  remaining: number;
  /** Estimativa de segundos até o fim da sub-etapa (p/ "prepare-se"); null se instável. */
  remainingSec: number | null;
  allDone: boolean;
}

function effortMetric(e: SegmentEffortAPI | SimpleSegmentAPI): {
  metric: SegMetric;
  target: number;
} {
  if (e.distance_km != null && e.distance_km > 0) {
    return { metric: 'distance', target: e.distance_km * 1000 };
  }
  return { metric: 'time', target: (e.duration_seconds ?? 0) * 1000 };
}

/** Expande os blocos na timeline de sub-etapas (com faixa de pace + kind + rep). */
export function buildSegSteps(blocks: WorkoutBlockAPI[]): SegStep[] {
  const steps: SegStep[] = [];
  let index = 0;
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'repeat') {
      const rep = block as RepeatSegmentAPI;
      const reps = Math.max(1, Math.round(rep.reps || 1));
      for (let r = 1; r <= reps; r++) {
        const w = effortMetric(rep.work);
        steps.push({
          index: index++,
          blockIndex,
          kind: 'work',
          metric: w.metric,
          target: w.target,
          paceMin: rep.work.pace_min,
          paceMax: rep.work.pace_max,
          repIndex: r,
          repTotal: reps,
        });
        const rc = effortMetric(rep.recovery);
        steps.push({
          index: index++,
          blockIndex,
          kind: 'recovery',
          metric: rc.metric,
          target: rc.target,
          paceMin: rep.recovery.pace_min,
          paceMax: rep.recovery.pace_max,
          repIndex: r,
          repTotal: reps,
        });
      }
    } else {
      const simple = block as SimpleSegmentAPI;
      const t = effortMetric(simple);
      steps.push({
        index: index++,
        blockIndex,
        kind: (simple.type as SegKind) ?? 'main',
        metric: t.metric,
        target: t.target,
        paceMin: simple.pace_min,
        paceMax: simple.pace_max,
      });
    }
  });
  return steps;
}

/** Distância total planejada (m) somando os sub-blocos definidos por distância.
 *  Sub-blocos por tempo não contam (sem pace fixo não dá p/ estimar) — usado só
 *  para o "último km"; se subestimar, o aviso simplesmente não dispara. */
export function totalPlannedDistanceM(steps: SegStep[]): number {
  return steps.reduce((sum, s) => (s.metric === 'distance' ? sum + s.target : sum), 0);
}

/**
 * Avança o cursor sobre as sub-etapas concluídas até `currentDist`/`currentTs` e
 * devolve o estado atual. `speedMps` (opcional) permite estimar `remainingSec`
 * para sub-etapas por DISTÂNCIA; sem ele (pace instável) `remainingSec` é null e o
 * chamador degrada.
 */
export function advanceCursor(
  steps: SegStep[],
  cursor: SegCursor,
  currentDist: number,
  currentTs: number,
  speedMps?: number | null,
): SegAdvance {
  let { idx, startDist, startTs } = cursor;

  while (idx < steps.length) {
    const step = steps[idx];
    const progress =
      step.metric === 'distance' ? currentDist - startDist : currentTs - startTs;
    if (step.target <= 0 || progress >= step.target) {
      idx += 1;
      startDist = currentDist;
      startTs = currentTs;
      continue;
    }
    break;
  }

  const active = idx < steps.length ? steps[idx] : null;
  const progress = active
    ? active.metric === 'distance'
      ? currentDist - startDist
      : currentTs - startTs
    : 0;
  const remaining = active ? Math.max(0, active.target - progress) : 0;

  let remainingSec: number | null = null;
  if (active) {
    if (active.metric === 'time') {
      remainingSec = remaining / 1000;
    } else if (speedMps && speedMps > 0.3) {
      remainingSec = remaining / speedMps;
    }
  }

  return {
    cursor: { idx, startDist, startTs },
    active,
    progress,
    remaining,
    remainingSec,
    allDone: active === null,
  };
}
