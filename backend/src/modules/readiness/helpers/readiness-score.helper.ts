/**
 * O SCORE DE PRONTIDÃO — decisão inteira, em código determinístico.
 *
 * ── O PRINCÍPIO ───────────────────────────────────────────────────────────────
 *
 * Número é cálculo; a IA só dá voz. Esta função é a decisão completa — o modelo
 * recebe o score, a cor e a recomendação já escolhidos e apenas os narra. Mesmo
 * molde de `decideAdjustment` (Fase 2A).
 *
 * O motivo não é doutrina. Medido em produção: dois check-ins com média 4,2 do
 * quiz foram gravados pelo Haiku como `score = 42, red` — pela própria regra do
 * prompt dele o resultado seria 84/verde. O modelo erra a aritmética que ele
 * mesmo recebeu por escrito, e o erro chega ao corredor com cara de laudo.
 *
 * ── A HIERARQUIA ──────────────────────────────────────────────────────────────
 *
 *   O QUIZ É A VOZ.       A cor sai 100% do subjetivo.
 *   A CARGA MODULA.       ±10 pontos, APARADOS na borda da faixa — a carga
 *                         nunca muda a cor. Quem muda a cor é o corredor.
 *
 * É a inversão da hierarquia quebrada de hoje, onde um ACWR ruidoso atropelava
 * um corredor que reportou sono 5 e pernas 4.
 */

import { QUALITY_TYPES } from '../../../common/workout-types';
import type { LoadSignal } from './load-series.helper';
import {
  BASELINE_FULL_N,
  BASELINE_MIN_N,
  Baselines,
  Dimension,
  READINESS_DIMENSIONS,
  devWeight,
  isValidAnswer,
} from './subjective-baseline.helper';

export type StatusColor = 'green' | 'yellow' | 'red';
export type BaselineMode = 'absoluto' | 'misto' | 'desvio';

// ── Limiares ─────────────────────────────────────────────────────────────────

/**
 * O peso de cada dimensão. **Soma exatamente 1,00** — e há um teste para isso,
 * porque uma soma à deriva reescala a faixa 0-100 inteira em silêncio.
 *
 * `legs` é o mais alto porque é ele que carrega a DOR: 24 dos 40 conjuntos de
 * perguntas em produção perguntam literalmente sobre dor/desconforto/lesão
 * nessa dimensão ("Escala de dor de 0 a 10", "Presença de DOMS ou lesões"). Foi
 * por isso que a 6ª pergunta de dor NÃO foi criada — ela duplicaria a pergunta
 * em ≥60% dos dias.
 *
 * `mood` é o mais baixo por ser o mais volátil e o menos fisiológico.
 */
export const DIMENSION_WEIGHTS: Readonly<Record<Dimension, number>> = {
  legs: 0.3,
  sleep: 0.25,
  stress: 0.2,
  motivation: 0.15,
  mood: 0.1,
};

/** Faixas do semáforo. Iguais às do prompt antigo, para as linhas já gravadas continuarem legíveis. */
export const GREEN_MIN = 70;
export const YELLOW_MIN = 40;

/** Teto absoluto da modulação por carga. */
export const LOAD_DELTA_MAX = 10;

/**
 * Quanto o desvio RECENTRA o nível, de 0 (nada) a 1 (totalmente).
 *
 * ⚠️ Sem recentragem o desvio é um NO-OP aritmético:
 *
 *     subDev(v) = subAbs(m) + (v−m)·25 = (m−1)·25 + (v−m)·25 = (v−1)·25 = subAbs(v)
 *
 * Ancorar na mediana mantendo a inclinação dá exatamente o valor absoluto de
 * volta. E recentrar 100% é o erro oposto: quem sempre responde 5 ficaria preso
 * em 50 (amarelo) por se sentir ótimo. Meio a meio preserva parte do nível
 * absoluto e parte da informação "isto é bom PARA VOCÊ".
 */
export const RECENTER_ALPHA = 0.5;

