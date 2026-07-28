/**
 * Jack Daniels VDOT reference table.
 *
 * Each row is a VDOT integer anchor; values are training paces in DECIMAL
 * MINUTES PER KILOMETER (e.g. 7:22/km → 7 + 22/60 ≈ 7.367).
 *
 * - e_min / e_max: Easy / Z1 pace range
 * - m: Marathon / Z2
 * - t: Threshold / Z3
 * - i: Interval / Z4 (VO2max)
 * - r: Repetition / Z5
 *
 * Values are taken from the Daniels Running Formula tables. For VDOT values
 * between anchors, PaceCalculatorService interpolates linearly.
 *
 * ── Âncora 27 — ponta baixa (iniciantes) ────────────────────────────────────
 *
 * As tabelas publicadas do Daniels começam em VDOT 30, mas `clamp()` aceitava
 * até 25 — e `interpolate()` colapsa tudo abaixo da menor âncora nela. Efeito:
 * TODO corredor mais lento que ~6:00/km de 5k recebia zonas idênticas às do
 * VDOT 30 (Z1 9:11–10:18), que é a maior fatia dos iniciantes. Com o
 * BriefingScreen exibindo zonas reais antes do pagamento, dois iniciantes
 * diferentes viam o mesmo pace.
 *
 * A linha 27 foi ancorada empiricamente, NÃO extrapolada da fórmula (que não é
 * validada abaixo de 30):
 *
 *  1. Tempo de prova: invertendo numericamente a própria Daniels–Gilbert do
 *     repo (`estimateVDOTFromRace`), VDOT 27 = 5 km em 33:25 → pace de prova
 *     6:41/km. O método reproduz os tempos publicados do Daniels com 2–3 s de
 *     erro nas âncoras existentes (VDOT 30 → 30:38 vs 30:40 publicado; 50 →
 *     19:55 vs 19:57), então serve de âncora confiável.
 *  2. Zonas: razão *zona ÷ pace-de-prova-5k* observada na linha 30 (`e_min`
 *     1.499, `m` 1.341, `t` 1.257, `i` 1.142, `r` 1.044), congelada — e não
 *     extrapolada adiante. Continuar a aceleração dessas razões produzia easy
 *     de 13:11/km (4,5 km/h), abaixo de caminhada rápida.
 *  3. Banda do easy: `e_max = e_min × 1.104`, a proporção média das linhas
 *     validadas 35–50, em vez da banda mais larga (1.122) da própria linha 30.
 *
 * Resultado: easy 10:01–11:03/km (6,0–5,4 km/h), ainda trote de iniciante.
 * `MIN_VDOT` foi elevado de 25 para 27 para casar com esta âncora — abaixo daqui
 * o modelo entraria em velocidade de caminhada, e esse usuário pertence ao
 * protocolo caminhada/corrida (Fase B), não a uma prescrição de pace.
 *
 * A adição é ADITIVA: para VDOT ≥ 30 o par de âncoras interpolado não muda, e
 * todas as zonas permanecem idênticas (ver `pace-calculator.spec.ts`).
 *
 * PENDENTE (não corrigido): o mesmo colapso existe no TOPO — VDOT 70 a 85 cai
 * todo na linha 70. Impacto desprezível (VDOT 75+ é elite).
 */

export interface VDOTRow {
  e_min: number;
  e_max: number;
  m: number;
  t: number;
  i: number;
  r: number;
}

export const VDOT_REFERENCE_TABLE: Record<number, VDOTRow> = {
  // Âncora de iniciante — ver nota acima. Não veio das tabelas publicadas.
  27: { e_min: 10.016, e_max: 11.056, m: 8.963, t: 8.399, i: 7.635, r: 6.981 },
  30: { e_min: 9.183, e_max: 10.3, m: 8.217, t: 7.7, i: 7.0, r: 6.4 },
  35: { e_min: 7.367, e_max: 8.133, m: 6.617, t: 6.217, i: 5.733, r: 5.317 },
  40: { e_min: 6.55, e_max: 7.233, m: 5.9, t: 5.517, i: 5.083, r: 4.7 },
  45: { e_min: 5.9, e_max: 6.517, m: 5.317, t: 4.967, i: 4.55, r: 4.183 },
  50: { e_min: 5.367, e_max: 5.917, m: 4.817, t: 4.5, i: 4.117, r: 3.767 },
  55: { e_min: 4.917, e_max: 5.4, m: 4.4, t: 4.1, i: 3.733, r: 3.417 },
  60: { e_min: 4.517, e_max: 4.967, m: 4.017, t: 3.75, i: 3.4, r: 3.133 },
  65: { e_min: 4.183, e_max: 4.583, m: 3.7, t: 3.467, i: 3.133, r: 2.883 },
  70: { e_min: 3.883, e_max: 4.233, m: 3.417, t: 3.217, i: 2.9, r: 2.65 },
};
