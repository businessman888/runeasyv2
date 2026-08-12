import { useMemo } from 'react';
import type { MesoInsight, VolumeTrendPoint } from '../../../types/mesoInsight.types';
import { PHASE_LABELS } from '../../../types/mesoInsight.types';

/**
 * O ARCO DOS STORIES — derivado dos dados já persistidos, sem recalcular nada.
 *
 * Tudo aqui é função pura sobre a linha de `plan_meso_insights`. O backend já
 * mediu; esta camada só escolhe O QUE contar e em que ordem. A lição da Fase 3
 * vale igual na apresentação: **um card nunca afirma o que o dado não mostra.**
 *
 * ── POR QUE 5 CARDS ──────────────────────────────────────────────────────────
 *
 * A retrospectiva usa 7 porque cobre um ciclo inteiro. O mesociclo é um
 * CAPÍTULO do meio da jornada — menos matéria, e de propósito: se o resumo de 4
 * semanas tivesse o mesmo peso do fim de ciclo, o fim de ciclo deixaria de ser
 * um evento.
 */

/** O tipo do card 4 — o clímax existe em duas versões. */
export type ClimaxKind = 'vdot' | 'quality' | 'none';

export interface MesoStoryModel {
    // ── Card 1 — abertura ──
    blockIndex: number;
    phaseLabel: string;
    weekStart: number;
    weekEnd: number;

    // ── Card 2 — a escalada ──
    /** Fração 0..n de subida até o PICO do bloco. `0` quando não houve subida. */
    climbRatio: number;
    /** `climbRatio` em pontos percentuais inteiros. */
    climbPercent: number;
    /** `true` quando há uma subida real a celebrar. */
    hasClimb: boolean;
    /** Km da primeira semana e do pico — os dois números que sustentam a frase. */
    baseKm: number;
    peakKm: number;
    /** Total corrido no bloco. É o fallback do card 2 quando não houve subida. */
    completedKm: number;
    trend: VolumeTrendPoint[];

    // ── Card 3 — consistência ──
    completedWorkouts: number;
    plannedWorkouts: number;
    /** `true` quando fechou 100% — o card muda de tom. */
    perfect: boolean;

    // ── Card 4 — clímax ──
    climax: ClimaxKind;
    vdotBefore: number | null;
    vdotAfter: number | null;
    /** Quantos tiros medidos, e quantos vieram dentro do alvo. */
    qualityCount: number;
    qualityOnTarget: number;
}

/**
 * A ESCALADA É MEDIDA ATÉ O PICO, NUNCA ATÉ A ÚLTIMA SEMANA.
 *
 * A 4ª semana de um bloco é o DELOAD — o motor de volume corta 25% de propósito
 * (`DELOAD_EVERY_N_WEEKS = 4`, `DELOAD_PCT = 0.25`). Num bloco real medido em
 * staging o arco foi 26,7 → 29,2 → 32,3 → 24,2 km: medindo do primeiro ao
 * último, o card anunciaria uma QUEDA de 9% num bloco em que o atleta subiu
 * 21%. O recuo final é a recuperação planejada, não o resultado.
 *
 * Quando não houve subida (semanas faltadas, bloco todo em deload), devolve
 * `hasClimb: false` — e o card troca de conteúdo em vez de inventar uma.
 */
export function computeClimb(trend: VolumeTrendPoint[]): {
    climbRatio: number;
    baseKm: number;
    peakKm: number;
} {
    const done = trend.map((p) => p.completedKm);
    const baseKm = done[0] ?? 0;
    const peakKm = done.length > 0 ? Math.max(...done) : 0;

    // Base zero (a primeira semana do bloco foi perdida) não permite falar em
    // percentual de subida: dividir por zero daria Infinity, e "subiu infinito"
    // é pior que não falar.
    const climbRatio = baseKm > 0 ? (peakKm - baseKm) / baseKm : 0;

    return { climbRatio: Math.max(0, climbRatio), baseKm, peakKm };
}

/**
 * O card 4 tem duas versões e uma ausência.
 *
 * `vdot` é o clímax de verdade — mas é RARO: a cadência real permite ~1
 * movimento por plano, e ele cai no bloco final, que não gera insight. O caso
 * comum é `quality`, e ele não é um consolo: "seus 3 tiros vieram no alvo" é
 * informação verdadeira sobre o bloco. `none` (base pura, sem qualidade) cai
 * para um card de fechamento sem número inventado.
 */
function resolveClimax(insight: MesoInsight): ClimaxKind {
    if (insight.vdot_highlight) return 'vdot';
    if ((insight.quality_efforts?.length ?? 0) > 0) return 'quality';
    return 'none';
}

export function buildMesoStory(insight: MesoInsight): MesoStoryModel {
    const trend = insight.volume_trend ?? [];
    const { climbRatio, baseKm, peakKm } = computeClimb(trend);

    const efforts = insight.quality_efforts ?? [];
    const completedWorkouts = insight.completed_workouts ?? 0;
    const plannedWorkouts = insight.planned_workouts ?? 0;

    return {
        blockIndex: insight.block_index,
        phaseLabel: PHASE_LABELS[insight.dominant_phase] ?? insight.dominant_phase,
        weekStart: insight.week_start,
        weekEnd: insight.week_end,

        climbRatio,
        climbPercent: Math.round(climbRatio * 100),
        // Abaixo de 1% arredonda para 0% e a frase fica vazia ("subiu 0%").
        hasClimb: Math.round(climbRatio * 100) >= 1,
        baseKm,
        peakKm,
        completedKm: Number(insight.completed_distance_km ?? 0),
        trend,

        completedWorkouts,
        plannedWorkouts,
        perfect: plannedWorkouts > 0 && completedWorkouts >= plannedWorkouts,

        climax: resolveClimax(insight),
        vdotBefore: insight.vdot_highlight?.vdotBefore ?? null,
        vdotAfter: insight.vdot_highlight?.vdotAfter ?? null,
        qualityCount: efforts.length,
        qualityOnTarget: efforts.filter((e) => e.deltaSeconds === 0).length,
    };
}

export function useMesoStory(insight: MesoInsight | null): MesoStoryModel | null {
    return useMemo(
        () => (insight ? buildMesoStory(insight) : null),
        [insight],
    );
}
