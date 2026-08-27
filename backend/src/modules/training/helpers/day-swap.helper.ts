/**
 * A LÓGICA da Troca de Dias — Fase T.1.
 *
 * ── O QUE ESTA CAMADA DECIDE ─────────────────────────────────────────────────
 *
 * Dado um conjunto de dias novo (Modo 1) ou um treino + destino (Modo 2), qual
 * é a data nova de cada treino. Nada mais: não lê banco, não escreve, não sabe
 * o que é digest. O transporte é `PlanAdaptationService`; a política é aqui.
 *
 * Funções PURAS de propósito — é o que torna as invariantes (sem passado, sem
 * colisão, ordem preservada) testáveis sem mock nenhum. A mina 2 da Fase 6.1
 * nasceu de lógica que só rodava com banco atrás.
 *
 * ── AS TRÊS INVARIANTES ──────────────────────────────────────────────────────
 *
 *   1. nenhuma data nova em hoje ou no passado
 *   2. nenhuma colisão (dois treinos no mesmo dia)
 *   3. a quantidade de treinos por semana é preservada
 *
 * A (1) tem rede embaixo: a guarda `RE422` da T.0 recusa no SQL. A (2) NÃO tem
 * — não existe `UNIQUE (plan_id, scheduled_date)` em nenhum ambiente (medido em
 * staging e produção). Se a lógica daqui deixar passar uma colisão, o banco
 * aceita e o calendário fica com dois treinos no mesmo dia, em silêncio.
 */

import { HEAVY_TYPES } from '../../../common/workout-types';
import { addDaysStr } from './plan-window.helper';

/** 0 = domingo … 6 = sábado. O mesmo vocabulário de `available_days`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * O dia da semana de uma data `YYYY-MM-DD`.
 *
 * `Date.UTC` + `getUTCDay()`, nunca `new Date(str)`: o construtor de string
 * interpreta na TZ do PROCESSO (UTC no Railway) e um `getDay()` local
 * devolveria o dia errado perto da meia-noite de São Paulo. É a mesma
 * disciplina de `addDaysStr` e de `addDays` dos fixtures.
 */
