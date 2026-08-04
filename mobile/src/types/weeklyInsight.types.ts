/**
 * Forma da linha de `plan_week_insights` (Fase 2A) devolvida pelos endpoints
 * `GET /training/weekly-insight/latest` e `/unseen`.
 *
 * O backend devolve a LINHA CRUA (snake_case), não um DTO camelCase — por isso
 * os nomes aqui espelham as colunas. Foi deliberado na 2A para deixar a 2B
 * puramente mobile.
 *
 * ── DOIS ESCOPOS QUE NÃO SE SOMAM ────────────────────────────────────────────
 *
 * `completed_distance_km` é PLANO-ONLY; `total_distance_km` é TUDO no período
 * (inclui corrida livre). Somar os dois conta a mesma corrida duas vezes. É a
 * mesma regra que a Fase 1A estabeleceu para a retrospectiva, e ela vale aqui
 * pelo mesmo motivo: quem corre por fora não pode inflar a própria aderência.
 */

export type AdjustmentCode =
    | 'manter'
    | 'aliviar_ritmo'
    | 'reduzir_volume'
    | 'repetir_semana'
    | 'adiar_semana';

/**
 * `schedule`     — mexe em data/status. APLICÁVEL: vira botão sólido.
 * `prescription` — mexe em volume/pace prescritos. SÓ CONSELHO até a Fase 6:
 *                  vira card sem botão.
 * `none`         — nada a sugerir.
 */
export type AdjustmentClass = 'schedule' | 'prescription' | 'none';

export interface SuggestedAdjustment {
    code: AdjustmentCode;
    class: AdjustmentClass;
    reason: string;
    metrics: Record<string, number>;
}

export type Zone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5';

export interface ZoneBucket {
    workouts: number;
    km: number;
    seconds: number;
}

export interface IntensityBucket {
    /** Treinos medidos (têm pace esperado E executado). */
    n: number;
    avgExpectedSec: number;
    avgActualSec: number;
    /** NEGATIVO = correu mais RÁPIDO que o prescrito. */
    avgDeltaSec: number;
    fasterCount: number;
}

/** Uma métrica com sua variação contra a semana anterior do plano. */
export interface MetricPoint {
    value: number;
    prevValue: number;
    /** `null` quando não houve semana anterior — NÃO é o mesmo que 0. */
    deltaPct: number | null;
    sparkline: number[];
}

export type MetricKey =
    | 'distance'
    | 'frequency'
    | 'pace'
    | 'duration'
    | 'calories'
    | 'elevation';

export interface WeeklyInsight {
    id: string;
    plan_id: string;
    user_id: string;
    week_number: number;
    week_start: string;
    week_end: string;

    // ── Aderência ao plano ──
    planned_workouts: number | null;
    completed_workouts: number | null;
    completion_rate: number | null;
    planned_distance_km: number | null;
    completed_distance_km: number | null;
    distance_vs_goal_percent: number | null;
    /** Σ executado ÷ Σ prescrito SÓ DOS CONCLUÍDOS — "quando apareceu, cumpriu?" */
    execution_ratio_percent: number | null;
    avg_pace_seconds: number | null;
    expected_pace_seconds: number | null;

    // ── Frequência: DIAS DISTINTOS, não contagem de treinos ──
    frequency_actual_days: number | null;
    frequency_target_days: number | null;
    frequency_vs_goal_percent: number | null;

    // ── Total corrido (inclui corrida livre) ──
    total_distance_km: number | null;
    total_runs_in_period: number | null;
    free_run_distance_km: number | null;

    // ── Blocos estruturados ──
    metrics_deltas: Partial<Record<MetricKey, MetricPoint>> | null;
    zone_distribution: {
        prescribed: Record<string, ZoneBucket>;
        executed: Record<string, ZoneBucket>;
    } | null;
    intensity_adherence: Partial<Record<Zone, IntensityBucket>> | null;
    suggested_adjustment: SuggestedAdjustment | null;

    ai_narrative: string | null;

    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    processed_at: string | null;
    notified_at: string | null;
    seen_at: string | null;
    /** Preenchido quando o reajuste de classe `schedule` já foi aplicado. */
    adjustment_applied_at: string | null;
}

/** Resposta de `POST /training/weekly-insight/:id/apply`. */
export interface ApplyAdjustmentResult {
    applied: boolean;
    reason?:
        | 'not_found'
        | 'not_completed'
        | 'already_applied'
        | 'not_actionable'
        | 'nothing_to_shift';
    code?: AdjustmentCode;
    shifted?: number;
    deltaDays?: number;
}
