import type {
    AdjustmentCode,
    AdjustmentClass,
} from '../../types/weeklyInsight.types';

/**
 * O texto da bandeja de reajuste — e a regra de enquadramento que ele carrega.
 *
 * ── AÇÃO × CONSELHO ──────────────────────────────────────────────────────────
 *
 * A classe do enum (decidida no backend, Fase 2A) governa o formato:
 *
 *   `schedule`     → botão sólido que EXECUTA (re-ancora o plano)
 *   `prescription` → card de orientação SEM botão
 *
 * Regra de ouro: botão sólido executa; card sem botão é para ler e aplicar. O
 * usuário nunca toca esperando ação e não recebe nada.
 *
 * ── POR QUE `prescription` NÃO TEM BOTÃO ─────────────────────────────────────
 *
 * Aplicar de verdade um "reduzir volume" significa reescrever os treinos
 * futuros — o que é Fase 6. Se o app oferecesse o botão hoje, ele mudaria o
 * texto sem mudar o plano, e a pessoa abriria o calendário no dia seguinte com
 * os mesmos números de antes. Conselho que o próprio app contradiz é pior que
 * conselho nenhum.
 *
 * ── O ENQUADRAMENTO ──────────────────────────────────────────────────────────
 *
 * Por isso o texto de `prescription` é sempre "MIRE NO SEU ALVO", nunca "mude o
 * plano". O alvo já está prescrito em cada treino; o conselho é sobre executá-lo
 * melhor, não sobre desviar dele. É a diferença entre "segure o ritmo no pace
 * que já está lá" (verdadeiro, acionável hoje) e "reduza seu volume" (que o
 * plano não vai refletir).
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
    reduzir_volume: {
        badge: 'Dica da semana',
        title: 'Feche a distância dos treinos',
        body: 'Você apareceu, mas encurtou as sessões. Antes de buscar mais volume, mire em completar a distância que cada treino já pede — é ela que sustenta a progressão.',
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
    reduzir_volume: 'Feche a distância dos treinos',
    manter: 'Semana no trilho',
};

export function isActionable(cls: AdjustmentClass): boolean {
    return cls === 'schedule';
}

/** Mensagens de recusa do backend, traduzidas para o usuário. */
export const APPLY_ERROR_COPY: Record<string, string> = {
    already_applied: 'Este ajuste já foi aplicado.',
    nothing_to_shift:
        'Não há treino pendente para mover — seu plano já retoma no futuro.',
    not_actionable: 'Esta sugestão é uma orientação, não um ajuste automático.',
    not_completed: 'Este insight ainda está sendo processado.',
    not_found: 'Não encontramos este insight.',
};
