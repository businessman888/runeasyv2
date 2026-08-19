import type {
    AdjustmentCode,
} from '../../types/weeklyInsight.types';

/**
 * O texto da bandeja de reajuste — e a regra de enquadramento que ele carrega.
 *
 * ── AÇÃO × CONSELHO ──────────────────────────────────────────────────────────
 *
 * A classe do enum (decidida no backend, Fase 2A) governa o formato:
 *
 *   `schedule`     → botão sólido que EXECUTA na hora (re-ancora o plano)
 *   `volume`       → botão sólido que ABRE A PREVIEW (alívio da semana, Fase 6.3)
 *   `prescription` → card de orientação SEM botão
 *
 * Regra de ouro: botão sólido leva a algo real; card sem botão é para ler e
 * aplicar na perna. O usuário nunca toca esperando ação e não recebe nada.
 *
 * ── POR QUE `reduzir_volume` ESPEROU ATÉ AGORA ───────────────────────────────
 *
 * Este bloco registrava que aplicar "reduzir volume" significaria reescrever os
 * treinos futuros, e que oferecer o botão antes disso mudaria o texto sem mudar
 * o plano — a pessoa abriria o calendário no dia seguinte com os mesmos números.
 * Conselho que o próprio app contradiz é pior que conselho nenhum.
 *
 * A Fase 6 construiu o que faltava: a primitiva atômica reescreve N treinos numa
 * transação, com versão, histórico e conflito tratado. Desde a **6.3** este
 * código É acionável, e o texto virou ação. O registro fica porque explica por
 * que a espera existiu — não era omissão.
 *
 * ── O ENQUADRAMENTO DO QUE CONTINUA CONSELHO ─────────────────────────────────
 *
 * `aliviar_ritmo` segue sem botão, e o texto continua "MIRE NO SEU ALVO", nunca
 * "mude o plano". Pace é da Fase 3; a Fase 6 escrevê-lo reabriria a corrida que
 * a fundação existe para fechar. É a diferença entre "segure o ritmo no pace que
 * já está lá" (verdadeiro, acionável hoje) e prometer um plano diferente.
 */

export interface AdjustmentCopy {
    /** Selo curto no topo do card. */
    badge: string;
    title: string;
    body: string;
    /** Só para `schedule` — o rótulo do botão sólido. */
    actionLabel?: string;
    /** Texto do diálogo de confirmação, para ações irreversíveis. */
    confirmTitle?: string;
    confirmBody?: string;
    icon: string;
}

export const ADJUSTMENT_COPY: Record<AdjustmentCode, AdjustmentCopy> = {
    adiar_semana: {
        badge: 'Ação disponível',
        title: 'Adiar a semana',
        body: 'Você não concluiu nenhum treino desta semana. Podemos empurrar o que restou do plano para recomeçar a partir de hoje, mantendo os dias que você escolheu.',
        actionLabel: 'Adiar semana',
        confirmTitle: 'Adiar a semana?',
        confirmBody:
            'Os treinos que ainda não foram feitos passam a contar a partir de hoje, no mesmo dia da semana. Os que você já concluiu ficam como estão.',
        icon: 'calendar-outline',
    },
    repetir_semana: {
        badge: 'Ação disponível',
        title: 'Repetir a semana',
        body: 'Faltou metade ou mais das sessões. Repetir a semana preserva a progressão de volume que o plano assume — é melhor que pular direto para a próxima carga.',
        actionLabel: 'Repetir semana',
        confirmTitle: 'Repetir a semana?',
        confirmBody:
            'As sessões que você não fez voltam para o calendário a partir de hoje, e o resto do plano acompanha. Os treinos já concluídos ficam como estão.',
        icon: 'refresh-outline',
    },

    // ── Conselho: MIRE NO ALVO, nunca "mude o plano" ──
    aliviar_ritmo: {
        badge: 'Dica da semana',
        title: 'Segure o ritmo nos dias fáceis',
        body: 'Seus treinos leves saíram mais rápidos que o pace prescrito. O ganho da rodagem leve vem justamente de correr devagar — na próxima, mire no ritmo que já está no treino.',
        icon: 'trending-down-outline',
    },
    // ── Ação desde a 6.3 ──
    reduzir_volume: {
        badge: 'Ação disponível',
        title: 'Aliviar a próxima semana',
        body: 'Você apareceu, mas encurtou as sessões — sinal de que o volume prescrito está acima do que sua rotina comporta agora. Podemos reduzir a próxima semana mantendo o ritmo alvo e preservando seu treino de qualidade.',
        actionLabel: 'Ver como ficaria',
        icon: 'resize-outline',
    },

    manter: {
        badge: 'No trilho',
        title: 'Siga como está',
        body: 'Semana dentro do previsto, em presença e em execução. Nada a ajustar — mantenha o ritmo.',
        icon: 'checkmark-circle-outline',
    },
};

