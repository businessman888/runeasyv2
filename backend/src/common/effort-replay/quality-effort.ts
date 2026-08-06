/**
 * Do replay bruto para o SINAL: qual foi o pace real do esforço de qualidade.
 *
 * "Qualidade" aqui é estrito de propósito — só o que o VDOT descreve:
 *
 *   • zona Z3, Z4 ou Z5 (limiar, VO2max, velocidade)
 *   • que seja ESFORÇO, não recuperação (`work` de um repeat, ou o `main` de um
 *     tempo/progressivo contínuo). O trote entre tiros é Z1 e sai por zona; o
 *     aquecimento e a volta à calma saem por `kind`.
 *
 * Z1/Z2 ficam FORA por decisão de produto, não por limitação: o cue
 * `aliviar_ritmo` da Fase 2 já lê "easy rápido demais" como ERRO de execução.
 * Usar o mesmo dado para SUBIR o VDOT faria o app afirmar duas coisas opostas
 * sobre o mesmo fato.
 */

import { ReplayedStep, MIN_COVERAGE_RATIO } from './effort-replay';

/** As zonas que o VDOT realmente descreve. */
export const QUALITY_ZONES: ReadonlySet<string> = new Set(['Z3', 'Z4', 'Z5']);

/** Sub-etapas que são esforço (e não recuperação/aquecimento). */
const EFFORT_KINDS: ReadonlySet<string> = new Set(['work', 'main']);

/**
 * Piso de distância prescrita de qualidade para o treino contar.
 *
 * O prompt de geração permite terminar um easy_run com "4-6×100m de strides em
 * Z5". Strides são qualidade no papel, mas 100 m com pontos de GPS a cada ~10 m
 * dá ~10 amostras — ruído, não medição. 800 m é o menor bloco que a metodologia
 * usa como tiro de verdade (o clássico 8×800m) e resolve bem no GPS.
 */
export const MIN_QUALITY_DISTANCE_KM = 0.8;

export interface QualityEffort {
  /** Pace real do esforço de qualidade, em segundos/km. */
  paceSecPerKm: number;
  /** Distância de qualidade efetivamente medida, em km. */
  actualKm: number;
  /** Distância de qualidade prescrita, em km. */
  prescribedKm: number;
  /** `actualKm / prescribedKm` — quanto do prescrito o GPS conseguiu cobrir. */
  coverage: number;
  /** Zonas presentes no esforço, para o registro no histórico. */
  zones: string[];
  /** Faixa prescrita agregada (ponderada pela distância prescrita). */
  prescribedPaceMin: number;
  prescribedPaceMax: number;
}

/**
 * Agrega as sub-etapas de qualidade de UM treino num único par
 * (pace real, faixa prescrita).
 *
 * Devolve `null` — e o treino não vota — quando:
 *   • não há bloco de qualidade prescrito, ou ele é curto demais (strides);
 *   • o GPS cobriu menos que `MIN_COVERAGE_RATIO` do prescrito;
 *   • não sobrou tempo/distância em movimento para calcular pace.
 *
 * Silêncio é melhor que um número inventado: este valor vai mexer no plano.
 */
export function isQualityEffortStep(step: {
  zone: string | null;
  kind: string;
  paceMin: number;
}): boolean {
  return (
    step.zone != null &&
    QUALITY_ZONES.has(step.zone) &&
    EFFORT_KINDS.has(step.kind) &&
    step.paceMin > 0
  );
}

export function summarizeQualityEffort(
  steps: ReplayedStep[],
): QualityEffort | null {
  const quality = steps.filter(isQualityEffortStep);
  if (quality.length === 0) return null;

  let prescribedKm = 0;
  let prescribedMinWeighted = 0;
  let prescribedMaxWeighted = 0;
  let actualKm = 0;
  let actualSeconds = 0;
  const zones = new Set<string>();

  for (const s of quality) {
    // Distância prescrita da sub-etapa: direta quando por distância; derivada do
    // próprio pace-alvo quando por tempo (um tiro de "90s em Z4" tem distância
    // prescrita implícita).
    const centerPace = (s.paceMin + s.paceMax) / 2 || s.paceMin;
    const km =
      s.metric === 'distance'
        ? s.target / 1000
        : centerPace > 0
          ? s.target / 1000 / centerPace
          : 0;
    if (km <= 0) continue;

    prescribedKm += km;
    prescribedMinWeighted += s.paceMin * km;
    prescribedMaxWeighted += (s.paceMax || s.paceMin) * km;
    actualKm += s.actualKm;
    actualSeconds += s.actualSeconds;
    if (s.zone) zones.add(s.zone);
  }

  if (prescribedKm < MIN_QUALITY_DISTANCE_KM) return null;
  if (actualKm <= 0 || actualSeconds <= 0) return null;

  const coverage = actualKm / prescribedKm;
  if (coverage < MIN_COVERAGE_RATIO) return null;

  return {
    paceSecPerKm: Math.round(actualSeconds / actualKm),
    actualKm: Math.round(actualKm * 1000) / 1000,
    prescribedKm: Math.round(prescribedKm * 1000) / 1000,
    coverage: Math.round(coverage * 100) / 100,
    zones: [...zones].sort(),
    prescribedPaceMin: Math.round(prescribedMinWeighted / prescribedKm),
    prescribedPaceMax: Math.round(prescribedMaxWeighted / prescribedKm),
  };
}

/**
 * Distância (em segundos/km) do pace real até a FAIXA prescrita — não até o
 * centro dela.
 *
 * Negativo = correu mais rápido que o limite rápido da faixa.
 * Positivo  = correu mais lento que o limite lento.
 * Zero      = executou dentro do prescrito, que é o caso NORMAL e não é sinal.
 *
 * Medir contra a faixa (e não contra o centro) é o que evita transformar a
 * tolerância de ±8 s/km — que existe justamente porque ninguém executa um pace
 * exato — em evidência de que o VDOT está errado.
 */
export function deltaToPrescribedBand(effort: QualityEffort): number {
  if (effort.paceSecPerKm < effort.prescribedPaceMin) {
    return effort.paceSecPerKm - effort.prescribedPaceMin; // negativo
  }
  if (effort.paceSecPerKm > effort.prescribedPaceMax) {
    return effort.paceSecPerKm - effort.prescribedPaceMax; // positivo
  }
  return 0;
}
