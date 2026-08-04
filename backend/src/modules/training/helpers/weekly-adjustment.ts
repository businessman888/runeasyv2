/**
 * Decisão determinística do reajuste sugerido da semana.
 *
 * ── O PRINCÍPIO ───────────────────────────────────────────────────────────────
 *
 * Número é cálculo; a IA só dá voz. Esta função é a decisão inteira — o Haiku
 * recebe o `code` já escolhido e apenas o narra. Nenhum modelo escolhe ajuste
 * de treino aqui, e isso é deliberado: a mesma semana tem que produzir sempre a
 * mesma sugestão, e a regra tem que ser auditável quando alguém perguntar
 * "por que ele me mandou aliviar?".
 *
 * ── AS DUAS PERGUNTAS ─────────────────────────────────────────────────────────
 *
 * A escada separa duas coisas que a aderência sozinha confunde:
 *
 *   1. VOCÊ APARECEU?   `completionRate` = concluídos ÷ planejados (sessões)
 *   2. QUANDO APARECEU, CUMPRIU?  `executionRatio` = Σ distance_run ÷ Σ
 *      distance_km, SÓ DOS CONCLUÍDOS
 *
 * Sem essa separação, quem faz 3 de 5 treinos correndo a distância cheia em
 * todos recebe "reduza o volume" — conselho errado, porque o volume não foi o
 * problema; a agenda foi. Faltar sessão é problema de CALENDÁRIO (classe
 * `schedule`); correr menos do que o prescrito nas sessões que fez é problema
 * de PRESCRIÇÃO (classe `prescription`).
 *
 * ── AS CLASSES ────────────────────────────────────────────────────────────────
 *
 * `schedule`     — mexe só em data/status dos treinos. APLICÁVEL HOJE, com
 *                  segurança, via `shift_pending_workouts`: `plan_json` não
 *                  guarda data nem status, então não há o que dessincronizar.
 * `prescription` — mexe em volume/pace prescritos. SÓ SUGESTÃO até a Fase 6:
 *                  seria o primeiro write a dessincronizar `plan_json` de
 *                  `workouts` (hoje eles batem em 100% das semanas), e exigiria
 *                  redistribuir os segmentos de `instructions_json`, o que é o
 *                  pipeline de geração inteiro.
 *
 * O botão que APLICA a classe `schedule` é a Fase 2B. A 2A só decide e persiste.
 *
 * ── FORA DE ESCOPO ────────────────────────────────────────────────────────────
 *
 * Carga interna (ACWR, sRPE) é Fase 7. Esta escada decide só com aderência,
 * volume e pace — dados que já existem hoje.
 */

export type AdjustmentCode =
  | 'manter'
  | 'aliviar_ritmo'
  | 'reduzir_volume'
  | 'repetir_semana'
  | 'adiar_semana';

export type AdjustmentClass = 'schedule' | 'prescription' | 'none';

export type AdjustmentReason =
  | 'semana_sem_treino'
  | 'ausencia_severa'
  | 'ritmo_acima_do_prescrito'
  | 'volume_abaixo_do_prescrito'
  | 'no_trilho';

export interface SuggestedAdjustment {
  code: AdjustmentCode;
  class: AdjustmentClass;
  /** Chave estável para a UI e para os testes — nunca texto de exibição. */
  reason: AdjustmentReason;
  /** Os números que dispararam a regra, para auditoria e para o prompt. */
  metrics: Record<string, number>;
}

// ── Limiares ─────────────────────────────────────────────────────────────────
// Conservadores de propósito e REVISÁVEIS: são a primeira calibragem, feita sem
// nenhuma semana real em produção. Revisar quando houver histórico.

/**
 * Ausência severa = pelo menos METADE das sessões faltando. `<=` e não `<`
 * porque "metade faltando" inclui 2 de 4.
 */
export const SEVERE_ABSENCE_COMPLETION_PCT = 50;

/** Abaixo disso, o atleta apareceu mas não cobriu a distância prescrita. */
export const VOLUME_SHORTFALL_EXECUTION_PCT = 85;

/**
 * Margem (s/km) a partir da qual um treino fácil conta como "rápido demais".
 * 15 s/km é maior que a variação normal de terreno e GPS — abaixo disso o sinal
 * seria ruído.
 */
export const EASY_PACE_TOLERANCE_SEC = 15;

/**
 * Mínimo de treinos fáceis MEDIDOS na semana para o cue de intensidade poder
 * disparar. Com n=1, uma única subida forte viraria diagnóstico.
 */
