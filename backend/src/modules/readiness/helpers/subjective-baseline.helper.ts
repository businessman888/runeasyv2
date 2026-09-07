/**
 * O BASELINE DO SUBJETIVO — por dimensão, por corredor, sem migration.
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────────
 *
 * "Sono 3" não significa a mesma coisa para duas pessoas. Quem dorme mal a vida
 * toda responde 3 num dia bom; quem dorme bem responde 3 num dia ruim. A régua
 * absoluta pune o primeiro para sempre por uma linha de base que ele não
 * controla, e nunca percebe quando o segundo piorou.
 *
 * O sinal certo é o DESVIO do normal da própria pessoa.
 *
 * ── A FONTE ───────────────────────────────────────────────────────────────────
 *
 * `readiness_history.check_in_answers` — jsonb com as cinco chaves inteiras
 * 1-5, já gravado a cada check-in. Nenhuma coluna nova, nenhuma tabela nova.
 *
 * ── POR QUE MEDIANA, E NÃO MÉDIA NEM Z-SCORE ──────────────────────────────────
 *
 * Numa escala ordinal de 5 pontos com N pequeno, a média inventa precisão que a
 * escala não tem e um único dia terrível arrasta o normal. O z-score é pior:
 * com 10 inteiros em 1..5 o desvio-padrão amostral é instável e frequentemente
 * ZERO (alguém que respondeu 4 dez vezes), o que explode a divisão. A mediana é
 * o resumo honesto, e o helper devolve `null` quando não há amostra em vez de
 * fabricar um centro.
 */

export type Dimension = 'sleep' | 'legs' | 'mood' | 'stress' | 'motivation';

/**
 * As cinco dimensões, como TUPLA — e a iteração é sempre sobre ela.
 *
 * ⚠️ NUNCA usar `Object.keys(check_in_answers)`. A coluna é jsonb sem CHECK, e
 * o dia em que uma 6ª chave aparecer (a pergunta de dor própria, ou lixo de um
 * cliente antigo) uma implementação por `Object.keys` ou quebra ou repondera o
 * score em silêncio. Iterando a tupla, chave nova é simplesmente ignorada.
 */
export const READINESS_DIMENSIONS: readonly Dimension[] = [
  'sleep',
  'legs',
  'mood',
  'stress',
  'motivation',
] as const;

/**
 * Mínimo de check-ins para uma dimensão COMEÇAR a usar desvio.
 *
 * Em N = 10 exatamente o peso do desvio ainda é ZERO — ver `devWeight`. Ou seja:
 * "N ≥ 10 para trocar" é implementado como "N ≥ 10 para começar a trocar", e o
 * ponto de troca não tem degrau nenhum.
 */
export const BASELINE_MIN_N = 10;

/** A partir daqui o desvio vale integralmente. */
export const BASELINE_FULL_N = 20;

export interface DimensionBaseline {
  /** Check-ins VÁLIDOS desta dimensão. Hoje nunca entra. */
  n: number;
  /** `null` quando `n === 0`. */
  median: number | null;
}

export type Baselines = Record<Dimension, DimensionBaseline>;

/** Uma resposta é válida se for inteiro de 1 a 5. O resto é ruído de jsonb. */
export function isValidAnswer(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Mediana de uma amostra. `null` para amostra vazia — nunca 0, nunca 3.
 *
 * Com N par devolve a média dos dois centrais, então pode terminar em `,5`;
 * isso é desejado (o centro de alguém que oscila entre 3 e 4 é 3,5).
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ord = [...values].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}

/**
 * O peso do desvio para uma dimensão com `n` check-ins.
 *
 * Rampa linear de `BASELINE_MIN_N` a `BASELINE_FULL_N`, e a rampa existe por um
 * motivo concreto: uma troca dura em N=10 moveria a dimensão de quem sempre
 * responde 5 em 25 pontos de uma vez — o suficiente para o score cruzar de
 * verde para amarelo sem o corredor ter mudado uma resposta sequer. Com a
 * rampa, a deriva máxima é 2,5 pontos por check-in numa dimensão.
 */
export function devWeight(n: number): number {
  if (n < BASELINE_MIN_N) return 0;
  const t = (n - BASELINE_MIN_N) / (BASELINE_FULL_N - BASELINE_MIN_N);
  return Math.max(0, Math.min(1, t));
}

/**
 * Monta o baseline de cada dimensão a partir do histórico.
 *
 * `rows` são os `check_in_answers` já lidos do banco, **sem o de hoje** — hoje
 * não pode entrar no próprio baseline. Linhas malformadas (null, chave faltando,
 * `"4"` string, 0, 6) são descartadas POR DIMENSÃO: uma resposta de sono
 * inválida não invalida as pernas da mesma linha.
 */
export function buildBaselines(
  rows: Array<Record<string, unknown> | null | undefined>,
): Baselines {
  const amostras: Record<Dimension, number[]> = {
    sleep: [],
    legs: [],
    mood: [],
    stress: [],
    motivation: [],
  };

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const d of READINESS_DIMENSIONS) {
      const v = row[d];
      if (isValidAnswer(v)) amostras[d].push(v);
    }
  }

  const out = {} as Baselines;
  for (const d of READINESS_DIMENSIONS) {
    out[d] = { n: amostras[d].length, median: median(amostras[d]) };
  }
  return out;
}
