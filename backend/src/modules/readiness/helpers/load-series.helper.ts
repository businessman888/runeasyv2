/**
 * A SÉRIE DE CARGA e a razão aguda/crônica — funções puras, sem banco.
 *
 * ── O QUE ISTO SUBSTITUI ──────────────────────────────────────────────────────
 *
 * `getActivityLoadData()` calculava:
 *
 *     agudo   = Σ distance dos últimos 7 dias
 *     crônico = Σ distance dos últimos 28 dias ÷ 4        ← o agudo está DENTRO
 *     acwr    = agudo / crônico   (ou 1.0 se crônico = 0)
 *
 * Três defeitos estruturais, todos medidos em produção:
 *
 *  1. **Acoplamento.** O agudo é parcela do próprio denominador. Para quem só
 *     tem histórico dentro da janela aguda, `crônico = agudo/4` e a razão dá
 *     EXATAMENTE 4.00 — não por sobrecarga, por álgebra. Foi o veredito
 *     "Risco Crítico de Lesão" emitido sobre 680 m em 3 corridas.
 *  2. **Distância, não esforço.** 5 km de tiro e 5 km de rodagem contavam igual.
 *  3. **`|| 1.0`.** Sem histórico, a fórmula inventava "carga adequada" — a
 *     resposta menos honesta possível para "eu não sei".
 *
 * ── O QUE ENTRA NO LUGAR ──────────────────────────────────────────────────────
 *
 * Série DIÁRIA de minutos ponderados pelo tipo de treino, e duas EWMA em que a
 * crônica é lida ANTES da janela aguda — é isso que desacopla. Sem histórico, a
 * razão é `null` e a carga simplesmente não fala.
 */

import { loadWeightFor } from '../../../common/workout-types';
import { toSaoPauloDateStr } from '../../training/wellness/helpers/streak.helper';
import { addDaysStr } from '../../training/helpers/plan-window.helper';

// ── Limiares ─────────────────────────────────────────────────────────────────
// Nomeados e exportados de propósito: são a PRIMEIRA calibragem, feita sobre 14
// atividades reais. Revisáveis quando houver volume — não são arquitetura.

/**
 * Abaixo disto não é corrida, é blip de GPS.
 *
 * Não é um número escolhido no ar: das 14 atividades de produção, **oito têm
 * menos de 60 segundos** (1s, 9s, 13s, 15s, 15s, 23s, 53s) e três têm
 * `distance = 0`. Sem este piso elas entram na série como carga ≈ 0 — o que é
 * PIOR do que não entrar, porque um `0` na série significa "descansou" — e ainda
 * contam como "dia com corrida" para o piso de histórico.
 */
export const MIN_QUALIFYING_MOVING_SEC = 300;

export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;

/** Meia-vida da EWMA crônica. */
export const LAMBDA_CHRONIC = 2 / (CHRONIC_DAYS + 1); // ≈ 0,0689655

/**
 * ⚠️ O AGUDO É MÉDIA PLANA DE 7 DIAS, NÃO EWMA — e isto é medido, não estético.
 *
 * A formulação clássica (Williams 2016) usa EWMA dos dois lados, com
 * `λ_agudo = 2/(7+1) = 0,25`. Rodei as duas sobre rotinas periódicas antes de
 * escolher, e o resultado condena a EWMA no numerador:
 *
 *   corredor EM REGIME, 4x/semana, 45 min, sem variação nenhuma
 *     EWMA:         razão oscila 0,864 … 1,207  (amplitude 0,343)
 *     média plana:  razão oscila 0,975 … 1,093  (amplitude 0,119)
 *
 * A oscilação da EWMA CRUZA o limiar de 1,10 da escada, então o mesmo corredor
 * fazendo exatamente a mesma coisa recebe −2 num dia e +4 no outro: **6 pontos
 * de score decididos por "hoje era dia de treino?"**. Com λ=0,25 o dia mais
 * recente pesa 25% do agudo, e treino é inerentemente periódico — a EWMA curta
 * mede a FASE da semana, não a carga dela.
 *
 * A média plana não perde sinal onde ele importa: na rampa genuína ela chega a
 * 8,2 contra 7,2 da EWMA, e na volta de 21 dias parados a 6,1 contra 6,5.
 *
 * O crônico continua EWMA: a janela é longa o bastante para a fase não importar,
 * e o decaimento exponencial é o que faz uma pausa longa aparecer de forma
 * gradual em vez de um degrau no dia 29.
 *
 * ⚠️ O que a média plana NÃO conserta: uma cadência que não é semanal. Quem
 * corre de 2 em 2 dias tem ora 3 ora 4 corridas dentro de qualquer janela de 7,
 * e a razão oscila ±14% por isso. É propriedade da janela, não do motor, e não
 * incomoda na prática porque plano de corrida é semanal por construção.
 */