/** Rótulo curto para o card compacto e o modal de entrada. */
export const ADJUSTMENT_SHORT: Record<AdjustmentCode, string> = {
    adiar_semana: 'Sugerimos adiar a semana',
    repetir_semana: 'Sugerimos repetir a semana',
    aliviar_ritmo: 'Segure o ritmo nos dias fáceis',
    reduzir_volume: 'Sugerimos aliviar a próxima semana',
    manter: 'Semana no trilho',
};

/**
 * Códigos que levam a alguma ação — decidido pelo CÓDIGO, não pela classe.
 *
 * ── POR QUE NÃO PELA CLASSE ──────────────────────────────────────────────────
 *
 * `suggested_adjustment` é gravado como jsonb em `plan_week_insights` no momento
 * em que o insight é gerado. Insights criados ANTES da Fase 6.3 têm
 * `class: 'prescription'` congelado ali para `reduzir_volume` — a classe mudou
 * no código, mas as linhas antigas não. Decidir pelo código faz esses insights
 * continuarem acionáveis sem backfill nenhum.
 */
const ACTIONABLE_CODES: ReadonlySet<AdjustmentCode> = new Set<AdjustmentCode>([
    'adiar_semana',
    'repetir_semana',
    'reduzir_volume',
]);

export function isActionable(code: AdjustmentCode): boolean {
    return ACTIONABLE_CODES.has(code);
}

/**
 * O tipo de ação: aplicar direto ou abrir a preview.
 *
 * `schedule` move o calendário e cabe num diálogo de confirmação. `volume`
 * reescreve treinos e precisa que o corredor VEJA o resultado antes — daí a
 * folha, o mesmo contrato da 6.2.
 */
export function actionKindOf(
    code: AdjustmentCode,
): 'schedule' | 'volume' | null {
    if (code === 'adiar_semana' || code === 'repetir_semana') return 'schedule';
    if (code === 'reduzir_volume') return 'volume';
    return null;
}

/**
 * Mensagens de recusa do backend, traduzidas para o usuário.
 *
 * ── CONFLITO NÃO É "TENTE DE NOVO" ───────────────────────────────────────────
 *
 * As duas últimas chaves entraram na Fase 6.2 e são as mais importantes do mapa.
 * Sem elas, um conflito caía no fallback genérico ("Tente novamente em
 * instantes") — conselho ERRADO e um beco sem saída: repetir a mesma requisição
 * contra o mesmo estado velho falha para sempre, e o corredor ficava preso.
 *
 * O texto precisa dizer o que aconteceu (o plano mudou) e o que fazer (olhar de
 * novo), nunca insistir.
 */
export const APPLY_ERROR_COPY: Record<string, string> = {
    already_applied: 'Este ajuste já foi aplicado.',
    nothing_to_shift:
        'Não há treino pendente para mover — seu plano já retoma no futuro.',
    not_actionable: 'Esta sugestão é uma orientação, não um ajuste automático.',
    not_completed: 'Este insight ainda está sendo processado.',
    not_found: 'Não encontramos este insight.',
    revision_conflict:
        'Seu plano mudou desde que você abriu esta tela. Puxe para atualizar e confira a sugestão nova antes de aplicar.',
    row_conflict:
        'Um dos treinos mudou enquanto você decidia. Puxe para atualizar e confira a sugestão nova antes de aplicar.',
};
