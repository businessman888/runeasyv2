import { useState, useEffect, useRef } from 'react';
import type {
  GoalStep,
  WorkoutBlockAPI,
  SegmentEffortAPI,
  RepeatSegmentAPI,
  SimpleSegmentAPI,
} from '../types/workoutGoals';
import type { SessionState } from './useTracking';
import { formatPaceRangeLabel } from '../utils/pace';

// ─── Rótulos padrão por tipo de bloco ────────────────────────────────────────
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  warmup: 'Trote leve z1/z2 para ativar',
  main: 'Ritmo forte, focado na técnica',
  cooldown: 'Trote muito leve + alongamento estático.',
  repeat: 'Séries fortes com recuperação entre elas',
};

const BLOCK_TITLES: Record<string, string> = {
  warmup: 'Aquecimento',
  main: 'Principal',
  cooldown: 'Desaquecimento',
  repeat: 'Intervalado',
};

// ─── Formatação ──────────────────────────────────────────────────────────────
/** Faixa-alvo de pace (segundos/km, tolera decimal legado) → "4:50–5:10/km". */
function formatPaceRange(
  min?: number | null,
  max?: number | null,
): string | undefined {
  const label = formatPaceRangeLabel(min, max);
  return label ? `${label}/km` : undefined;
}

/** Rótulo de quantidade de um sub-bloco: "400m", "1.0 km" ou "90s"/"5:00 min". */
function amountLabelOf(e: {
  distance_km?: number;
  duration_seconds?: number;
}): string {
  if (e.distance_km != null && e.distance_km > 0) {
    return e.distance_km >= 1
      ? `${e.distance_km.toFixed(e.distance_km % 1 === 0 ? 0 : 1)} km`
      : `${Math.round(e.distance_km * 1000)}m`;
  }
  if (e.duration_seconds != null && e.duration_seconds > 0) {
    const s = e.duration_seconds;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}:00 min` : `${m}:${rem.toString().padStart(2, '0')} min`;
  }
  return '';
}

// ─── Motor de execução (interno) ─────────────────────────────────────────────
// Expande os blocos numa lista sequencial de sub-etapas. Um bloco simples vira 1
// sub-etapa; um `repeat` de N reps vira 2N (work/recovery alternados). Cada
// sub-etapa é medida por DISTÂNCIA ou por TEMPO — o alvo real do segmento, não
// mais um placeholder. É esta lista que a Fase 4 (áudio) vai consumir para saber,
// a cada instante, em qual tiro/trote o corredor está.

type Metric = 'distance' | 'time';

interface ExecStep {
  blockIndex: number;
  metric: Metric;
  /** Alvo do sub-bloco: metros (distance) ou milissegundos (time). */
  target: number;
  /** Para repeat: "Tiro 3/8" | "Trote 3/8". Undefined em blocos simples. */
  liveLabel?: string;
}

function effortTarget(e: SegmentEffortAPI): { metric: Metric; target: number } {
  if (e.distance_km != null && e.distance_km > 0) {
    return { metric: 'distance', target: e.distance_km * 1000 };
  }
  // Fallback para tempo (inclui o caso de dado ausente → alvo 0, concluído na hora).
  return { metric: 'time', target: (e.duration_seconds ?? 0) * 1000 };
}

function buildExecSteps(blocks: WorkoutBlockAPI[]): ExecStep[] {
  const steps: ExecStep[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'repeat') {
      const rep = block as RepeatSegmentAPI;
      const reps = Math.max(1, Math.round(rep.reps || 1));
      for (let r = 1; r <= reps; r++) {
        const w = effortTarget(rep.work);
        steps.push({ blockIndex, ...w, liveLabel: `Tiro ${r}/${reps}` });
        const rc = effortTarget(rep.recovery);
        // Recuperação com alvo 0 (não informada) é pulada na prática pelo motor.
        steps.push({ blockIndex, ...rc, liveLabel: `Trote ${r}/${reps}` });
      }
    } else {
      const simple = block as SimpleSegmentAPI;
      const t = effortTarget(simple);
      steps.push({ blockIndex, ...t });
    }
  });
  return steps;
}

// ─── Construção das GoalSteps (macro, para a UI) ─────────────────────────────
function buildGoalSteps(blocks: WorkoutBlockAPI[]): GoalStep[] {
  return blocks.map((block, index) => {
    const blockNumber = String(index + 1).padStart(2, '0');
    const isRepeat = block.type === 'repeat';
    const isMainLike = block.type === 'main' || isRepeat;
    const blockLabel = isMainLike
      ? `Bloco ${blockNumber}  -  PRINCIPAL`
      : `Bloco ${blockNumber}`;

    let amountLabel = '';
    let pace: string | undefined;
    let recovery: string | undefined;

    if (isRepeat) {
      const rep = block as RepeatSegmentAPI;
      const reps = Math.max(1, Math.round(rep.reps || 1));
      amountLabel = `${reps}× ${amountLabelOf(rep.work)}`;
      pace = formatPaceRange(rep.work.pace_min, rep.work.pace_max);
      const recAmount = amountLabelOf(rep.recovery);
      const recPace = formatPaceRange(rep.recovery.pace_min, rep.recovery.pace_max);
      recovery = recAmount
        ? `Recuperação ${recAmount}${recPace ? ` · ${recPace}` : ''}`
        : undefined;
    } else {
      const simple = block as SimpleSegmentAPI;
      amountLabel = amountLabelOf(simple);
      if (block.type === 'main') pace = formatPaceRange(simple.pace_min, simple.pace_max);
    }

    return {
      id: `goal-${index}`,
      blockIndex: index,
      blockLabel,
      title: BLOCK_TITLES[block.type] || block.type,
      type: block.type,
      amountLabel,
      description:
        (block as SimpleSegmentAPI | RepeatSegmentAPI).description ||
        DEFAULT_DESCRIPTIONS[block.type] ||
        '',
      pace,
      recovery,
      liveLabel: undefined,
      progress01: 0,
      status: index === 0 ? 'active' : 'pending',
    };
  });
}

// ─── Hook ────────────────────────────────────────────────────────────────────
interface UseWorkoutGoalsParams {
  workoutBlocks: WorkoutBlockAPI[] | undefined;
  distance: number; // metros (do useTracking)
  timeMs: number; // milissegundos (do useTracking)
  sessionState: SessionState;
}

interface UseWorkoutGoalsReturn {
  goalSteps: GoalStep[];
  activeStepIndex: number;
  allCompleted: boolean;
  hasGoals: boolean;
}

export function useWorkoutGoals({
  workoutBlocks,
  distance,
  timeMs,
  sessionState,
}: UseWorkoutGoalsParams): UseWorkoutGoalsReturn {
  const [goalSteps, setGoalSteps] = useState<GoalStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [allCompleted, setAllCompleted] = useState(false);

  // Motor de execução expandido + cursor sequencial. Vivem em refs porque avançam
  // a cada tick de GPS/tempo e não devem, por si sós, forçar re-render.
  const execRef = useRef<ExecStep[]>([]);
  const execIndexRef = useRef(0);
  const stepStartDistanceRef = useRef(0);
  const stepStartTimeRef = useRef(0);
  const blocksRef = useRef<WorkoutBlockAPI[] | undefined>(undefined);

  // ── Inicialização a partir dos blocos da API ────────────────────────────
  useEffect(() => {
    if (!workoutBlocks || workoutBlocks.length === 0) {
      blocksRef.current = undefined;
      execRef.current = [];
      execIndexRef.current = 0;
      stepStartDistanceRef.current = 0;
      stepStartTimeRef.current = 0;
      setGoalSteps([]);
      setActiveStepIndex(0);
      setAllCompleted(false);
      return;
    }

    // Só reinicializa se os blocos mudaram de referência.
    if (blocksRef.current === workoutBlocks) return;

    let built: GoalStep[] = [];
    try {
      built = buildGoalSteps(workoutBlocks);
      execRef.current = buildExecSteps(workoutBlocks);
    } catch (e) {
      // Tolerância mínima (decisão do projeto): formato inesperado/antigo não
      // pode derrubar a tela de corrida. Degrada para "sem metas".
      console.warn('[useWorkoutGoals] Bloco em formato inesperado — sem metas', e);
      built = [];
      execRef.current = [];
    }

    blocksRef.current = workoutBlocks;
    execIndexRef.current = 0;
    stepStartDistanceRef.current = 0;
    stepStartTimeRef.current = 0;
    setGoalSteps(built);
    setActiveStepIndex(0);
    setAllCompleted(false);
  }, [workoutBlocks]);

  // ── Loop de monitoramento — avança o cursor de execução ─────────────────
  useEffect(() => {
    const exec = execRef.current;
    if (exec.length === 0 || goalSteps.length === 0) return;
    if (sessionState !== 'training' && sessionState !== 'paused') return;

    // Avança pelas sub-etapas concluídas desde o último tick (state machine).
    let idx = execIndexRef.current;
    while (idx < exec.length) {
      const step = exec[idx];
      const progressInStep =
        step.metric === 'distance'
          ? distance - stepStartDistanceRef.current
          : timeMs - stepStartTimeRef.current;

      if (progressInStep >= step.target) {
        // Sub-etapa concluída → próxima começa a partir daqui (dist E tempo).
        idx += 1;
        stepStartDistanceRef.current = distance;
        stepStartTimeRef.current = timeMs;
      } else {
        break;
      }
    }
    execIndexRef.current = idx;

    const nowAllCompleted = idx >= exec.length;

    // Deriva o estado macro (por bloco) a partir do cursor de execução.
    const activeExec = idx < exec.length ? exec[idx] : null;
    const activeBlockIndex = activeExec
      ? activeExec.blockIndex
      : goalSteps.length; // além do último → tudo completo

    let newActiveStepIndex = activeStepIndex;
    const updated = goalSteps.map((gs, i) => {
      let status: GoalStep['status'];
      if (i < activeBlockIndex) status = 'completed';
      else if (i === activeBlockIndex) status = 'active';
      else status = 'pending';

      if (status === 'active') newActiveStepIndex = i;

      // Progresso do bloco ativo: fração de sub-etapas concluídas dentro dele
      // + progresso fracionário da sub-etapa corrente.
      let progress01 = status === 'completed' ? 1 : 0;
      let liveLabel = gs.liveLabel;
      if (status === 'active') {
        const blockSteps = exec.filter((s) => s.blockIndex === i);
        const total = blockSteps.length || 1;
        const doneBefore = exec
          .slice(0, idx)
          .filter((s) => s.blockIndex === i).length;
        let frac = 0;
        if (activeExec && activeExec.blockIndex === i && activeExec.target > 0) {
          const p =
            activeExec.metric === 'distance'
              ? distance - stepStartDistanceRef.current
              : timeMs - stepStartTimeRef.current;
          frac = Math.max(0, Math.min(p / activeExec.target, 1));
        }
        progress01 = Math.min((doneBefore + frac) / total, 1);
        liveLabel = activeExec?.liveLabel;
      } else {
        liveLabel = undefined;
      }

      return { ...gs, status, progress01, liveLabel };
    });

    // Evita setState redundante (mesma referência lógica) para não re-renderizar à toa.
    const changed = updated.some(
      (s, i) =>
        s.status !== goalSteps[i].status ||
        s.progress01 !== goalSteps[i].progress01 ||
        s.liveLabel !== goalSteps[i].liveLabel,
    );
    if (changed) {
      setGoalSteps(updated);
      setActiveStepIndex(newActiveStepIndex);
    }
    if (nowAllCompleted !== allCompleted) setAllCompleted(nowAllCompleted);
  }, [distance, timeMs, sessionState, goalSteps.length]);

  return {
    goalSteps,
    activeStepIndex,
    allCompleted,
    hasGoals: goalSteps.length > 0,
  };
}