export const ACUTE_IS_FLAT_MEAN = true;

/**
 * A janela lida do banco. **63 dias, e o motivo é o viés de seed, não o dado.**
 *
 * As duas EWMA começam em 0. A crônica é lida em `hoje − 7`, então com 63 dias
 * ela tem 55 dias de pista: viés residual `(1−λ)^55 ≈ 0,931^55 ≈ 1,9%`. Com uma
 * janela de 35 dias sobrariam `0,931^27 ≈ 14,5%` de viés PARA BAIXO no
 * denominador — inflando sistematicamente toda razão, em cima de um número que
 * já é o mais delicado do motor.
 */
export const LOAD_WINDOW_DAYS = 63;

/**
 * Piso ABSOLUTO de carga crônica, em minutos ponderados por semana.
 *
 * Responde "o treino desta pessoa é material?", que é pergunta diferente de
 * "tenho dado suficiente?" (esse é o piso de histórico abaixo). Sem ele, quem
 * corre 35 min por semana recebe razão 1,62 — aritmética nova, ruído velho.
 *
 * Medido sobre o seed: `consistente` 190 min/sem, `ferias` 81, `rampa` 76,
 * `esparso` 35. Qualquer corte entre 35 e 76 silencia só o esparso; 60 é o meio.
 */
export const ABS_CHRONIC_FLOOR_MIN_PER_WEEK = 60;

/**
 * Piso de HISTÓRICO — as duas condições, e por que são duas.
 *
 * `span` sozinho deixa passar o corredor esparso (5 corridas em 38 dias
 * desbloqueia). `dias com corrida` sozinho desbloquearia quem fez 6 corridas em
 * 6 dias, sem nenhuma base crônica. As duas juntas dizem "tem histórico E tem
 * regularidade".
 */
export const FLOOR_MIN_SPAN_DAYS = 14;
export const FLOOR_MIN_RUN_DAYS = 6;

// ── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Uma atividade já casada com o tipo do treino.
 *
 * ⚠️ `workoutType` vem de `workouts.type` alcançado por **`workouts.activity_id`**.
 * NUNCA de `activities.workout_id` (NULL em 14/14 linhas de produção) e nunca de
 * `activities.type` (que vale 'Run' em 100% delas). `null` aqui significa
 * "atividade sem treino ligado" e pesa como rodagem leve.
 */
export interface QualifyingActivity {
  id: string;
  /** ISO UTC. */
  start_date: string;
  moving_time: number | null;
  workoutType: string | null;
}

/** Um dia da série. `load` já vem ponderado. */
export interface DailyLoad {
  dateStr: string;
  /** Minutos PONDERADOS. `0` = descansou (dia dentro do histórico, sem corrida). */
  loadMin: number;
  runs: number;
}

export type LoadReason =
  /** Tudo certo: a carga pode modular e ser narrada. */
  | 'ok'
  /** Abaixo do piso de histórico — o motor ainda está aprendendo. */
  | 'sem_historico'
  /** Há histórico, mas o volume é pequeno demais para a razão significar algo. */
  | 'carga_irrelevante'
  /** A consulta falhou. Diferente de "não treinou" — ver a mina do 42703. */
  | 'indisponivel';

export interface FloorProgress {
  spanDays: number;
  runDays: number;
  missingSpanDays: number;
  missingRunDays: number;
}

