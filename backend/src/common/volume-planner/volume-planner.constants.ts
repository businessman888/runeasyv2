/**
 * Constantes do motor determinístico de volume (Fase B). Fonte única de verdade
 * — calibráveis olhando planos reais. Nenhum número de volume vive fora daqui.
 *
 * Filosofia: número é cálculo, forma é escolha da IA. Estes valores definem a
 * curva de volume/longão; a IA só escolhe tipo/zona/estrutura dentro deles.
 */

import { WalkRunInterval } from './volume-planner.types';

// ── Capacidade efetiva (ponto de partida) ───────────────────────────────────

/** current_weekly_km (faixa) → km/semana representativo (ponto médio da faixa). */
export const WEEKLY_KM_MIDPOINTS: Record<string, number> = {
  lt5: 4,
  '5_10': 7.5,
  '10_20': 15,
  '20_30': 25,
  gt30: 35,
};

/**
 * recent_frequency → teto de km/semana implícito pela frequência das últimas 4
 * semanas. Usado como CAP conservador: quem não correu ("never") tem condição
 * atual baixa mesmo que já tenha corrido muito no passado ("correu 8km há 3
 * anos" ≠ "corre 8km hoje"). Na contradição, prevalece o menor sinal.
 */
export const FREQUENCY_IMPLIED_KM: Record<string, number> = {
  never: 3,
  '1x': 7,
  '2x': 13,
  '3x': 20,
  '4x_plus': 30,
};

/** Retrocompat: sem os campos da Fase A, estimar por nível (conservador). */
export const LEVEL_FALLBACK_WEEKLY_KM: Record<string, number> = {
  beginner: 8,
  intermediate: 18,
  advanced: 30,
};

/** Piso de volume semanal efetivo — nunca prescrever menos que isto (corredor). */
export const MIN_WEEKLY_KM = 6;

// ── Curva de volume ──────────────────────────────────────────────────────────

/** Teto de aumento de volume entre semanas consecutivas (regra dos ~10%). */
export const WEEKLY_INCREASE_CAP_PCT = 0.1;

/** Semana de recuo (deload) a cada N semanas de base/build. */
export const DELOAD_EVERY_N_WEEKS = 4;

/** Redução de volume numa semana de deload. */
export const DELOAD_PCT = 0.25; // −25%

/**
 * Fatores do taper por posição (última semana = índice final). Progressivo:
 * penúltima ~−40%, última ~−55%. Se o taper tiver mais semanas, as primeiras
 * ficam mais próximas do pico. Aplicado sobre o volume de pico.
 */
export const TAPER_FACTORS = [0.6, 0.45]; // [penúltima, última]; taper de 3+ prepende 0.75

/**
 * Longão como fração máxima do volume semanal — VARIÁVEL POR DISTÂNCIA DA META.
 * Corredores de volume moderado fazem longões que são fatia MAIOR do volume na
 * maratona (um longão de 30 km numa semana de 65 km = 46%); em provas curtas a
 * fatia é menor. Sem isso, a maratona ficava sistematicamente inviável
 * (31 km ÷ 0.35 = 88.6 km/sem necessários, acima da barreira de 87.5).
 *   • ≤10k → 35%    • 21k → 35%    • 42k → 45%    (interpola entre 21 e 42)
 */
export const LONG_RUN_SHARE_BY_GOAL: Array<{ goalKm: number; share: number }> = [
  { goalKm: 10, share: 0.35 },
  { goalKm: 21.1, share: 0.35 },
  { goalKm: 42.2, share: 0.45 },
];

/** Fatia default (≤10k) — usada também no teto do longão inicial (goal-independente). */
export const LONG_RUN_SHARE_MAX = 0.35;

/**
 * Segunda barreira independente ao crescimento do volume: o pico semanal nunca
 * ultrapassa este múltiplo da capacidade inicial, mesmo que a rampa permita.
 * Impede que um atleta saindo de 30 km/sem chegue a 100+ km/sem em um plano.
 * (A barreira primária é atar o pico ao longão: pico ≤ peakLong / SHARE_MAX.)
 */
export const MAX_VOLUME_GROWTH_FACTOR = 2.5;

// ── Longão de pico atado à meta (tabela por distância, com interpolação) ─────

export const LONG_RUN_TABLE: Array<{ goalKm: number; min: number; max: number }> =
  [
    { goalKm: 5, min: 8, max: 10 },
    { goalKm: 10, min: 12, max: 14 },
    { goalKm: 21.1, min: 16, max: 19 },
    { goalKm: 42.2, min: 30, max: 32 },
  ];

/** race_simulation atado à meta: fração da distância-meta (para 5/10k). */
export const RACE_SIM_SHARE = { min: 0.9, max: 1.0 };

// ── Intervalados (pós-processamento de volume) ───────────────────────────────

/** Piso de repetições ao aparar um intervalado que estoura o alvo. */
export const MIN_REPS = 3;

/** Aquecimento/desaquecimento mínimos (km) reservados num treino intervalado. */
export const MIN_WARMUP_KM = 1.0;
export const MIN_COOLDOWN_KM = 1.0;

/** Tolerância (km) do volume semanal total antes de registrar desvio. */
export const WEEKLY_TOTAL_TOLERANCE_KM = 0.5;

// ── Protocolo caminhada/corrida ("nunca corri") ──────────────────────────────

/** Ponto de partida por walk_capacity: reps × (corrida / caminhada) em segundos. */
export const WALKRUN_START: Record<string, WalkRunInterval> = {
  easy: { reps: 6, runSeconds: 90, walkSeconds: 150 },
  effort: { reps: 6, runSeconds: 60, walkSeconds: 180 },
  not_yet: { reps: 8, runSeconds: 30, walkSeconds: 240 },
};

/** Fallback quando walk_capacity ausente. */
export const WALKRUN_DEFAULT_KEY = 'effort';

/** Progressão semanal: +corrida / −caminhada, com limites. */
export const WALKRUN_PROGRESSION = {
  runDeltaSec: 20,
  walkDeltaSec: -20,
  maxRunSec: 1200, // 20 min contínuos → praticamente corrida contínua
  minWalkSec: 0,
  minReps: 4,
};
