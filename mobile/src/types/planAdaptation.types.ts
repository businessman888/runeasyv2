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

// ─────────────────────────────────────────────────────────────────────────────
// Troca de Dias — Fase T.2
// ─────────────────────────────────────────────────────────────────────────────

/** 0 = domingo … 6 = sábado. O mesmo vocabulário de `available_days`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * `structural` = trocar os dias de vez, da próxima semana ao fim do plano.
 * `single`     = mover UM treino desta semana para outro dia.
 */
export type DaySwapMode = 'structural' | 'single';

/** Um treino da semana corrente — o que o Modo 2 pode mover. */
export interface DaySwapWeekWorkout {
    workoutId: string;
    type: string | null;
    title: string | null;
    date: string;
    weekday: Weekday;
}

/**
 * Um destino que o Modo 2 pode OFERECER.
 *
 * O backend já filtra: só dias que ainda não passaram E que não têm treino. A
 * UI nunca deve montar esta lista sozinha — é essa filtragem que faz o passado
 * e a colisão sumirem por construção, em vez de por validação.
 */
export interface DaySwapFreeDate {
    date: string;
    weekday: Weekday;
}

/** O contexto da conversa: onde o corredor está hoje e o que ele pode escolher. */
export interface DaySwapContextResult {
    available: boolean;
    /**
     * Os dias que ele treina HOJE, lidos do calendário materializado — nunca de
     * `days_per_week`, que é a intenção declarada no onboarding e diverge da
     * realidade (há plano em produção que declara 3 dias e tem 1 treino/semana).
     */
    currentDays?: Weekday[];
    /** A troca mantém este número. É o que trava a seleção do Modo 1. */
    dayCount?: number;
    nextWeek?: {
        weekNumber: number;
        startDate: string;
        endDate: string;
    } | null;
    currentWeek?: {
        weekNumber: number;
        workouts: DaySwapWeekWorkout[];
        freeDates: DaySwapFreeDate[];
    } | null;
    reason?: string;
    message?: string;
}

/** Um treino que muda de data. */
export interface DaySwapChange {
    workoutId: string;
    type: string | null;
    title: string | null;
    weekNumber: number;
    from: string;
    to: string;
}

/** Dois treinos PESADOS que ficariam em dias consecutivos no arranjo novo. */
export interface SpacingPair {
    first: { workoutId: string; type: string | null; title: string | null; date: string };
    second: { workoutId: string; type: string | null; title: string | null; date: string };
}

/**
 * O veredito de espaçamento — avalia SÓ o arranjo novo, e NUNCA bloqueia.
 *
 * A UI mostra `apertado` com ícone + palavra, jamais só por cor: cor sozinha
 * não comunica estado. E é AVISO, não erro — nada de vermelho.
 */
export interface SpacingVerdict {
    verdict: 'ok' | 'apertado';
    pairs: SpacingPair[];
}

export interface DaySwapPreviewResult {
    available: boolean;
    mode?: DaySwapMode;
    changes?: DaySwapChange[];
    weeksAffected?: number;
    spacing?: SpacingVerdict;
    /** Opaco. Volta no apply sem interpretação. */
    digest?: string;
    reason?: string;
    message?: string;
}

export interface DaySwapApplyResult {
    applied: boolean;
    replayed?: boolean;
    adaptationId?: string;
    workoutsMoved?: number;
    /** Só no Modo 1: os dias que passaram a valer para as próximas gerações. */
    daysSaved?: Weekday[];
    reason?: string;
    message?: string;
    /** No conflito: a preview recalculada, para reconfirmação. */
    preview?: DaySwapPreviewResult;
}

/** O que a UI manda para preview e apply. */
export interface DaySwapChoice {
    mode: DaySwapMode;
    /** Modo 1 — o conjunto novo, mesma quantidade dos atuais. */
    newDays?: Weekday[];
    /** Modo 2 — qual treino move. */
    workoutId?: string;
    /** Modo 2 — para qual dia. Só datas que a preview ofereceu. */
    targetDate?: string;
}