export interface LoadSignal {
  /** `false` ⇒ `loadDelta` é 0 E a narrativa NÃO pode mencionar carga. */
  modulates: boolean;
  reason: LoadReason;
  acuteMinPerDay: number;
  chronicMinPerDay: number;
  chronicMinPerWeek: number;
  /** `null` quando não há base crônica. NUNCA um valor fabricado. */
  ratio: number | null;
  /**
   * Dias desde a última corrida que conta. `null` se não houve nenhuma.
   *
   * É campo PRÓPRIO porque a razão não consegue distinguir "voltou de férias"
   * de "rampa genuína" — medido: 1,44 vs 4,22 com λ de 28 dias, mesma faixa em
   * qualquer λ. A razão não vê a FORMA do histórico. Quem conta que houve 21
   * dias parados é este número, e é ele que muda a narrativa de "carga alta"
   * para "você voltou de uma pausa".
   */
  diasDesdeUltimaCorrida: number | null;
  /** Só quando `reason === 'sem_historico'`. Alimenta o card bloqueado (R.2). */
  floorProgress: FloorProgress | null;
}

// ── Série ────────────────────────────────────────────────────────────────────

/**
 * Baldes diários COM ZERO-FILL, do mais antigo ao mais recente.
 *
 * O zero-fill não é conveniência: sem ele, uma corrida numa semana produziria a
 * mesma média que sete, porque a média veria a mesma sequência de amostras. Os
 * dias de descanso são dado, não ausência de dado.
 *
 * O balde é o DIA DE SÃO PAULO da atividade — uma corrida às 22h SP tem
 * `start_date` no dia seguinte em UTC e cairia no balde errado.
 *
 * ⚠️ `endDayStr` é o ÚLTIMO DIA FECHADO — ontem, não hoje. O check-in acontece
 * de manhã, quando o treino de hoje ainda não aconteceu: incluir hoje somaria um
 * zero garantido ao agudo (deflacionando-o em 1/7) e, para quem responde depois
 * de correr, o número pularia. O readiness reflete a carga até ontem inclusive.
 */
export function buildDailyLoadSeries(
  activities: QualifyingActivity[],
  endDayStr: string,
  windowDays: number = LOAD_WINDOW_DAYS,
): DailyLoad[] {
  const serie: DailyLoad[] = [];
  const indicePorDia = new Map<string, number>();

  for (let i = windowDays - 1; i >= 0; i--) {
    const dateStr = addDaysStr(endDayStr, -i);
    indicePorDia.set(dateStr, serie.length);
    serie.push({ dateStr, loadMin: 0, runs: 0 });
  }

  for (const a of activities) {
    if (!qualifies(a)) continue;
    const dia = toSaoPauloDateStr(a.start_date);
    const idx = indicePorDia.get(dia);
    if (idx === undefined) continue; // fora da janela — ignorar, nunca "salvar"
    const minutos = a.moving_time / 60;
    serie[idx].loadMin += minutos * loadWeightFor(a.workoutType);
    serie[idx].runs += 1;
  }

  return serie;
}

/** Uma atividade conta? Piso de duração + guarda de número. */
export function qualifies(a: QualifyingActivity): boolean {
  const s = a.moving_time;
  return (
    typeof s === 'number' &&
    Number.isFinite(s) &&
    s >= MIN_QUALIFYING_MOVING_SEC
  );
}

/**
 * EWMA convencional, do mais antigo ao mais recente, semeada em 0.
 *
 * `s[i] = λ·x[i] + (1−λ)·s[i−1]`. Devolve a série inteira porque o crônico
 * precisa ser lido num índice ANTERIOR ao fim — ver `computeLoadSignal`.
 */
export function ewmaSeries(values: number[], lambda: number): number[] {
  const out: number[] = [];
  let s = 0;
  for (const v of values) {
    s = lambda * v + (1 - lambda) * s;
    out.push(s);
  }
  return out;
}

/** Média plana dos últimos `n` valores. Ver `ACUTE_IS_FLAT_MEAN`. */
export function trailingMean(values: number[], n: number): number {
  if (values.length === 0 || n <= 0) return 0;
  const janela = values.slice(-n);
  return janela.reduce((a, b) => a + b, 0) / n;
}

// ── O sinal ──────────────────────────────────────────────────────────────────

