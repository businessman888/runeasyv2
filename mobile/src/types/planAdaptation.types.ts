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
