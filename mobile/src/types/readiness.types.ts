/**
 * Mirrors the readiness contract of the backend. Keep in sync when it changes:
 *
 *   backend/src/modules/readiness/readiness-ai.service.ts        → ReadinessVerdict, ReadinessAnswers
 *   backend/src/modules/readiness/readiness.service.ts           → ReadinessStatus, EligibilityReason
 *   backend/src/modules/readiness/helpers/load-series.helper.ts  → FloorProgress
 *   backend/src/modules/readiness/readiness.controller.ts        → os status HTTP de AnalyzeOutcome
 *
 * ⚠️ Estes tipos moravam dentro do `readinessStore`, e o de status tinha 6 campos.
 * A R.1 acrescentou 3 ao `/readiness/status` e eles morriam no `as ReadinessStatus`
 * do store sem aviso nenhum — o progresso do piso chegava ao app e ninguém lia.
 */

import type { ReadinessStatusColor } from './wellness.types';

export interface ReadinessAnswers {
    sleep: number; // 1-5
    legs: number; // 1-5
    mood: number; // 1-5
    stress: number; // 1-5
    motivation: number; // 1-5
}

/**
 * Um tile da grade do resultado. `label` e `value` vêm PAREADOS do backend — a
 * tela lê pelo rótulo, nunca pela posição (ver `metricTiles`).
 *
 * `icon` é o vocabulário do backend (`bed`, `activity`, `trending-up`, `brain`),
 * que NÃO é `AppIconName`. O mobile deriva o ícone do rótulo.
 */
export interface MetricSummaryItem {
    label: string;
    value: string;
    sublabel?: string;
    icon: string;
}

export interface ReadinessVerdict {
    /** 0-100, calculado em código desde a R.1. Não é percentual. */
    readiness_score: number;
    status_color: ReadinessStatusColor;
    /** 'Pronto para treinar' | 'Sinal amarelo — atenção' | 'Dia de recuperação' */
    status_label: string;
    ai_analysis: {
        headline: string;
        reasoning: string;
        plan_adjustment: string;
    };
    /** Ordem atual do motor: [Sono, Pernas, Carga de treino, Estresse]. */
    metrics_summary: MetricSummaryItem[];
    generated_at: string;
}

/** O que falta para o piso de histórico (14 dias de span E 6 dias com corrida). */
export interface FloorProgress {
    spanDays: number;
    runDays: number;
    missingSpanDays: number;
    missingRunDays: number;
}

export type EligibilityReason =
    | 'ok'
    | 'sem_historico'
    | 'ja_respondeu'
    | 'indisponivel';

export interface ReadinessStatus {
    isUnlocked: boolean;
    /**
     * ⚠️ Desde a R.1 é IGUAL a `isUnlocked` de propósito: significa "passou o piso
     * de histórico", NÃO "já correu uma vez". O nome ficou pelo app 1.0.9.
     */
    hasCompletedFirstWorkout: boolean;
    canCheckInToday: boolean;
    hasCompletedToday: boolean;
    lastCheckInDate: string | null;
    todayVerdict: ReadinessVerdict | null;
    // Os três abaixo são aditivos da R.1 — opcionais porque um backend anterior
    // a ela não os manda, e o app tem de continuar de pé contra ele.
    todayAnswers?: ReadinessAnswers | null;
    learning?: FloorProgress | null;
    eligibilityReason?: EligibilityReason;
}

/**
 * O desfecho de um check-in, como o APP o entende.
 *
 * O backend devolve três desfechos em dois status (2xx e 422), mais o 403 do
 * Pro-gate. Todos são RESULTADO — nenhum é falha de rede. Só o que não se
 * encaixa aqui vira erro retentável.
 */
export type AnalyzeOutcome =
    | { kind: 'ok'; verdict: ReadinessVerdict }
    | { kind: 'ja_respondeu'; verdict: ReadinessVerdict; message: string | null }
    | { kind: 'aprendendo'; learning: FloorProgress | null; message: string }
    | { kind: 'pro_gate'; message: string };