/**
 * Agudo, crônico DESACOPLADO, razão e os dois pisos.
 *
 * ── O DESACOPLAMENTO, EM UMA LINHA ────────────────────────────────────────────
 *
 *     agudo   = média dos últimos 7 dias FECHADOS
 *     crônico = ewmaC[fim − 7]        ← lê ANTES da janela aguda
 *
 * A EWMA crônica em `fim−7` não contém nenhuma amostra dos últimos 7 dias. É a
 * base contra a qual a semana recente é comparada, e não uma média que inclui a
 * própria semana. Sem isso volta o teto de 4.00.
 */
export function computeLoadSignal(
  series: DailyLoad[],
  options: { fetchFailed?: boolean } = {},
): LoadSignal {
  const vazio: LoadSignal = {
    modulates: false,
    reason: 'indisponivel',
    acuteMinPerDay: 0,
    chronicMinPerDay: 0,
    chronicMinPerWeek: 0,
    ratio: null,
    diasDesdeUltimaCorrida: null,
    floorProgress: null,
  };

  if (options.fetchFailed) return vazio;
  if (series.length === 0) return vazio;

  const loads = series.map((d) => d.loadMin);
  const ewmaC = ewmaSeries(loads, LAMBDA_CHRONIC);

  const ultimo = series.length - 1;
  const idxCronico = ultimo - ACUTE_DAYS;

  const acuteMinPerDay = trailingMean(loads, ACUTE_DAYS);
  const chronicMinPerDay = idxCronico >= 0 ? ewmaC[idxCronico] : 0;
  const chronicMinPerWeek = chronicMinPerDay * 7;

  // ── Piso de histórico ──────────────────────────────────────────────────────
  const diasComCorrida = series.filter((d) => d.runs > 0);
  const runDays = diasComCorrida.length;
  const spanDays =
    runDays > 0
      ? diffDays(diasComCorrida[0].dateStr, series[ultimo].dateStr) + 1
      : 0;

  const diasDesdeUltimaCorrida =
    runDays > 0
      ? diffDays(
          diasComCorrida[diasComCorrida.length - 1].dateStr,
          series[ultimo].dateStr,
        )
      : null;

  const base = {
    acuteMinPerDay: round2(acuteMinPerDay),
    chronicMinPerDay: round2(chronicMinPerDay),
    chronicMinPerWeek: round2(chronicMinPerWeek),
    diasDesdeUltimaCorrida,
  };

  if (spanDays < FLOOR_MIN_SPAN_DAYS || runDays < FLOOR_MIN_RUN_DAYS) {
    return {
      ...base,
      modulates: false,
      reason: 'sem_historico',
      ratio: null,
      floorProgress: {
        spanDays,
        runDays,
        missingSpanDays: Math.max(0, FLOOR_MIN_SPAN_DAYS - spanDays),
        missingRunDays: Math.max(0, FLOOR_MIN_RUN_DAYS - runDays),
      },
    };
  }

  // ── Piso absoluto de crônico ───────────────────────────────────────────────
  if (chronicMinPerWeek < ABS_CHRONIC_FLOOR_MIN_PER_WEEK) {
    return {
      ...base,
      modulates: false,
      reason: 'carga_irrelevante',
      ratio: null,
      floorProgress: null,
    };
  }

  // `chronicMinPerWeek >= 60` já garante `chronicMinPerDay > 0`; a guarda é
  // redundante de propósito, porque uma divisão por zero aqui viraria Infinity
  // e atravessaria a escada inteira sem erro nenhum.
  const ratio =
    chronicMinPerDay > 0 ? round2(acuteMinPerDay / chronicMinPerDay) : null;

  return {
    ...base,
    modulates: ratio !== null,
    reason: ratio !== null ? 'ok' : 'carga_irrelevante',
    ratio,
    floorProgress: null,
  };
}

// ── Utilitários locais ───────────────────────────────────────────────────────

/** Dias entre duas datas 'YYYY-MM-DD', sem fuso. */
function diffDays(de: string, ate: string): number {
  const [y1, m1, d1] = de.split('-').map(Number);
  const [y2, m2, d2] = ate.split('-').map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
