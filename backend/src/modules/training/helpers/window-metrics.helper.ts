/**
 * Métricas de uma JANELA de treinos — zona prescrita, pace esperado e aderência
 * de intensidade.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * Estas funções nasceram privadas dentro de `WeeklyInsightService`, mas nenhuma
 * delas sabe o que é "uma semana": todas recebem um array de treinos e devolvem
 * agregados. A Fase 4 (insight de mesociclo) precisa exatamente das mesmas
 * medidas sobre uma janela de 4 semanas.
 *
 * A alternativa seria reparametrizar `buildPlanWeekMetrics` para aceitar um
 * intervalo de semanas. Ela foi descartada: `PlanWeekMetrics` carrega
 * `weekNumber`, os deltas contra a semana anterior e os insumos do enum de
 * reajuste — coisas que um bloco não tem. Reparametrizar torceria o contrato da
 * Fase 2 para servir a Fase 4, e as duas ficariam piores.
 *
 * Aqui não há I/O e não há classe: são funções puras sobre linhas de `workouts`,
 * testáveis sem mock e reutilizáveis em qualquer escala.
 */

import { paceValueToSecondsPerKm } from '../../../common/pace-calculator';
import { EASY_PACE_TOLERANCE_SEC } from './weekly-adjustment';

/** Zonas de treino, na ordem em que aparecem. */
export const ZONES = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;
export type Zone = (typeof ZONES)[number];

/** Zonas em que correr mais rápido que o prescrito é ERRO, não objetivo. */
export const EASY_ZONES: ReadonlySet<string> = new Set<string>(['Z1', 'Z2']);

export interface ZoneBucket {
  workouts: number;
  km: number;
  seconds: number;
}

export interface IntensityBucket {
  /** Treinos medidos (têm pace esperado E executado). */
  n: number;
  avgExpectedSec: number;
  avgActualSec: number;
  /** Negativo = correu MAIS RÁPIDO que o prescrito. */
  avgDeltaSec: number;
  /** Quantos saíram `EASY_PACE_TOLERANCE_SEC` (ou mais) abaixo do alvo. */
  fasterCount: number;
}

/**
 * A forma MÍNIMA de treino que estas funções leem.
 *
 * Estrutural de propósito: tanto o `WorkoutRow` do insight semanal quanto o do
 * mesociclo satisfazem esta interface sem conversão nenhuma.
 */
