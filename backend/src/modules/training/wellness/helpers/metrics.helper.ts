/**
 * Matemática de métrica compartilhada — delta semana-a-semana, sparkline de 7
 * dias, pace médio ponderado e frequência-alvo.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * Estas quatro funções viviam como métodos privados / closures internos dentro
 * de `WellnessService.buildPerformanceBlock` e `RetrospectiveService`. Ambos
 * calculam a mesma coisa, e o insight semanal (Fase 2A) precisa exatamente
 * dela outra vez — a terceira cópia seria a que começa a divergir em silêncio.
 *
 * Tudo aqui é PURO: nenhuma query, nenhum `Date.now()`, nenhum fuso implícito.
 * O chamador traz as linhas e a janela já resolvidas.
 */

import { paceValueToSecondsPerKm } from '../../../../common/pace-calculator';
import { toSaoPauloDateStr } from './streak.helper';

/** Espelha `PerformanceMetricDto` — repetido aqui para o helper não depender do DTO. */
export interface MetricPoint {
  value: number;
  prevValue: number;
  /** `null` quando não há base de comparação. Ver `buildMetric`. */
  deltaPct: number | null;
  /** 7 posições, domingo→sábado da janela. */
  sparkline: number[];
}

/** Arredonda para 2 casas. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Uma métrica com sua variação percentual contra o período anterior.
 *
 * `deltaPct` é `null` — não `0` — quando `prevValue <= 0`. A distinção importa
 * para quem renderiza: "não havia base de comparação" é diferente de "não
 * mudou", e mostrar `0%` na primeira semana de um plano seria mentira.
 */
export function buildMetric(
  value: number,
  prevValue: number,
  sparkline: number[],
): MetricPoint {
  let deltaPct: number | null = null;
  if (prevValue > 0) {
    deltaPct = Math.round(((value - prevValue) / prevValue) * 1000) / 10;
  }
  return { value, prevValue, deltaPct, sparkline };
}

/** Linha com um instante em ISO (UTC) — `activities.start_date`. */
export interface DatedRow {
  start_date: string;
}

/**
 * Distribui as linhas em 7 baldes a partir de `startStr`, somando `pick`.
 *
 * O balde é o DIA LOCAL DE SÃO PAULO da linha, não o dia UTC: uma corrida às
 * 22h de São Paulo é 01h UTC do dia seguinte, e sem essa conversão apareceria
 * no balde errado (ou fora da janela).
 *
 * Linhas fora de `[startStr, startStr+6]` são ignoradas. A versão anterior
 * tinha uma "rede de segurança" que jogava o excedente no balde do dia da
 * semana em UTC — o que silenciosamente somava dados de fora da janela no
 * gráfico. Ignorar é honesto; a soma total já vem de outro caminho.
 */
export function sparkline7<T extends DatedRow>(
  rows: T[],
  startStr: string,
  pick: (row: T) => number,
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const startMs = Date.parse(startStr);

  for (const row of rows) {
    const dayStr = toSaoPauloDateStr(row.start_date);
    const diffDays = Math.round(
      (Date.parse(dayStr) - startMs) / (1000 * 60 * 60 * 24),
    );
    if (diffDays >= 0 && diffDays < 7) {
      buckets[diffDays] += pick(row) || 0;
    }
  }
  return buckets.map(round2);
}

/** Linha com distância (metros) e pace — `activities`. */
export interface PacedRow {
  distance: number | null;
  average_pace: number | null;
}

/**
 * Pace médio em SEGUNDOS/KM, ponderado pela distância.
 *
 * Ponderado, não aritmético: a média simples de um sprint de 1 km com um longão
 * de 20 km daria ao sprint o mesmo peso, e o número resultante não descreveria
 * nenhuma das duas corridas.
 *
 * `paceValueToSecondsPerKm` normaliza linhas legadas gravadas em decimal min/km
 * (formato usado até 2026-07-30) para a unidade canônica do repo.
 */
export function weightedAvgPaceSeconds(rows: PacedRow[]): number {
  const totalDistance = rows.reduce((sum, r) => sum + (r.distance || 0), 0);
  if (totalDistance <= 0) return 0;

  const weighted = rows.reduce((sum, r) => {
    const paceSec = paceValueToSecondsPerKm(r.average_pace);
    if (paceSec == null || !r.distance) return sum;
    return sum + paceSec * r.distance;
  }, 0);

  return weighted / totalDistance;
}

/**
 * Frequência-alvo em treinos/semana.
 *
 * `training_plans.frequency_per_week` é a fonte primária — é preenchida em toda
 * criação de plano e representa o compromisso daquele ciclo. Último recurso:
 * derivar do próprio plano, o que nunca devolve 0 e evita divisão por zero no
 * percentual que a consome.
 */
export function resolveTargetFrequency(
  planFrequency: number | null | undefined,
  totalWorkoutsPlanned: number,
  weeks: number,
): number {
  if (planFrequency && planFrequency > 0) return planFrequency;
  if (totalWorkoutsPlanned > 0 && weeks > 0) {
    return Math.round((totalWorkoutsPlanned / weeks) * 100) / 100;
  }
  return 0;
}