/** Inclinação da escala: 1 ponto de resposta = 25 pontos de sub-score. */
export const POINTS_PER_ANSWER_UNIT = 25;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface SinalDaDimensao {
  dimension: Dimension;
  /** A resposta de hoje, 1-5. */
  answer: number;
  mode: BaselineMode;
  n: number;
  median: number | null;
  /** 0..1 — o quanto o desvio pesou. `mode` é derivado dele. */
  devWeight: number;
  /** 0-100, já combinando absoluto e desvio. NÃO arredondado. */
  subScore: number;
  /** `w × (100 − subScore)`: o quanto esta dimensão custou. Ordena a narrativa. */
  deficit: number;
}

export type PlanAdjustmentCode =
  | 'manter'
  | 'reduzir_intensidade'
  | 'reduzir_volume'
  | 'descanso_ativo'
  | 'dia_off';

/** Rótulos PT-BR — para o prompt e para o fallback determinístico. */
export const PLAN_ADJUSTMENT_LABELS: Record<PlanAdjustmentCode, string> = {
  manter: 'manter o treino como está',
  reduzir_intensidade: 'reduzir a intensidade de hoje',
  reduzir_volume: 'reduzir o volume de hoje',
  descanso_ativo: 'trocar por descanso ativo',
  dia_off: 'tirar o dia de folga',
};

/** Rótulo curto do semáforo. AVISO, não emergência médica. */
export const STATUS_LABELS: Record<StatusColor, string> = {
  green: 'Pronto para treinar',
  yellow: 'Sinal amarelo — atenção',
  red: 'Dia de recuperação',
};

export interface ReadinessDecision {
  /** 0-100 inteiro, JÁ com a carga aplicada. */
  score: number;
  /** 0-100 inteiro, só quiz. É quem decide a cor. */
  baseScore: number;
  color: StatusColor;
  statusLabel: string;
  /** O que a escada de carga pediu, −10..+10. */
  loadDeltaRaw: number;
  /** O que sobrou depois do clamp de banda. */
  loadDeltaApplied: number;
  /** `true` quando a borda da faixa comeu parte (ou tudo) do delta. */
  clampedByBand: boolean;
  /** As 5 dimensões, ordenadas por `deficit` desc. */
  signals: SinalDaDimensao[];
  planAdjustment: PlanAdjustmentCode;
  load: LoadSignal;
}

export interface ReadinessScoreInput {
  answers: Record<Dimension, number>;
  baselines: Baselines;
  load: LoadSignal;
  todayWorkoutType?: string | null;
  todayIsRaceDay?: boolean;
}

// ── As peças ─────────────────────────────────────────────────────────────────

export function colorFor(score: number): StatusColor {
  if (score >= GREEN_MIN) return 'green';
  if (score >= YELLOW_MIN) return 'yellow';
  return 'red';
}

/** O intervalo fechado de scores que pertencem a uma cor. */
export function bandRange(color: StatusColor): [number, number] {
  if (color === 'green') return [GREEN_MIN, 100];
  if (color === 'yellow') return [YELLOW_MIN, GREEN_MIN - 1];
  return [0, YELLOW_MIN - 1];
}

/** Resposta 1-5 → 0-100, linear. */
export function subAbs(v: number): number {
  return (v - 1) * POINTS_PER_ANSWER_UNIT;
}

/** Resposta 1-5 → 0-100, recentrado na mediana do próprio corredor. */
export function subDev(v: number, m: number): number {
  const centro = 50 + RECENTER_ALPHA * (subAbs(m) - 50);
  return clamp(centro + (v - m) * POINTS_PER_ANSWER_UNIT, 0, 100);
}

/**
 * A escada da carga. Primeira regra que casa vence.
 *
 * Razão BAIXA não ganha bônus de propósito: pode ser polimento antes de prova
 * ou pode ser férias, e nenhum λ separa os dois (medido: 1,44 vs 4,22 com 28
 * dias). Premiar férias seria errado; punir polimento também. Quem conta essa
 * história é `diasDesdeUltimaCorrida`, na narrativa.
 */
export function loadDeltaFor(load: LoadSignal): number {
  if (!load.modulates || load.ratio === null) return 0;
  const r = load.ratio;
  if (r >= 1.5) return -LOAD_DELTA_MAX;
  if (r >= 1.3) return -6;
  if (r >= 1.1) return -2;
  if (r >= 0.8) return 4;
  return 0;
}

