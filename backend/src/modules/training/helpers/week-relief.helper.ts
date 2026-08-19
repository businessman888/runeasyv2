/**
 * A POLÍTICA de alívio de volume no nível da SEMANA — Fase 6.3.
 *
 * ── O QUE ESTA CAMADA DECIDE ─────────────────────────────────────────────────
 *
 * A 6.2 respondeu "como encolher UM treino" (por tipo de bloco: `main` cede,
 * aquecimento não, `repeat` perde reps, pace nunca). Esta camada responde a
 * pergunta de cima: **quais treinos da semana cedem, e quanto cada um.** O corte
 * por treino continua sendo `reduceByAmount` — não há uma segunda escada aqui.
 *
 * ── A POLÍTICA: PRESERVAR A QUALIDADE ────────────────────────────────────────
 *
 *   CEDEM      longão · rodagens fáceis · recuperação
 *   PROTEGIDOS tiro, limiar, fartlek, ladeira, progressivo · E a simulação de prova
 *
 * O longão cede porque ele é VOLUME, não intensidade — e é a maior base
 * disponível. Protegê-lo deixaria a política sem espaço para aliviar sem tocar
 * no estímulo. Já a qualidade é o que sustenta a adaptação: cortar o tiro para
 * "aliviar" troca o problema por um pior, e é o oposto do que a regra 80/20 do
 * gerador constrói.
 *
 * O conjunto protegido mora em `common/workout-types` porque o gerador precisa
 * da mesma classificação — ver o comentário de lá sobre por que
 * `race_simulation` diverge entre os dois conjuntos.
 *
 * ── O DENOMINADOR É A SEMANA INTEIRA ─────────────────────────────────────────
 *
 * "−20% da semana" significa 20% do total da SEMANA, mesmo que o corte saia só
 * dos cortáveis. Numa semana de 34 km com 8 km de qualidade, −20% são 6,8 km
 * tirados de uma base de 26 km. O corredor pediu para a semana ficar 20% mais
 * leve, não para os fáceis ficarem 20% mais leves.
 *
 * ── DISTRIBUIÇÃO PROPORCIONAL À CAPACIDADE ───────────────────────────────────
 *
 * Cada treino cede na proporção do quanto ele PODE ceder — não do quanto ele
 * mede. A diferença importa: dois treinos de 7 km cedem igual, mas um longão de
 * 12 km com `main` de 8 km tem muito mais folga que um easy de 7 km com `main`
 * de 4 km, e distribuir por tamanho pediria a um deles mais do que cabe.
 *
 * A capacidade não é recalculada aqui: ela é MEDIDA chamando o próprio
 * `reduceByAmount` com um alvo infinito. Reimplementar os pisos (`MIN_MAIN_KM`,
 * `MIN_REPS`) nesta camada criaria duas cópias da mesma regra — o defeito que a
 * Fase 6 inteira existe para não repetir.
 *
 * Efeito colateral desejado: o longão, tendo a maior folga, absorve a maior
 * fatia do corte. Isso sai de graça da proporcionalidade, sem regra especial.
 */

import { PROTECTED_FROM_VOLUME_CUT } from '../../../common/workout-types';
import {
  reduceByAmount,
  totalsOfSegments,
  ReliefLevel,
  RELIEF_TARGET_PCT,
} from './volume-relief.helper';

/** A forma mínima de treino que a política lê. */
export interface WeekWorkoutInput {
  id: string;
  type: string | null;
  title: string | null;
  scheduled_date: string;
  instructions_json: unknown;
}

export interface WeekReliefChange {
  workoutId: string;
  title: string | null;
  type: string | null;
  scheduledDate: string;
  /** `true` = qualidade preservada; a UI mostra isso explicitamente. */
  isProtected: boolean;
  beforeKm: number;
  afterKm: number;
  changed: boolean;
  /** Só presente quando o treino de fato mudou — é o que vai no patch. */
  segments?: unknown[];
}

