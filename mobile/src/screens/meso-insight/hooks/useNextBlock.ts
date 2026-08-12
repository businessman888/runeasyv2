import { useMemo } from 'react';
import { useTrainingStore } from '../../../stores/trainingStore';
import { PHASE_LABELS, type WeekPhase } from '../../../types/mesoInsight.types';

/**
 * O PRÓXIMO CAPÍTULO — o gancho que puxa o corredor para a frente.
 *
 * ── DE ONDE VEM, E POR QUE NÃO HÁ ENDPOINT NOVO ──────────────────────────────
 *
 * `plan_meso_insights` descreve o bloco que FECHOU; nada nela fala do próximo.
 * Mas `planOverview` já está na store e traz `weeks[]` com `phase` e
 * `phase_label` de todas as semanas, inclusive as futuras — a mesma fonte que
 * `useWeeklySeries` usa para desenhar a trajetória do plano.
 *
 * A fase do próximo bloco é a MODA das fases das 4 semanas seguintes, com
 * empate resolvido pela última — exatamente a regra que o backend aplica em
 * `dominantPhase`. Espelhá-la aqui é o que faz "Bloco 2 · desenvolvimento" e
 * "vem o Bloco 3 · específico" serem a mesma escala falando duas vezes.
 *
 * ── QUANDO NÃO DÁ PARA SABER ─────────────────────────────────────────────────
 *
 * Entrando pelo push sem passar pela home, `planOverview` pode estar vazio. Aí
 * `phaseLabel` vem `null` e o card usa um gancho genérico. NUNCA inventa o nome
 * de uma fase que não leu — é a mesma disciplina da narrativa: número (e nome)
 * é o que foi medido, não o que caberia bem na frase.
 */

const BLOCK_WEEKS = 4;

export interface NextBlock {
    blockIndex: number;
    weekStart: number;
    weekEnd: number;
    /** `null` quando `planOverview` não está carregado ou o plano acabou. */
    phaseLabel: string | null;
    /** `true` quando o próximo bloco é o ÚLTIMO — a reta final do plano. */
    isFinal: boolean;
}

/** Moda das fases; empate vence a última — espelha `dominantPhase` do backend. */
function dominantPhase(phases: string[]): string | null {
    if (phases.length === 0) return null;

    const counts = new Map<string, number>();
    for (const p of phases) counts.set(p, (counts.get(p) ?? 0) + 1);

    let winner = phases[phases.length - 1];
    for (const [phase, n] of counts) {
        if (n > (counts.get(winner) ?? 0)) winner = phase;
    }
    return winner;
}

export function useNextBlock(currentBlockIndex: number): NextBlock {
    const planOverview = useTrainingStore((s) => s.planOverview);

    return useMemo(() => {
        const blockIndex = currentBlockIndex + 1;
        const weekStart = (blockIndex - 1) * BLOCK_WEEKS + 1;
        const weekEnd = blockIndex * BLOCK_WEEKS;

        const weeks = planOverview?.weeks ?? [];
        const totalWeeks =
            planOverview?.overview?.total_weeks ?? weeks.length ?? 0;

        const phases = weeks
            .filter((w) => w.week_number >= weekStart && w.week_number <= weekEnd)
            .sort((a, b) => a.week_number - b.week_number)
            .map((w) => w.phase)
            .filter((p): p is string => typeof p === 'string' && p.length > 0);

        const phase = dominantPhase(phases);

        return {
            blockIndex,
            weekStart,
            weekEnd,
            // `PHASE_LABELS` traduz; se vier uma fase desconhecida, mostra o
            // valor cru em vez de esconder — nunca um rótulo inventado.
            phaseLabel: phase
                ? (PHASE_LABELS[phase as WeekPhase] ?? phase)
                : null,
            isFinal: totalWeeks > 0 && weekEnd >= totalWeeks,
        };
    }, [planOverview, currentBlockIndex]);
}
