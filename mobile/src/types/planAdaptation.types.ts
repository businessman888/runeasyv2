/**
 * O contrato do APPLY — Fase 6.2.
 *
 * Estes tipos espelham `VolumeReliefService` no backend. A primeira vez que o
 * mobile fala com a fundação da Fase 6.
 *
 * ── O DIGEST É OPACO ─────────────────────────────────────────────────────────
 *
 * `digest` é o token de versão do plano. O app NUNCA o calcula, inspeciona ou
 * compara: recebe da preview, devolve no apply, e quem confere é a função
 * Postgres dentro da transação. Tratar como string é o contrato inteiro.
 *
 * O que o app PRECISA garantir é de onde ele vem: o digest enviado no apply é o
 * da PREVIEW que o corredor viu, jamais um buscado no momento do toque. Buscar
 * "agora" anularia a concorrência otimista — ele confirmaria uma coisa e o
 * servidor escreveria sobre outra.
 */

export type ReliefLevel = 'light' | 'strong';

export interface ReliefOption {
    level: ReliefLevel;
    /** O alvo nominal (20 / 35) — para rotular, nunca para prometer. */
    targetPct: number;
    /** A redução REAL. Pode ser menor que a nominal quando o piso limita. */
    achievedPct: number;
    distanceKm: number;
    durationSeconds: number;
}

/**
 * ── POR QUE CAMPOS OPCIONAIS, E NÃO UNIÃO DISCRIMINADA ───────────────────────
 *
 * A forma natural seria `ReliefPreview | ReliefUnavailable` com `available` como
 * discriminante. Não funciona AQUI: o `tsconfig` do mobile roda com
 * `strictNullChecks: false`, e sem ele o TypeScript não estreita união por
 * discriminante booleano — todo acesso a um campo do "outro lado" vira erro.
 *
 * Então segue-se a convenção que o repo já usa em `ApplyAdjustmentResult`: um
 * tipo só, com `available`/`applied` como flag e o resto opcional. Quem lê
 * checa a flag primeiro; os campos do caminho oposto simplesmente não vêm.
 */
export interface ReliefPreviewResult {
    available: boolean;
    workoutId?: string;
    /** Opaco. Vai de volta no apply, sem interpretação. Só quando disponível. */
    digest?: string;
    current?: {
        title: string | null;
        type: string | null;
        scheduledDate: string;
        distanceKm: number;
        durationSeconds: number;
    };
    options?: ReliefOption[];
    /** Só na indisponibilidade. */
    reason?: string;
    /** Texto pronto, vindo do backend — a UI não traduz motivos de recusa. */
    message?: string;
}

export interface ReliefApplyResult {
    applied: boolean;
    replayed?: boolean;
    adaptationId?: string;
    distanceKm?: number;
    achievedPct?: number;
    briefingsInvalidated?: number;
    reason?: string;
    message?: string;
    /**
     * Presente no conflito: a preview RECALCULADA. É ela que a folha mostra para
     * pedir reconfirmação — sem isso o app só poderia mandar "tente de novo",
     * que contra um estado velho falha para sempre.
     */
    preview?: ReliefPreviewResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 6.3 — a SEMANA
// ─────────────────────────────────────────────────────────────────────────────

/** Um treino da semana na preview: quem cede, quanto, e quem é intocável. */
export interface WeekReliefChange {
    workoutId: string;
    title: string | null;
    type: string | null;
    scheduledDate: string;
    /**
     * Qualidade preservada. A folha marca estes com ícone + rótulo, nunca só
     * por cor — é a informação mais importante da tela: o corredor precisa ver
     * que o tiro dele continua de pé.
     */
    isProtected: boolean;
    beforeKm: number;
    afterKm: number;
    changed: boolean;
}

export interface WeekReliefOption {
    level: ReliefLevel;
    targetPct: number;
    /** O corte REAL sobre o total da semana. Pode ser menor que o nominal. */
    achievedPct: number;
    weekTotalKmAfter: number;
    changes: WeekReliefChange[];
}

/** Mesma convenção da 6.2: flag + campos opcionais (`strictNullChecks: false`). */
export interface WeekReliefPreviewResult {
    available: boolean;
    weekNumber?: number;
    windowStart?: string;
    windowEnd?: string;
    weekTotalKm?: number;
    workoutCount?: number;
    /** Opaco. Volta no apply sem interpretação. */
    digest?: string;
    options?: WeekReliefOption[];
    reason?: string;
    message?: string;
}

export interface WeekReliefApplyResult {
    applied: boolean;
    replayed?: boolean;
    adaptationId?: string;
    weekNumber?: number;
    achievedPct?: number;
    weekTotalKmAfter?: number;
    workoutsChanged?: number;
    briefingsInvalidated?: number;
    reason?: string;
    message?: string;
    /** No conflito: a preview recalculada, para reconfirmação. */
    preview?: WeekReliefPreviewResult;
}