export interface WeekReliefResult {
  level: ReliefLevel;
  /** O alvo nominal (20 / 35). Para rotular, nunca para prometer. */
  targetPct: number;
  /** O corte REAL sobre o total da semana. Pode ser menor. */
  achievedPct: number;
  weekTotalKmBefore: number;
  weekTotalKmAfter: number;
  changes: WeekReliefChange[];
  changed: boolean;
}

export type WeekReliefRefusal =
  | 'no_workouts'
  | 'week_time_based'
  | 'nothing_to_reduce';

/**
 * Sucesso ou recusa.
 *
 * Discriminado pela PRESENÇA de `reason`, não por um booleano `ok`: o
 * `tsconfig` do backend roda com `strictNullChecks: false`, e sem ele o
 * TypeScript não estreita união por discriminante booleano. `'reason' in x`
 * funciona nos dois modos — é o mesmo idioma que `VolumeReliefService.resolve`
 * já usa desde a 6.2.
 */
export type WeekReliefOutcome =
  | { result: WeekReliefResult }
  | { reason: WeekReliefRefusal };

/** Tolerância de reconciliação — abaixo disso o resíduo é ruído de arredondamento. */
const RESIDUE_TOLERANCE_KM = 0.05;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Calcula a semana aliviada. Pura: não toca em nada do que recebe.
 *
 * `workouts` já deve vir filtrado pela fronteira de edição (futuros, pendentes,
 * do plano ativo, não-prova) e pela semana alvo. Esta função não conhece
 * fronteira — ela só distribui.
 */