export interface WindowWorkoutRow {
  status: string | null;
  distance_km: number | string | null;
  distance_run: number | string | null;
  time_run_seconds: number | null;
  pace_seconds_per_km: number | string | null;
  instructions_json: unknown;
  metadata: { zone?: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zonas
// ─────────────────────────────────────────────────────────────────────────────

export function zoneOf(w: WindowWorkoutRow): Zone | null {
  const raw = w.metadata?.zone;
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  return (ZONES as readonly string[]).includes(upper) ? (upper as Zone) : null;
}

/**
 * Distribuição por zona PRESCRITA (`metadata.zone`), não inferida do tipo.
 *
 * `WellnessService.buildZonesBlock` classifica por FC e, sem FC, cai num mapa
 * hardcoded de tipo→zona. Mas FC praticamente não existe nos dados, e
 * `metadata.zone` — escrita pela geração do plano, com o VDOT em mãos — está
 * preenchida em 100% dos treinos de plano. É informação melhor, e estava sendo
 * descartada.
 */
export function buildZoneDistribution(
  planned: WindowWorkoutRow[],
  completed: WindowWorkoutRow[],
): {
  prescribed: Record<string, ZoneBucket>;
  executed: Record<string, ZoneBucket>;
} {
  const empty = (): Record<string, ZoneBucket> => {
    const out: Record<string, ZoneBucket> = {};
    for (const z of ZONES) out[z] = { workouts: 0, km: 0, seconds: 0 };
    return out;
  };

  const prescribed = empty();
  for (const w of planned) {
    const zone = zoneOf(w);
    if (!zone) continue;
    prescribed[zone].workouts += 1;
    prescribed[zone].km += num(w.distance_km);
  }

  const executed = empty();
  for (const w of completed) {
    const zone = zoneOf(w);
    if (!zone) continue;
    executed[zone].workouts += 1;
    executed[zone].km += num(w.distance_run ?? w.distance_km);
    executed[zone].seconds += num(w.time_run_seconds);
  }

  for (const z of ZONES) {
    prescribed[z].km = round1(prescribed[z].km);
    executed[z].km = round1(executed[z].km);
  }

  return { prescribed, executed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pace esperado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pace ESPERADO de um treino, em segundos/km, ponderado pela distância dos
 * segmentos de `instructions_json`.
 *
 * ── POR QUE PONDERADO, E NÃO O PACE DO SEGMENTO `main` ──────────────────────
 *
 * `pace_seconds_per_km` é o pace da CORRIDA INTEIRA — inclui aquecimento e
 * volta à calma, que são lentos de propósito. Comparar esse número com o
 * `pace_min` do segmento principal faria todo mundo parecer mais lento do que
 * correu. O ponderado por distância é a única comparação apples-to-apples.
 *
 * ── POR QUE NÃO `workouts.target_pace_seconds` ──────────────────────────────
 *
 * Aquela coluna é NULL em todo treino de plano — só é preenchida para
 * `source='manual'` (está no COMMENT da coluna, e produção confirma). O pace
 * prescrito de um treino de plano vive em `instructions_json`.
 *
 * Segmentos com `pace_min` inutilizável (walk/run grava `pace_min: 0`) ficam
 * FORA do numerador e do denominador. Um treino sem nenhum segmento
 * aproveitável devolve `null` e não entra na agregação — é correto: não havia
 * pace prescrito para comparar.
 *
 * ── OS DOIS FORMATOS DE SEGMENTO ────────────────────────────────────────────
 *
 *   simples  { type: 'warmup'|'main'|'cooldown', distance_km OU duration_seconds,
 *              pace_min, pace_max, zone }
 *   repeat   { type: 'repeat', reps: N,
 *              work:     { distance_km OU duration_seconds, pace_min, ... },
 *              recovery: { distance_km OU duration_seconds, pace_min, ... } }
 *
 * O `repeat` NÃO tem `distance_km` nem `pace_min` no topo — eles vivem dentro
 * de `work`/`recovery`, e valem `reps` vezes cada. Até 2026-08-06 esta função
 * procurava `seg.repeat.work` (chave que o schema nunca produziu) e exigia
 * `distance_km` no topo do bloco: o resultado era o MIOLO DE QUALIDADE INTEIRO
 * ser descartado, sobrando só aquecimento e volta à calma. Um intervalado
 * estruturado saía com pace esperado idêntico ao de uma rodagem leve, e a
 * aderência de Z4/Z5 media o esforço duro com régua de easy.
 *
 * ── DISTÂNCIA × TEMPO ───────────────────────────────────────────────────────
 *
 * Todo sub-bloco tem EXATAMENTE um entre `distance_km` e `duration_seconds`.
 * O ponderado é sempre Σtempo ÷ Σdistância; um sub-bloco por tempo entra
 * convertendo com o próprio pace prescrito (90 s a 7:39/km = 0,196 km). Sem
 * isso, as recuperações e os aquecimentos por tempo — que o prompt PREFERE —
 * sumiriam do denominador, e o esperado ficaria mais rápido que a corrida que
 * ele descreve, justo na direção que faz o atleta parecer melhor do que foi.
 *
 * ── CENTRO DA FAIXA, NÃO A BORDA RÁPIDA ─────────────────────────────────────
 *
 * Devolve a faixa inteira porque as duas pontas têm usos diferentes, e
 * confundi-las produziu um erro visível para o usuário:
 *
 *   `center` — o que "esperado" significa para quem lê. Até 2026-08-10 a
 *              narrativa usava `min`, a borda RÁPIDA, e quem executava no
 *              meio do prescrito lia que ficou lento por metade da largura
 *              da banda. Com a Z1 em 393–434, isso eram 20 s/km de atraso
 *              relatados a um atleta que correu exatamente no alvo.
 *   `min`    — o gatilho de `aliviar_ritmo`. "Rápido demais" é passar da
 *              borda rápida com folga; medir contra o centro faria o cue
 *              disparar dentro da própria faixa prescrita.
 */
export function expectedPaceRangeForWorkout(
  w: WindowWorkoutRow,
): { min: number; max: number; center: number } | null {
  const segments = Array.isArray(w.instructions_json)
    ? (w.instructions_json as Array<Record<string, unknown>>)
    : [];
  if (segments.length === 0) return null;

  let distance = 0;
  let secondsMin = 0;
  let secondsMax = 0;

  /** Acumula um sub-bloco `times` vezes. Sem pace utilizável, não entra. */
  const addEffort = (raw: unknown, times = 1): void => {
    if (!raw || typeof raw !== 'object') return;
    const effort = raw as Record<string, unknown>;

    const min = paceValueToSecondsPerKm(effort.pace_min as number | undefined);
    if (min == null || min <= 0) return;
    // Plano legado (e alguns walk/run) não trazem `pace_max`: a faixa colapsa
    // num ponto, e center === min. É o comportamento anterior, preservado.
    const max =
      paceValueToSecondsPerKm(effort.pace_max as number | undefined) ?? min;

    const km = num(effort.distance_km as number | string | null);
    if (km > 0) {
      distance += km * times;
      secondsMin += km * min * times;
      secondsMax += km * max * times;
      return;
    }

    const sec = num(effort.duration_seconds as number | string | null);
    if (sec > 0) {
      // A distância de um bloco por TEMPO depende do pace corrido; usar o
      // centro aqui mantém o peso do bloco estável entre as duas pontas.
      const km2 = sec / ((min + max) / 2);
      distance += km2 * times;
      secondsMin += km2 * min * times;
      secondsMax += km2 * max * times;
    }
  };

  for (const seg of segments) {
    if (seg.type === 'repeat') {
      // `Math.max(1, ...)` espelha `segmentEngine.buildSegSteps` no mobile —
      // o motor que EXECUTA o treino. As duas contagens de reps têm de ser a
      // mesma, senão o esperado descreve um treino diferente do realizado.
      const reps = Math.max(1, Math.round(num(seg.reps as number) || 1));
      addEffort(seg.work, reps);
      addEffort(seg.recovery, reps);
      continue;
    }
    addEffort(seg);
  }

  if (distance <= 0) return null;
  const min = Math.round(secondsMin / distance);
  const max = Math.round(secondsMax / distance);
  return { min, max, center: Math.round((min + max) / 2) };
}

/**
 * O pace que a prescrição COMUNICA — o centro da faixa ponderada.
 *
 * É este número que vai para a narrativa e para `expected_pace_seconds`.
 */
export function expectedPaceForWorkout(w: WindowWorkoutRow): number | null {
  return expectedPaceRangeForWorkout(w)?.center ?? null;
}

/** Pace esperado médio da janela (média simples sobre os concluídos). */
export function avgExpectedPaceSeconds(completed: WindowWorkoutRow[]): number {
  const values = completed
    .map((w) => expectedPaceForWorkout(w))
    .filter((v): v is number => v != null);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aderência de intensidade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cruza pace prescrito × executado por zona.
 *
 * `easyMeasured`/`easyTooFast` contam SÓ Z1/Z2 — é onde correr mais rápido que
 * o alvo é erro inequívoco. Num Z4, correr rápido é o objetivo do treino, e
 * incluí-lo faria o cue de intensidade disparar em quem executou bem.
 */
export function buildIntensityAdherence(completed: WindowWorkoutRow[]): {
  buckets: Record<string, IntensityBucket>;
  easyMeasured: number;
  easyTooFast: number;
} {
  const acc: Record<
    string,
    { expected: number[]; actual: number[]; faster: number }
  > = {};
  let easyMeasured = 0;
  let easyTooFast = 0;

  for (const w of completed) {
    const zone = zoneOf(w);
    if (!zone) continue;

    const band = expectedPaceRangeForWorkout(w);
    const actual = num(w.pace_seconds_per_km);
    if (band == null || actual <= 0) continue;

    if (!acc[zone]) acc[zone] = { expected: [], actual: [], faster: 0 };
    // O que se EXIBE é o centro: é o pace que a prescrição comunica.
    acc[zone].expected.push(band.center);
    acc[zone].actual.push(actual);

    // O que DISPARA o cue é a borda rápida. "Rápido demais" significa passar
    // do limite superior da prescrição com folga — medir contra o centro
    // acusaria de erro quem correu dentro da própria faixa pedida.
    const tooFast = actual <= band.min - EASY_PACE_TOLERANCE_SEC;
    if (tooFast) acc[zone].faster += 1;

    if (EASY_ZONES.has(zone)) {
      easyMeasured += 1;
      if (tooFast) easyTooFast += 1;
    }
  }

  const buckets: Record<string, IntensityBucket> = {};
  for (const [zone, v] of Object.entries(acc)) {
    const avgExpected = avg(v.expected);
    const avgActual = avg(v.actual);
    buckets[zone] = {
      n: v.expected.length,
      avgExpectedSec: Math.round(avgExpected),
      avgActualSec: Math.round(avgActual),
      avgDeltaSec: Math.round(avgActual - avgExpected),
      fasterCount: v.faster,
    };
  }

  return { buckets, easyMeasured, easyTooFast };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aritmética defensiva (PostgREST devolve `numeric` como string)
// ─────────────────────────────────────────────────────────────────────────────

export function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