export function weekdayOf(dateStr: string): Weekday {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** A forma mínima de treino que esta camada lê. */
export interface SwapWorkoutInput {
  id: string;
  week_number: number | null;
  scheduled_date: string;
  type: string | null;
  title: string | null;
}

export interface RemappedWorkout {
  workoutId: string;
  weekNumber: number;
  type: string | null;
  title: string | null;
  from: string;
  to: string;
  /** `false` quando o treino já estava no dia certo — sai do patch. */
  changed: boolean;
}

export type SwapRefusal =
  | 'no_editable_workouts'
  | 'no_next_week'
  | 'same_days'
  | 'day_count_mismatch'
  | 'week_count_mismatch'
  | 'invalid_days'
  | 'target_not_free'
  | 'target_in_past';

export type SwapOutcome<T> = { result: T } | { reason: SwapRefusal };

/**
 * Sucesso ou recusa, discriminado pela PRESENÇA de `reason`.
 *
 * O `tsconfig` do backend roda com `strictNullChecks: false`, e sem ele o
 * TypeScript não estreita união por discriminante booleano. `'reason' in x`
 * funciona nos dois modos — mesmo idioma da 6.2 e da 6.3.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Leitura do estado real
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os dias-da-semana que o corredor treina, DO CALENDÁRIO.
 *
 * ⚠️ Nunca de `user_onboarding.days_per_week`. Esse campo é a INTENÇÃO declarada
 * no onboarding e diverge da realidade materializada: medido em produção, o
 * plano `60f5e785` diz `freq=3` e tem UM treino por semana, doze semanas
 * seguidas, todos no sábado. Ler `days_per_week` faria a troca tentar
 * transformar 1 dia em 3 — que é regenerar o plano, não trocar os dias.
 *
 * A quantidade sai daqui, de uma semana de referência, e é o que "manter a
 * quantidade" quer dizer.
 */
export function readDaysOfWeek(
  workouts: SwapWorkoutInput[],
  weekNumber: number,
): Weekday[] {
  const dias = new Set<Weekday>();
  for (const w of workouts) {
    if (w.week_number !== weekNumber) continue;
    dias.add(weekdayOf(w.scheduled_date));
  }
  return [...dias].sort((a, b) => a - b);
}

/** Normaliza e valida um conjunto de dias vindo do cliente. */
export function normalizeDays(raw: unknown): Weekday[] | null {
  if (!Array.isArray(raw)) return null;
  const limpos = new Set<Weekday>();
  for (const d of raw) {
    const n = Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    limpos.add(n as Weekday);
  }
  return limpos.size === 0 ? null : [...limpos].sort((a, b) => a - b);
}

const mesmoConjunto = (a: Weekday[], b: Weekday[]): boolean =>
  a.length === b.length && a.every((d, i) => d === b[i]);

// ─────────────────────────────────────────────────────────────────────────────
// Modo 1 — troca estrutural
// ─────────────────────────────────────────────────────────────────────────────

export interface StructuralInput {
  /** Treinos da janela editável (futuros, pending, do plano, não-prova). */
  workouts: SwapWorkoutInput[];
  newDays: Weekday[];
  /** Primeira semana a remapear — a SEGUINTE à corrente. */
  fromWeekNumber: number;
  /** `YYYY-MM-DD` em São Paulo. Só para reafirmar a invariante 1. */
  todayStr: string;
  /**
   * Datas ocupadas por treinos que NÃO entram no patch: concluídos, pulados, o
   * dia da prova, treinos livres/manuais. Sem isto a checagem de colisão
   * enxergaria só metade do calendário.
   */
  occupiedDates: string[];
}

/**
 * O remapeamento estrutural: todas as semanas a partir de `fromWeekNumber`.
 *
 * ── A REGRA DE ORDEM ─────────────────────────────────────────────────────────
 *
 * Por semana:
 *   1. âncora = a MENOR data daquela semana (a mesma derivação de
 *      `derivePlanWeeks`; nunca `created_at + 7n`, que quebra após re-âncora);
 *   2. cada dia novo D vira `âncora + ((D - diaDaSemana(âncora) + 7) % 7)` — a
 *      aritmética de `createWorkoutsForWeek`, que mantém a semana inteira na
 *      janela de 7 dias `[âncora, âncora+6]`;
 *   3. ordena os treinos por data ATUAL, ordena as datas novas por DATA, e casa
 *      k-ésimo com k-ésimo.
 *
 * ⚠️ O passo 3 ordena as datas novas CRONOLOGICAMENTE, não pelo número do dia
 * da semana. A janela é ancorada no dia em que o PLANO começou, não no domingo,
 * e as duas ordens divergem: num plano que começou numa quarta, os dias
 * TER/QUI/SÁB caem no calendário como Qui, Sáb, Ter. Parear por número jogaria
 * o longão (último cronologicamente hoje) para a terça, no MEIO da semana.
 * Parear por data preserva a estrutura que o gerador montou.
 */
export function remapStructural(
  input: StructuralInput,
): SwapOutcome<RemappedWorkout[]> {
  const { workouts, newDays, fromWeekNumber, todayStr, occupiedDates } = input;

  if (newDays.length === 0) return { reason: 'invalid_days' };

  const alvos = workouts.filter(
    (w) => typeof w.week_number === 'number' && w.week_number >= fromWeekNumber,
  );
  if (alvos.length === 0) return { reason: 'no_next_week' };

  // O `filter` acima já garantiu `typeof === 'number'`, então o cast seria
  // ruído — o TypeScript estreitou o tipo sozinho.
  const semanas = [...new Set(alvos.map((w) => w.week_number))].sort(
    (a, b) => a - b,
  );

  const out: RemappedWorkout[] = [];

  for (const semana of semanas) {
    const daSemana = alvos
      .filter((w) => w.week_number === semana)
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : 1));

    // A quantidade é invariante: mais treinos que dias novos não tem para onde
    // ir, e escolher em silêncio quem fica de fora seria pior que recusar.
    if (daSemana.length > newDays.length) {
      return { reason: 'week_count_mismatch' };
    }

    const ancora = daSemana[0].scheduled_date;
    const diaDaAncora = weekdayOf(ancora);
    const datasNovas = newDays
      .map((d) => addDaysStr(ancora, (d - diaDaAncora + 7) % 7))
      .sort();

    for (let i = 0; i < daSemana.length; i++) {
      const w = daSemana[i];
      const to = datasNovas[i];
      out.push({
        workoutId: w.id,
        weekNumber: semana,
        type: w.type,
        title: w.title,
        from: w.scheduled_date,
        to,
        changed: to !== w.scheduled_date,
      });
    }
  }

  return assertInvariants(out, todayStr, occupiedDates);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo 2 — troca pontual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os dias que o Modo 2 pode OFERECER numa semana: ainda não passaram e não têm
 * treino.
 *
 * É aqui que os dois riscos morrem por construção, não por validação: o passado
 * some pela filtragem de data, e a colisão some porque um dia ocupado nunca é
 * oferecido. A validação no `remapSingle` existe como segunda camada, para o
 * caso de um cliente mandar uma data que a preview não ofereceu.
 */
