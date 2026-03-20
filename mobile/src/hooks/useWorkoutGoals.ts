import { useState, useEffect, useRef, useCallback } from 'react';
import type { GoalStep, GoalStepStatus, WorkoutBlockAPI } from '../types/workoutGoals';
import type { SessionState } from './useTracking';

// ─── Descrições padrão por tipo de bloco ─────────────────────────────────────
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  warmup: 'Trote leve z1/z2 para ativar',
  main: 'Ritmo forte, focado na técnica',
  cooldown: 'Trote muito leve + alongamento estático.',
};

const BLOCK_TITLES: Record<string, string> = {
  warmup: 'Aquecimento',
  main: 'Principal',
  cooldown: 'Desaquecimento',
};

// ─── Utilitário: formatar pace (min/km) ──────────────────────────────────────
function formatPace(paceMin: number): string {
  const minutes = Math.floor(paceMin);
  const seconds = Math.round((paceMin - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
interface UseWorkoutGoalsParams {
  workoutBlocks: WorkoutBlockAPI[] | undefined;
  distance: number;       // metros (do useTracking)
  timeMs: number;         // milissegundos (do useTracking)
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

  // Ref para evitar re-criação dos steps a cada render
  const initializedRef = useRef(false);
  const blocksRef = useRef<WorkoutBlockAPI[] | undefined>(undefined);

  // ── Inicializar GoalSteps a partir dos blocos da API ────────────────────
  useEffect(() => {
    if (!workoutBlocks || workoutBlocks.length === 0) {
      initializedRef.current = false;
      blocksRef.current = undefined;
      setGoalSteps([]);
      setActiveStepIndex(0);
      setAllCompleted(false);
      return;
    }

    // Só reinicializa se os blocos mudaram
    if (initializedRef.current && blocksRef.current === workoutBlocks) return;

    let accumulatedDistance = 0;
    const steps: GoalStep[] = workoutBlocks.map((block, index) => {
      accumulatedDistance += block.distance_km * 1000; // converter km → metros

      const isMain = block.type === 'main';
      const blockNumber = String(index + 1).padStart(2, '0');
      const blockLabel = isMain
        ? `Bloco ${blockNumber}  -  PRINCIPAL`
        : `Bloco ${blockNumber}`;

      return {
        id: `goal-${index}`,
        blockIndex: index,
        blockLabel,
        title: BLOCK_TITLES[block.type] || block.type,
        type: block.type,
        metricType: 'distance' as const,
        targetValue: accumulatedDistance,
        currentValue: 0,
        description: DEFAULT_DESCRIPTIONS[block.type] || '',
        pace: isMain && block.pace_min ? formatPace(block.pace_min) : undefined,
        recovery: isMain ? 'Recuperação 1:30 min\nTrote ou caminhada leve' : undefined,
        status: index === 0 ? 'active' : 'pending',
      };
    });

    blocksRef.current = workoutBlocks;
    initializedRef.current = true;
    setGoalSteps(steps);
    setActiveStepIndex(0);
    setAllCompleted(false);
  }, [workoutBlocks]);

  // ── Loop de monitoramento — compara distance com targets ────────────────
  useEffect(() => {
    if (goalSteps.length === 0) return;
    if (sessionState !== 'training' && sessionState !== 'paused') return;

    let hasChanged = false;
    const updatedSteps = goalSteps.map((step) => ({ ...step }));
    let newActiveIndex = activeStepIndex;
    let nowAllCompleted = true;

    for (let i = 0; i < updatedSteps.length; i++) {
      const step = updatedSteps[i];

      // Calcula progresso relativo a este bloco
      const prevTarget = i > 0 ? updatedSteps[i - 1].targetValue : 0;
      const blockSize = step.targetValue - prevTarget;
      const progressInBlock = Math.max(0, Math.min(distance - prevTarget, blockSize));
      step.currentValue = progressInBlock;

      if (step.status === 'completed') {
        step.currentValue = blockSize; // bloco completo
        continue;
      }

      if (distance >= step.targetValue) {
        // Meta atingida!
        step.status = 'completed';
        step.currentValue = blockSize;
        hasChanged = true;

        // Ativar próximo bloco
        if (i + 1 < updatedSteps.length && updatedSteps[i + 1].status === 'pending') {
          updatedSteps[i + 1].status = 'active';
          newActiveIndex = i + 1;
        }
      } else if (step.status === 'active' || step.status === 'pending') {
        nowAllCompleted = false;
        if (step.status === 'pending' && i === newActiveIndex) {
          step.status = 'active';
          hasChanged = true;
        }
      }
    }

    // Verificar se todos completaram
    const completed = updatedSteps.every((s) => s.status === 'completed');

    if (hasChanged || completed !== allCompleted) {
      setGoalSteps(updatedSteps);
      setActiveStepIndex(newActiveIndex);
      setAllCompleted(completed);
    } else {
      // Mesmo sem mudança de status, atualizar currentValue para barra de progresso
      const valuesChanged = updatedSteps.some(
        (s, i) => s.currentValue !== goalSteps[i].currentValue
      );
      if (valuesChanged) {
        setGoalSteps(updatedSteps);
      }
    }
  }, [distance, sessionState, goalSteps.length]); // Dependências mínimas para evitar loop

  return {
    goalSteps,
    activeStepIndex,
    allCompleted,
    hasGoals: goalSteps.length > 0,
  };
}