// ── A decisão ────────────────────────────────────────────────────────────────

export function decideReadiness(input: ReadinessScoreInput): ReadinessDecision {
  const { answers, baselines, load } = input;

  const signals: SinalDaDimensao[] = READINESS_DIMENSIONS.map((d) => {
    // Resposta inválida cai para o meio da escala: é o único valor que não
    // inventa nem otimismo nem alarme. O DTO já valida 1-5 na entrada; esta é a
    // guarda de quem chama o helper direto.
    const answer = isValidAnswer(answers[d]) ? answers[d] : 3;
    const base = baselines[d] ?? { n: 0, median: null };
    const w = base.median !== null ? devWeight(base.n) : 0;

    const abs = subAbs(answer);
    const sub = w > 0 ? (1 - w) * abs + w * subDev(answer, base.median) : abs;

    return {
      dimension: d,
      answer,
      mode: w === 0 ? 'absoluto' : w === 1 ? 'desvio' : 'misto',
      n: base.n,
      median: base.median,
      devWeight: w,
      subScore: sub,
      deficit: DIMENSION_WEIGHTS[d] * (100 - sub),
    };
  });

  // ⚠️ Arredondar só DUAS vezes em toda a função: aqui, para a cor, e no clamp
  // final. Arredondar sub-scores intermediários quebraria a continuidade da
  // rampa do baseline por ±1 ponto espúrio.
  const baseScoreRaw = signals.reduce(
    (acc, s) => acc + DIMENSION_WEIGHTS[s.dimension] * s.subScore,
    0,
  );
  const baseScore = Math.round(baseScoreRaw);
  const color = colorFor(baseScore);

  const loadDeltaRaw = loadDeltaFor(load);
  const [piso, teto] = bandRange(color);
  const score = clamp(baseScore + loadDeltaRaw, piso, teto);
  const loadDeltaApplied = score - baseScore;

  const ordenados = [...signals].sort((a, b) => b.deficit - a.deficit);

  return {
    score,
    baseScore,
    color,
    statusLabel: STATUS_LABELS[color],
    loadDeltaRaw,
    loadDeltaApplied,
    clampedByBand: loadDeltaApplied !== loadDeltaRaw,
    signals: ordenados,
    planAdjustment: decidePlanAdjustment(color, ordenados, load, input),
    load,
  };
}

/**
 * A regra de PRIORIDADE MÁXIMA sai do prompt e vira escada.
 *
 * Ela estava escrita em prosa no system prompt ("Se Treino de Hoje = 'Alta
 * Intensidade' E 'Pernas' <= 2, sugira obrigatoriamente um Downgrade") e
 * dependia de um mapa privado de intensidade que não conhecia `race_simulation`
 * nem `repetition` — os dois caíam em 'Moderada' e DESLIGAVAM a regra. Aqui o
 * teste é pertencimento a `QUALITY_TYPES`, o conjunto canônico.
 */
function decidePlanAdjustment(
  color: StatusColor,
  signals: SinalDaDimensao[],
  load: LoadSignal,
  input: ReadinessScoreInput,
): PlanAdjustmentCode {
  // Dia de prova é intocável — o resto do repositório trata `is_race_day` assim.
  if (input.todayIsRaceDay) return 'manter';

  if (color === 'red') return 'dia_off';

  const tipo = input.todayWorkoutType ?? '';
  if (color === 'yellow' && QUALITY_TYPES.has(tipo))
    return 'reduzir_intensidade';

  const legs = signals.find((s) => s.dimension === 'legs');
  const sleep = signals.find((s) => s.dimension === 'sleep');
  if ((legs?.subScore ?? 100) <= 25 || (sleep?.subScore ?? 100) <= 25) {
    return 'descanso_ativo';
  }

  if (load.modulates && (load.ratio ?? 0) >= 1.3) return 'reduzir_volume';

  return 'manter';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export { BASELINE_FULL_N, BASELINE_MIN_N };