export function freeDatesInWindow(params: {
  windowStart: string;
  windowEnd: string;
  todayStr: string;
  occupiedDates: string[];
}): string[] {
  const { windowStart, windowEnd, todayStr, occupiedDates } = params;
  const ocupadas = new Set(occupiedDates);
  const livres: string[] = [];

  // A janela é de 7 dias; iterar por data (e não por dia-da-semana) evita
  // qualquer suposição sobre onde a semana começa.
  for (let d = windowStart; d <= windowEnd; d = addDaysStr(d, 1)) {
    if (d <= todayStr) continue;
    if (ocupadas.has(d)) continue;
    livres.push(d);
  }
  return livres;
}

export function remapSingle(params: {
  workout: SwapWorkoutInput;
  targetDate: string;
  todayStr: string;
  occupiedDates: string[];
}): SwapOutcome<RemappedWorkout[]> {
  const { workout, targetDate, todayStr, occupiedDates } = params;

  if (targetDate <= todayStr) return { reason: 'target_in_past' };
  // A própria data do treino NÃO é ocupação: escolher o dia em que ele já está
  // é um no-op, não uma colisão. `assertInvariants` também descarta as origens
  // dos treinos movidos; aqui a exclusão precisa ser explícita porque a guarda
  // roda antes dele.
  if (
    targetDate !== workout.scheduled_date &&
    occupiedDates.includes(targetDate)
  ) {
    return { reason: 'target_not_free' };
  }

  const remapped: RemappedWorkout = {
    workoutId: workout.id,
    weekNumber: workout.week_number ?? 0,
    type: workout.type,
    title: workout.title,
    from: workout.scheduled_date,
    to: targetDate,
    changed: targetDate !== workout.scheduled_date,
  };

  return assertInvariants([remapped], todayStr, occupiedDates);
}

// ─────────────────────────────────────────────────────────────────────────────
// As invariantes, num lugar só
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reafirma (1) sem passado e (2) sem colisão sobre o resultado JÁ calculado.
 *
 * Redundante com a construção dos dois modos, e de propósito: os dois evitam o
 * problema por desenho, mas é esta função que TRAVA — se um refactor futuro
 * quebrar o desenho, aqui é onde o teste pega, e não em produção.
 */
