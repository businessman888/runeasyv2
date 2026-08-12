/**
 * Forma da linha de `plan_meso_insights` (Fase 4) devolvida por
 * `GET /training/meso-insight/latest`.
 *
 * Como no semanal, o backend devolve a LINHA CRUA (snake_case) e não um DTO —
 * a apresentação fica inteiramente no mobile.
 *
 * ── O QUE ESTE INSIGHT É, E O QUE NÃO É ──────────────────────────────────────
 *
 * É REFLEXÃO: o arco de 4 semanas do plano. Não há `suggested_adjustment` nem
 * botão de aplicar, e isso é deliberado — calendário já é ação do insight
 * semanal, ritmo já é automático desde a Fase 3, e volume/prescrição é Fase 6.
 *
 * ── DOIS ESCOPOS QUE NÃO SE SOMAM ────────────────────────────────────────────
 *
 * `completed_distance_km` é PLANO-ONLY; `total_distance_km` é TUDO no período
 * (inclui corrida livre). Somar os dois conta a mesma corrida duas vezes.
 */

import type { ZoneBucket, IntensityBucket } from './weeklyInsight.types';

export type WeekPhase = 'base' | 'build' | 'peak' | 'taper';

/** Uma semana do arco. É o dado que o insight semanal não tem como produzir. */
export interface VolumeTrendPoint {
    weekNumber: number;
    plannedKm: number;
    completedKm: number;
}

/** Um bloco de qualidade medido por GPS: o ritmo real dos tiros. */
export interface QualityEffort {
    workoutId: string;
    dateStr: string;
    zones: string[];
    paceSecPerKm: number;
    prescribedPaceMin: number;
    prescribedPaceMax: number;
    prescribedKm: number;
    /** Distância até a FAIXA. 0 = dentro do alvo; negativo = mais rápido. */
    deltaSeconds: number;
}

/**
 * Movimento de nível dentro do bloco.
 *
 * `null` é o caso COMUM, não uma falha: a cadência real permite ~1 movimento
 * por plano, e ele cai no bloco final, que não gera insight. Por isso a UI
 * trata a ausência como normal e mostra a execução dos tiros no lugar — nunca
 * um espaço vazio nem uma evolução inventada.
 */
export interface VdotHighlight {
    vdotBefore: number;
    vdotAfter: number;
    direction: 'up' | 'down';
    weekNumber: number | null;
    reason: string | null;
    sampleSize: number | null;
}

export interface MesoInsight {
    id: string;
    plan_id: string;
    user_id: string;

    /** `ceil(week_number / 4)`. */
    block_index: number;
    /** Primeira e última SEMANA DO PLANO no bloco. */
    week_start: number;
    week_end: number;
    /** Janela efetiva em datas (YYYY-MM-DD). */
    block_start: string;
    block_end: string;
    dominant_phase: WeekPhase;

    // ── Aderência ao plano ──
    planned_workouts: number | null;
    completed_workouts: number | null;
    completion_rate: number | null;
    planned_distance_km: number | null;
    completed_distance_km: number | null;
    distance_vs_goal_percent: number | null;
    execution_ratio_percent: number | null;
    avg_pace_seconds: number | null;
    expected_pace_seconds: number | null;

    frequency_actual_days: number | null;
    frequency_target_days: number | null;

    // ── Total corrido (INCLUI corrida livre) ──
    total_distance_km: number | null;
    total_runs_in_period: number | null;
    free_run_distance_km: number | null;

    // ── Blocos estruturados ──
    volume_trend: VolumeTrendPoint[] | null;
    zone_distribution: {
        prescribed: Record<string, ZoneBucket>;
        executed: Record<string, ZoneBucket>;
    } | null;
    intensity_adherence: Record<string, IntensityBucket> | null;
    quality_efforts: QualityEffort[] | null;
    vdot_highlight: VdotHighlight | null;

    ai_narrative: string | null;

    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    processed_at: string | null;
    notified_at: string | null;
    seen_at: string | null;
}

/** Rótulo em português da fase — o mesmo vocabulário de `getPlanOverview`. */
export const PHASE_LABELS: Record<WeekPhase, string> = {
    base: 'base',
    build: 'desenvolvimento',
    peak: 'específico',
    taper: 'polimento',
};
