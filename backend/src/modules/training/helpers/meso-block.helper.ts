/**
 * GEOMETRIA DO MESOCICLO — funções puras, sem I/O.
 *
 * Um mesociclo aqui é um BLOCO DE 4 SEMANAS do plano. A escolha não é
 * arbitrária: `DELOAD_EVERY_N_WEEKS = 4` já implementa o mesociclo clássico
 * (3 semanas de carga + 1 de descarga), com o vale de deload caindo em S4 e S8.
 *
 * A alternativa era "um mesociclo = uma fase". Foi descartada porque a fase é
 * desigual demais para servir de FRONTEIRA: num plano de 12 semanas ela produz
 * blocos de 6, 3, 2 e 1 semana, e um "mesociclo" de 1 semana é o insight
 * semanal com outro nome. A fase entra como RÓTULO, que é onde ela é boa.
 *
 * Tudo aqui deriva de `week_number` puro — nada depende de `plan_json`.
 */

import { WeekPhase } from '../../../common/volume-planner';

/** Semanas por bloco. Espelha `DELOAD_EVERY_N_WEEKS` do motor de volume. */
export const MESO_BLOCK_WEEKS = 4;

/** A que bloco a semana N pertence (1-based). */
export function blockIndexOf(weekNumber: number): number {
  return Math.ceil(weekNumber / MESO_BLOCK_WEEKS);
}

/** As semanas do bloco B, em ordem. */
export function weeksOfBlock(blockIndex: number): number[] {
  const first = (blockIndex - 1) * MESO_BLOCK_WEEKS + 1;
  return Array.from({ length: MESO_BLOCK_WEEKS }, (_, i) => first + i);
}

/**
 * O índice do ÚLTIMO bloco do plano — o que nunca gera insight.
 *
 * Vale tanto para bloco completo quanto parcial: num plano de 10 semanas o
 * último bloco é o 3 (S9-10), e ele é suprimido do mesmo jeito. Consequência
 * aceita: plano de até 4 semanas não gera mesociclo nenhum, porque o bloco 1 já
 * é o último. É correto — a retrospectiva cobre o ciclo inteiro.
 */
export function lastBlockIndexOf(lastWeekNumber: number): number {
  return blockIndexOf(lastWeekNumber);
}

/**
 * A semana que acabou de fechar encerra um bloco que MERECE insight?
 *
 * Devolve o índice do bloco, ou `null`. Duas condições:
 *   1. a semana é a última do seu bloco (múltipla de 4), OU é a última semana
 *      do plano — mas nesse caso cai na regra 2 e é descartada;
 *   2. o bloco não é o último do plano.
 *
 * Bloco PARCIAL no meio do plano não existe: as semanas são contíguas, então
 * só o último bloco pode ficar incompleto — e ele é suprimido de qualquer modo.
 */
export function blockClosedByWeek(
  weekNumber: number,
  lastWeekNumber: number,
): number | null {
  if (weekNumber % MESO_BLOCK_WEEKS !== 0) return null;

  const blockIndex = blockIndexOf(weekNumber);
  if (blockIndex >= lastBlockIndexOf(lastWeekNumber)) return null;

  return blockIndex;
}

/**
 * A fase que ROTULA o bloco: a mais frequente entre as semanas dele.
 *
 * Empate resolvido pela fase da ÚLTIMA semana — é onde o atleta chega, e é o
 * que a frase "Bloco 2 · desenvolvimento" quer dizer. Num plano 12sem/10k
 * (base S1-6, build S7-9) o bloco 2 é base·base·build·build: o empate cai para
 * `build`, que descreve melhor o que aquele bloco foi.
 */
export function dominantPhase(phases: WeekPhase[]): WeekPhase {
  if (phases.length === 0) return 'base';

  const counts = new Map<WeekPhase, number>();
  for (const p of phases) counts.set(p, (counts.get(p) ?? 0) + 1);

  // `winner` começa na fase da ÚLTIMA semana e só é deslocado por uma fase
  // ESTRITAMENTE mais frequente — o empate fica com ela por construção, sem
  // depender da ordem de iteração do Map.
  let winner = phases[phases.length - 1];
  for (const [phase, n] of counts) {
    if (n > (counts.get(winner) ?? 0)) winner = phase;
  }
  return winner;
}

/** Rótulo em português da fase, igual ao de `getPlanOverview`. */
export const PHASE_LABELS: Record<WeekPhase, string> = {
  base: 'base',
  build: 'desenvolvimento',
  peak: 'específico',
  taper: 'polimento',
};