export function computeWeekRelief(
  workouts: WeekWorkoutInput[],
  level: ReliefLevel,
): WeekReliefOutcome {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return { reason: 'no_workouts' };
  }

  const entries = workouts.map((w) => {
    const totals = totalsOfSegments(w.instructions_json);
    return {
      w,
      km: totals.km,
      seconds: totals.seconds,
      isProtected: PROTECTED_FROM_VOLUME_CUT.has(w.type ?? ''),
    };
  });

  // ── Semana por TEMPO: recusa ────────────────────────────────────────────────
  //
  // Protocolo caminhada/corrida mede em minutos. Somar km e minutos num "total
  // da semana" não significa nada, e walk/run está fora da v1 da Fase 6. Recusar
  // é mais honesto que entregar um número que não quer dizer coisa alguma.
  if (entries.some((e) => e.km <= 0 && e.seconds > 0)) {
    return { reason: 'week_time_based' };
  }

  const weekTotalKmBefore = round2(entries.reduce((s, e) => s + e.km, 0));
  if (weekTotalKmBefore <= 0) return { reason: 'no_workouts' };

  const cuttable = entries.filter((e) => !e.isProtected && e.km > 0);
  if (cuttable.length === 0) return { reason: 'nothing_to_reduce' };

  // ── Capacidade: MEDIDA, não recalculada ─────────────────────────────────────
  //
  // Alvo infinito = "corte tudo que os pisos permitirem". A resposta é a folga
  // real daquele treino, obtida pela MESMA função que fará o corte de verdade.
  const capacity = new Map<string, number>();
  for (const e of cuttable) {
    const max = reduceByAmount(e.w.instructions_json, Infinity);
    capacity.set(e.w.id, max ? round2(e.km - max.distanceKm) : 0);
  }
  const totalCapacity = round2(
    cuttable.reduce((s, e) => s + (capacity.get(e.w.id) ?? 0), 0),
  );
  if (totalCapacity <= 0) return { reason: 'nothing_to_reduce' };

  const pct = RELIEF_TARGET_PCT[level];
  const targetCutKm = (weekTotalKmBefore * pct) / 100;

  // ── Passada 1: proporcional à CAPACIDADE ────────────────────────────────────
  //
  // Quando o alvo não cabe na semana inteira, todo mundo vai ao piso e o
  // resultado é o máximo possível — a preview reporta o percentual real, e é
  // isso que o corredor vê. A qualidade continua intocada: o alívio limita, não
  // transborda.
  const assigned = new Map<string, number>();
  for (const e of cuttable) {
    const cap = capacity.get(e.w.id) ?? 0;
    const share =
      targetCutKm >= totalCapacity ? cap : (targetCutKm * cap) / totalCapacity;
    assigned.set(e.w.id, share);
  }

  const applyCut = (e: (typeof cuttable)[number], cut: number) =>
    reduceByAmount(e.w.instructions_json, cut);

  const results = new Map<string, ReturnType<typeof reduceByAmount>>();
  for (const e of cuttable) {
    results.set(e.w.id, applyCut(e, assigned.get(e.w.id) ?? 0));
  }

  const actualCut = (e: (typeof cuttable)[number]): number => {
    const r = results.get(e.w.id);
    return r ? round2(e.km - r.distanceKm) : 0;
  };

  // ── Passada 2: reconcilia o resíduo de arredondamento ───────────────────────
  //
  // `reduceByAmount` arredonda repetições para BAIXO — meia repetição não
  // existe. Num treino cortável com bloco `repeat`, isso deixa um resíduo. Sem
  // esta passada, a semana entregaria menos que o possível mesmo havendo folga
  // sobrando em outro treino, e o `achievedPct` sairia pessimista sem motivo.
  let residue = targetCutKm - cuttable.reduce((s, e) => s + actualCut(e), 0);
  if (residue > RESIDUE_TOLERANCE_KM) {
    // Maior folga restante primeiro: quem tem mais espaço absorve o resíduo com
    // menos chance de esbarrar no próprio piso.
    const byHeadroom = [...cuttable].sort(
      (a, b) =>
        (capacity.get(b.w.id) ?? 0) -
        actualCut(b) -
        ((capacity.get(a.w.id) ?? 0) - actualCut(a)),
    );

    for (const e of byHeadroom) {
      if (residue <= RESIDUE_TOLERANCE_KM) break;
      const cap = capacity.get(e.w.id) ?? 0;
      const already = actualCut(e);
      const headroom = round2(cap - already);
      if (headroom <= 0) continue;

      // Recorta do ORIGINAL com o alvo maior — nunca cortar de novo em cima do
      // já cortado, que aplicaria os pisos duas vezes sobre um estado diferente.
      const bigger = Math.min(cap, already + residue);
      const r = applyCut(e, bigger);
      if (!r) continue;

      const novoCorte = round2(e.km - r.distanceKm);
      const ganho = round2(novoCorte - already);
      if (ganho <= 0) continue;

      results.set(e.w.id, r);
      residue = round2(residue - ganho);
    }
  }

  // ── Monta o resultado ───────────────────────────────────────────────────────
  const changes: WeekReliefChange[] = entries.map((e) => {
    const r = e.isProtected ? null : results.get(e.w.id);
    const afterKm = r ? r.distanceKm : e.km;
    const changed = !!r && r.changed && afterKm < e.km;

    return {
      workoutId: e.w.id,
      title: e.w.title,
      type: e.w.type,
      scheduledDate: e.w.scheduled_date,
      isProtected: e.isProtected,
      beforeKm: e.km,
      afterKm: round2(afterKm),
      changed,
      segments: changed ? r.segments : undefined,
    };
  });

  const weekTotalKmAfter = round2(changes.reduce((s, c) => s + c.afterKm, 0));
  const achievedPct =
    weekTotalKmBefore > 0
      ? Math.round(
          ((weekTotalKmBefore - weekTotalKmAfter) / weekTotalKmBefore) * 100,
        )
      : 0;

  return {
    result: {
      level,
      targetPct: pct,
      achievedPct,
      weekTotalKmBefore,
      weekTotalKmAfter,
      changes,
      changed: changes.some((c) => c.changed),
    },
  };
}
