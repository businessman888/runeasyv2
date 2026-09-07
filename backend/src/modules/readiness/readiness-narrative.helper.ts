/**
 * A NARRATIVA DETERMINÍSTICA — o que o corredor lê quando a IA não responde.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * Hoje o check-in MORRE se a IA cair: `ReadinessAIService` faz `throw`, e
 * `AIRouterService.call` lança por chave ausente, por bloco de texto ausente,
 * por `JSON.parse` que falha (resposta truncada) e por qualquer erro de rede.
 * Cada um desses vira um 500 em cima de um corredor que já respondeu o quiz.
 *
 * Com o veredito decidido em código, não há mais motivo: o número, a cor e a
 * recomendação existem antes de qualquer chamada de rede. Só o texto depende
 * dela — e texto tem substituto.
 *
 * ── A EXIGÊNCIA DO MOBILE ─────────────────────────────────────────────────────
 *
 * `ReadinessResultScreen` desreferencia `ai_analysis.headline`, `.reasoning` e
 * `.plan_adjustment` SEM guarda. Um campo vazio não degrada: quebra a tela. Por
 * isso `headline` sai de uma TABELA (não de um template que pode render string
 * vazia) e todas as ramificações abaixo são sobre enums fechados.
 */

import {
  PLAN_ADJUSTMENT_LABELS,
  ReadinessDecision,
  SinalDaDimensao,
  StatusColor,
} from './helpers/readiness-score.helper';
import { Dimension } from './helpers/subjective-baseline.helper';

export interface AiAnalysis {
  headline: string;
  reasoning: string;
  plan_adjustment: string;
}

/** Tabela, não template — não existe caminho que produza string vazia. */
const HEADLINES: Record<StatusColor, string> = {
  green: 'Corpo pronto pro plano',
  yellow: 'Dá pra treinar, com cuidado',
  red: 'Hoje o corpo pede pausa',
};

const NOMES: Record<Dimension, string> = {
  sleep: 'o sono',
  legs: 'as pernas',
  mood: 'o humor',
  stress: 'o estresse',
  motivation: 'a motivação',
};

/** Quanto uma dimensão precisa custar para ser citada. */
const DEFICIT_RELEVANTE = 10;

/** A partir de quantos dias parados a pausa vira assunto. */
export const DIAS_PARADO_RELEVANTE = 4;

/**
 * Descreve a carga em palavras — e SÓ quando ela tem o direito de falar.
 *
 * `modulates: false` significa que o motor não sabe o suficiente. Nesse caso a
 * carga não aparece em frase nenhuma: era exatamente disso que o veredito
 * antigo vivia, afirmando "risco de lesão" sobre três corridas.
 */
export function fraseDaCarga(d: ReadinessDecision): string | null {
  const { load } = d;
  if (!load.modulates || load.ratio === null) return null;

  const r = load.ratio;
  if (r >= 1.5)
    return 'Sua carga da semana subiu bem acima do que você vinha sustentando.';
  if (r >= 1.3) return 'Sua carga da semana está acima do seu normal recente.';
  if (r >= 1.1)
    return 'Sua carga da semana está um pouco acima do seu normal recente.';
  if (r >= 0.8)
    return 'Sua carga da semana está em linha com o que você vem sustentando.';
  return 'Sua carga da semana está abaixo do seu normal recente.';
}

/** "Você não corre há N dias" — o contexto que a razão sozinha não dá. */
export function fraseDaPausa(d: ReadinessDecision): string | null {
  const dias = d.load.diasDesdeUltimaCorrida;
  if (dias === null || dias < DIAS_PARADO_RELEVANTE) return null;
  return `Você não corre há ${dias} dias.`;
}

/** As dimensões que puxaram o score para baixo, em ordem de custo. */
function pesaram(signals: SinalDaDimensao[]): SinalDaDimensao[] {
  return signals.filter((s) => s.deficit >= DEFICIT_RELEVANTE).slice(0, 2);
}

/**
 * O texto completo, sem rede.
 *
 * Só usa número que o corredor acabou de digitar (a resposta 1-5) e fatos que o
 * motor mediu. Nunca a pontuação — ela já está na tela, e citá-la em prosa é
 * como o veredito antigo se contradizia.
 */
export function fallbackAnalysis(d: ReadinessDecision): AiAnalysis {
  const partes: string[] = [];

  const destaques = pesaram(d.signals);
  if (destaques.length > 0) {
    const lista = destaques
      .map((s) => `${NOMES[s.dimension]} (${s.answer}/5)`)
      .join(' e ');
    partes.push(
      `Hoje ${lista} ${destaques.length > 1 ? 'foram o que mais pesou' : 'foi o que mais pesou'}.`,
    );
  } else {
    partes.push('Suas respostas de hoje vieram equilibradas.');
  }

  // "comparado com o seu normal" só quando o baseline realmente está sendo usado.
  if (d.signals.some((s) => s.mode !== 'absoluto')) {
    partes.push('Comparei com o seu normal dos últimos check-ins.');
  }

  const pausa = fraseDaPausa(d);
  if (pausa) partes.push(pausa);

  const carga = fraseDaCarga(d);
  if (carga) partes.push(carga);

  return {
    headline: HEADLINES[d.color],
    reasoning: partes.join(' '),
    plan_adjustment:
      capitalizar(PLAN_ADJUSTMENT_LABELS[d.planAdjustment]) + '.',
  };
}

/**
 * Substitui campo a campo o que a IA não entregou.
 *
 * Mais estrito que o all-or-nothing do insight semanal, e o motivo é o mobile:
 * uma resposta PARCIAL (headline boa, reasoning vazio) produziria `undefined`
 * numa tela que desreferencia os três sem guarda.
 */
export function completarComFallback(
  bruto: Partial<AiAnalysis> | null | undefined,
  d: ReadinessDecision,
): AiAnalysis {
  const base = fallbackAnalysis(d);
  return {
    headline: texto(bruto?.headline) ?? base.headline,
    reasoning: texto(bruto?.reasoning) ?? base.reasoning,
    plan_adjustment: texto(bruto?.plan_adjustment) ?? base.plan_adjustment,
  };
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