function assertInvariants(
  remapped: RemappedWorkout[],
  todayStr: string,
  occupiedDates: string[],
): SwapOutcome<RemappedWorkout[]> {
  for (const r of remapped) {
    if (r.to <= todayStr) return { reason: 'target_in_past' };
  }

  // O estado FINAL do calendário: as datas que ficam paradas + as novas. Um
  // treino remapeado não colide consigo mesmo, então a origem sai da conta.
  const movidos = new Set(remapped.map((r) => r.from));
  const finais = new Set<string>();
  for (const d of occupiedDates) {
    if (!movidos.has(d)) finais.add(d);
  }
  for (const r of remapped) {
    if (finais.has(r.to)) return { reason: 'target_not_free' };
    finais.add(r.to);
  }

  return { result: remapped };
}

/** As datas novas coincidem com as atuais? Então não há troca a fazer. */
export function isNoOp(remapped: RemappedWorkout[]): boolean {
  return remapped.every((r) => !r.changed);
}

export { mesmoConjunto as sameDaySet };

// ─────────────────────────────────────────────────────────────────────────────
// A régua de espaçamento
// ─────────────────────────────────────────────────────────────────────────────

export interface SpacingPair {
  /** Os dois pesados que ficaram colados, em ordem cronológica. */
  first: {
    workoutId: string;
    type: string | null;
    title: string | null;
    date: string;
  };
  second: {
    workoutId: string;
    type: string | null;
    title: string | null;
    date: string;
  };
}

export interface SpacingVerdict {
  verdict: 'ok' | 'apertado';
  /** Os pares colados, para o chat citar. Vazio quando `ok`. */
  pairs: SpacingPair[];
}

export const isHeavy = (type: string | null | undefined): boolean =>
  HEAVY_TYPES.has(type ?? '');

/**
 * O arranjo NOVO cola dois treinos pesados?
 *
 * ── O QUE ELA AVALIA, E O QUE NÃO ────────────────────────────────────────────
 *
 * Só o arranjo NOVO. Nunca o atual — o gerador de hoje já entrega pesados
 * colados (DOM/SEG/TER com qualidade na segunda e longão na terça é um arranjo
 * real que ele produz), e o app abrir criticando o próprio plano seria uma
 * conversa que ninguém pediu. O corredor está montando um arranjo agora; é
 * sobre ESSE que faz sentido opinar.
 *
 * ── E ELA NUNCA BLOQUEIA ─────────────────────────────────────────────────────
 *
 * Devolve veredito, não veto — a mesma postura do feasibility da Fase 5:
 * honesto, nunca em silêncio, corredor no controle. Quem decide se treina
 * pesado dois dias seguidos é quem vai correr.
 *
 * ── O CASO DE UM PESADO SÓ ───────────────────────────────────────────────────
 *
 * Semanas de `base` e de `taper` não têm sessão de qualidade — o `qualitySlot`
 * do gerador só existe em `build`/`peak` e com 3+ dias. Nelas o único pesado é
 * o longão, não há par possível, e a régua cala a boca em vez de inventar
 * assunto.
 */
export function evaluateSpacing(remapped: RemappedWorkout[]): SpacingVerdict {
  const pesados = remapped
    .filter((r) => isHeavy(r.type))
    .sort((a, b) => (a.to < b.to ? -1 : 1));

  const pairs: SpacingPair[] = [];

  for (let i = 1; i < pesados.length; i++) {
    const anterior = pesados[i - 1];
    const atual = pesados[i];
    if (addDaysStr(anterior.to, 1) !== atual.to) continue;

    pairs.push({
      first: {
        workoutId: anterior.workoutId,
        type: anterior.type,
        title: anterior.title,
        date: anterior.to,
      },
      second: {
        workoutId: atual.workoutId,
        type: atual.type,
        title: atual.title,
        date: atual.to,
      },
    });
  }

  return { verdict: pairs.length > 0 ? 'apertado' : 'ok', pairs };
}
