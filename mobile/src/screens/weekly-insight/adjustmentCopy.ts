import type {
    AdjustmentCode,
    WeeklyInsight,
    Zone,
} from '../../types/weeklyInsight.types';
import { formatPaceLabel } from '../../utils/pace';

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
 *
 * A Fase **6.4** deu nome a esse enquadramento: **a faixa já é a orientação; o
 * app só ensina a lê-la.** O plano prescreve `pace_min–pace_max`, e o cue
 * dispara quando o corredor passa da borda RÁPIDA. Então a mensagem verdadeira
 * não é "seu plano vai mudar" nem "ignore o número" — é "mire na ponta lenta da
 * sua faixa nesta semana". Toda superfície fecha com **"Seu plano não muda."**
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
    // Este é o FALLBACK. Quando a linha do insight traz os números medidos,
    // `buildEffortCueCopy` monta um corpo concreto por cima deste.
    aliviar_ritmo: {
        badge: 'Dica da semana',
        title: 'Segure na ponta lenta',
        body: 'Seus treinos leves saíram mais rápidos que o alvo. O ganho da rodagem leve vem justamente de correr devagar — mire na ponta lenta da faixa que já está no seu treino. Seu plano não muda.',
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

// ─── Fase 6.4 — a orientação de esforço, ancorada em número medido ───────────

/**
 * Os números do PRÓPRIO corredor que sustentam o conselho `aliviar_ritmo`.
 *
 * ⚠️ ── A ARMADILHA DE PRECISÃO (ler antes de mexer na copy) ─────────────────
 *
 * `avgDeltaSec` é medido contra o **CENTRO** da faixa prescrita; o cue dispara
 * contra a **BORDA RÁPIDA** (`pace_min`). Os dois números descrevem coisas
 * diferentes, e escrever "X s/km acima da borda rápida" usando `avgDeltaSec`
 * produziria um número FALSO na tela — o tipo de erro que este app trata como
 * pior que não dizer nada.
 *
 * Por isso esta função NÃO devolve delta. Devolve só o par (executado,
 * previsto) e a contagem, cada um rotulado exatamente pelo que é. Quem escreve
 * a frase não tem como confundir o que não recebeu.
 */
export interface EffortCueDiagnosis {
    /** Treinos fáceis com pace esperado E executado disponíveis. */
    easyMeasured: number;
    /** Destes, quantos saíram rápidos demais (além da tolerância). */
    easyTooFast: number;
    /** Média EXECUTADA dos leves, em segundos/km. */
    actualSec: number | null;
    /** Média PREVISTA dos leves (centro da faixa), em segundos/km. */
    expectedSec: number | null;
}

const EASY_ZONES: Zone[] = ['Z1', 'Z2'];

/**
 * Extrai o diagnóstico da linha do insight. `null` quando a sugestão não é
 * `aliviar_ritmo` — o cue não existe fora dele.
 *
 * Nada aqui é calculado: os números já vêm decididos do backend (Fase 2A). O
 * app só escolhe QUAL zona fácil representa a semana — a de maior amostra,
 * porque uma média de 1 treino não descreve um hábito.
 */
export function deriveEffortCue(
    insight: WeeklyInsight | null | undefined,
): EffortCueDiagnosis | null {
    const adjustment = insight?.suggested_adjustment;
    if (!insight || adjustment?.code !== 'aliviar_ritmo') return null;

    const metrics = adjustment.metrics ?? {};
    const easyMeasured = Number(metrics.easyRunsMeasured) || 0;
    const easyTooFast = Number(metrics.easyRunsTooFast) || 0;

    const intensity = insight.intensity_adherence ?? {};
    const bucket = EASY_ZONES.map((z) => intensity[z]).reduce(
        (melhor, atual) =>
            atual && (atual.n ?? 0) > (melhor?.n ?? 0) ? atual : melhor,
        undefined as (typeof intensity)[Zone] | undefined,
    );

    return {
        easyMeasured,
        easyTooFast,
        actualSec: bucket?.avgActualSec || null,
        expectedSec: bucket?.avgExpectedSec || null,
    };
}

/**
 * A copy do card âmbar, concreta quando há dado e genérica quando não há.
 *
 * O corpo estático de `ADJUSTMENT_COPY` continua sendo a rede: um insight sem
 * `intensity_adherence` (semana sem pace medido) ainda recebe um conselho
 * legível, só sem os números.
 */
export function buildEffortCueCopy(
    insight: WeeklyInsight | null | undefined,
): AdjustmentCopy {
    const base = ADJUSTMENT_COPY.aliviar_ritmo;
    const cue = deriveEffortCue(insight);
    if (!cue) return base;

    const partes: string[] = [];

    if (cue.easyMeasured > 0 && cue.easyTooFast > 0) {
        const um = cue.easyTooFast === 1;
        partes.push(
            `${cue.easyTooFast} dos ${cue.easyMeasured} leves ${
                um ? 'saiu mais rápido' : 'saíram mais rápidos'
            } que o alvo`,
        );
    }

    if (cue.actualSec && cue.expectedSec) {
        // "média de X contra Y previsto" — cada número dito pelo que ele é.
        // NUNCA "X s/km acima da borda rápida": ver a armadilha em
        // `EffortCueDiagnosis`.
        partes.push(
            `média de ${formatPaceLabel(cue.actualSec)}/km contra ${formatPaceLabel(
                cue.expectedSec,
            )}/km previsto`,
        );
    }

    if (partes.length === 0) return base;

    return {
        ...base,
        body:
            `${capitalizar(partes.join(' — '))}. O ganho da rodagem leve vem de correr devagar: ` +
            'mire na ponta lenta da faixa que já está no seu treino. Seu plano não muda.',
    };
}

function capitalizar(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
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