export const MIN_EASY_RUNS_FOR_INTENSITY_CUE = 2;

/** Fração dos treinos fáceis que precisa estar rápida demais. */
export const INTENSITY_CUE_FASTER_SHARE_PCT = 50;

export interface AdjustmentInput {
  plannedWorkouts: number;
  completedWorkouts: number;
  /** % de sessões concluídas. */
  completionRate: number;
  /** % de Σ distance_run ÷ Σ distance_km, só dos concluídos. `0` se nada concluído. */
  executionRatio: number;
  /** Treinos de zona fácil (Z1/Z2) com pace esperado E executado disponíveis. */
  easyRunsMeasured: number;
  /** Destes, quantos saíram `EASY_PACE_TOLERANCE_SEC` (ou mais) abaixo do alvo. */
  easyRunsTooFast: number;
}

/**
 * A escada, avaliada EM ORDEM. A primeira regra que casa vence.
 *
 * Presença (1-2) antes de execução (3-4): quem não apareceu não tem execução
 * para julgar — o `executionRatio` de uma semana com 1 treino concluído é uma
 * amostra de tamanho 1.
 *
 * Intensidade (3) antes de volume (4): correr rápido demais é o erro mais comum
 * de quem está começando e o de maior custo (é assim que se lesiona), e quando
 * os dois disparam juntos aliviar o ritmo costuma resolver os dois — quem
 * segura o pace consegue fechar a distância.
 */
export function decideAdjustment(input: AdjustmentInput): SuggestedAdjustment {
  const {
    plannedWorkouts,
    completedWorkouts,
    completionRate,
    executionRatio,
    easyRunsMeasured,
    easyRunsTooFast,
  } = input;

  const base = { plannedWorkouts, completedWorkouts, completionRate };

  // 1. Ninguém treinou. Empurrar a semana é o único conselho honesto — reduzir
  //    volume de quem não correu nada não diz nada.
  if (completedWorkouts === 0) {
    return {
      code: 'adiar_semana',
      class: 'schedule',
      reason: 'semana_sem_treino',
      metrics: { ...base },
    };
  }

  // 2. Ausência severa: metade ou mais das sessões faltando. Refazer a semana
  //    preserva a progressão de volume, que é o que a rampa do plano assume.
  if (completionRate <= SEVERE_ABSENCE_COMPLETION_PCT) {
    return {
      code: 'repetir_semana',
      class: 'schedule',
      reason: 'ausencia_severa',
      metrics: { ...base, threshold: SEVERE_ABSENCE_COMPLETION_PCT },
    };
  }

  // 3. O cue central do dia a dia: correu os fáceis rápido demais. Escopo
  //    restrito a Z1/Z2 de propósito — num Z4 correr rápido É o objetivo.
  if (
    easyRunsMeasured >= MIN_EASY_RUNS_FOR_INTENSITY_CUE &&
    easyRunsTooFast * 100 >= easyRunsMeasured * INTENSITY_CUE_FASTER_SHARE_PCT
  ) {
    return {
      code: 'aliviar_ritmo',
      class: 'prescription',
      reason: 'ritmo_acima_do_prescrito',
      metrics: {
        ...base,
        easyRunsMeasured,
        easyRunsTooFast,
        toleranceSec: EASY_PACE_TOLERANCE_SEC,
      },
    };
  }

  // 4. Apareceu, mas encurtou as sessões. Aí sim o volume prescrito é o suspeito.
  if (executionRatio > 0 && executionRatio < VOLUME_SHORTFALL_EXECUTION_PCT) {
    return {
      code: 'reduzir_volume',
      class: 'prescription',
      reason: 'volume_abaixo_do_prescrito',
      metrics: {
        ...base,
        executionRatio,
        threshold: VOLUME_SHORTFALL_EXECUTION_PCT,
      },
    };
  }

  return {
    code: 'manter',
    class: 'none',
    reason: 'no_trilho',
    metrics: { ...base, executionRatio },
  };
}

/** Rótulos PT-BR — para o prompt do Haiku e para o fallback determinístico. */
export const ADJUSTMENT_LABELS: Record<AdjustmentCode, string> = {
  manter: 'manter o plano como está',
  aliviar_ritmo: 'aliviar o ritmo dos treinos fáceis',
  reduzir_volume: 'reduzir o volume da próxima semana',
  repetir_semana: 'repetir a semana',
  adiar_semana: 'adiar a semana',
};
