/**
 * O "DIA DE READINESS" — definição ÚNICA, corte às 03:00 de São Paulo.
 *
 * ── O QUE ISTO SUBSTITUI ──────────────────────────────────────────────────────
 *
 * Cinco definições de "hoje" que discordavam entre si dentro da mesma feature:
 *
 *   readiness.service.ts     `getReadinessWindowStart()` — MEIA-NOITE, embora o
 *                            JSDoc três linhas acima prometesse 03:00. Era ela
 *                            que decidia `hasCheckedInToday`, ou seja: a
 *                            definição que mais importava era a errada.
 *   readiness.controller.ts  `getNextRotationTime()` — 03:00. O app recebia
 *                            "próxima virada às 03:00" enquanto o backend já
 *                            tinha virado o dia à meia-noite.
 *   question-sets-parser     `getSetNumberForDay()` — meia-noite.
 *   wellness.service.ts      `fetchTodayReadinessAnswers()` — uma CÓPIA
 *                            independente da janela do primeiro item.
 *   readiness.service.ts:446 `created_at.split('T')[0]` — dia UTC puro, sem
 *                            conversão nenhuma.
 *
 * Entre 00:00 e 02:59 de São Paulo as três primeiras discordavam ao mesmo
 * tempo: o check-in era "de hoje" para o banco e "de ontem" para a copy da tela.
 *
 * ── POR QUE NÃO MORA EM `common/` ─────────────────────────────────────────────
 *
 * Existem ~12 implementações de "dia de São Paulo" no repositório (streak, quota
 * de IA, gamificação, plano, sync de atividade…) e **todas as outras devem
 * continuar cortando à MEIA-NOITE**. Um `common/sao-paulo-day.ts` exportando um
 * corte de 03:00 é um convite para alguém adotá-lo por autocomplete e deslocar
 * um streak em silêncio. Morando aqui, `grep readiness-day.helper` devolve
 * exatamente os sites que devem usá-lo.
 *
 * ── POR QUE 03:00 ─────────────────────────────────────────────────────────────
 *
 * Quem corre de madrugada ainda está no "dia de treino" anterior. O corte à
 * meia-noite abriria um check-in novo para quem acabou de voltar da rua à 00:30.
 *
 * ⚠️ O fuso vem de `toSaoPauloDateStr`, que fixa UTC−3 ("sem horário de verão
 * desde 2019"). Se o Brasil reinstituir DST, este arquivo é o ÚNICO lugar a
 * corrigir para o readiness — as outras ~12 implementações são dívida separada.
 */

import { toSaoPauloDateStr } from '../../training/wellness/helpers/streak.helper';
import { addDaysStr } from '../../training/helpers/plan-window.helper';

/** O dia de readiness vira às 03:00 SP. 02:59 ainda é o dia anterior. */
export const READINESS_DAY_CUTOFF_HOUR = 3;

/** UTC−3, sem DST desde 2019. Espelha `streak.helper.ts`. */
const SAO_PAULO_OFFSET_HOURS = -3;

const HORA_EM_MS = 60 * 60 * 1000;

/**
 * O dia de readiness a que um instante pertence, como 'YYYY-MM-DD'.
 *
 * Recuar o relógio em 3 horas e perguntar o dia civil de São Paulo é
 * exatamente a mesma coisa que "o dia cujo corte das 03:00 já passou", e
 * delega o fuso à primitiva que o repositório já testa. As quatro variantes
 * bugadas que este arquivo substitui erravam todas dentro de expressões
 * `Date.UTC(..., -SAO_PAULO_OFFSET_HOURS, ...)` escritas à mão.
 */
export function readinessDayStr(now: Date = new Date()): string {
  return toReadinessDayStr(now.toISOString());
}

/** Idem, a partir de um ISO — para classificar uma linha já gravada. */
export function toReadinessDayStr(iso: string): string {
  const instante = new Date(iso).getTime();
  return toSaoPauloDateStr(
    new Date(instante - READINESS_DAY_CUTOFF_HOUR * HORA_EM_MS).toISOString(),
  );
}

/**
 * O início da janela do dia `dayStr`, em UTC.
 *
 * 03:00 em São Paulo (UTC−3) é 06:00Z do MESMO dia civil. É concatenação de
 * string de propósito: não sobra aritmética de `Date` para errar.
 */
export function readinessWindowStartIso(dayStr: string): string {
  const hora = String(
    READINESS_DAY_CUTOFF_HOUR - SAO_PAULO_OFFSET_HOURS,
  ).padStart(2, '0');
  return `${dayStr}T${hora}:00:00.000Z`;
}

/** O fim EXCLUSIVO da janela: o início do dia seguinte. */
export function readinessWindowEndIso(dayStr: string): string {
  return readinessWindowStartIso(addDaysStr(dayStr, 1));
}

/**
 * Quando o próximo dia de readiness começa — o `nextRotation` que o app exibe.
 *
 * Sempre o início da janela do dia SEGUINTE ao dia corrente, o que já cobre os
 * dois casos que a implementação anterior tratava com um `if (hora >= 3)`.
 */
export function nextReadinessRotationIso(now: Date = new Date()): string {
  return readinessWindowEndIso(readinessDayStr(now));
}
