import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import {
  PaceCalculatorService,
  TrainingZone,
  applyZonePacesToSegments,
} from '../../common/pace-calculator';
import {
  buildEffortSteps,
  replaySteps,
  normalizePoints,
  summarizeQualityEffort,
  deltaToPrescribedBand,
  QualityEffort,
} from '../../common/effort-replay';
import { toSaoPauloDateStr } from './wellness/helpers/streak.helper';

/**
 * REESTIMATIVA DE VDOT — o plano que se ajusta ao que o corredor entrega.
 *
 * ── O PRINCÍPIO ──────────────────────────────────────────────────────────────
 *
 * Número é cálculo determinístico; a IA só dá voz. Nada aqui consulta modelo:
 * a direção, a margem, o passo e o momento de mover são regra fechada. O Haiku
 * do insight semanal recebe a decisão pronta e apenas a narra.
 *
 * ── O SINAL ──────────────────────────────────────────────────────────────────
 *
 * Só o esforço de QUALIDADE (Z3/Z4/Z5), reconstruído dos pontos GPS pelo
 * `effort-replay`. O pace do treino inteiro não serve: ele mistura aquecimento,
 * trote de recuperação e volta à calma, todos lentos de propósito.
 *
 * Z1/Z2 ficam fora por coerência de produto — o cue `aliviar_ritmo` da Fase 2 já
 * lê "easy rápido demais" como ERRO. Usar o mesmo dado para subir o VDOT faria o
 * app afirmar duas coisas opostas sobre o mesmo fato.
 *
 * ── POR QUE TÃO CONSERVADOR ──────────────────────────────────────────────────
 *
 * Mover o VDOT reescreve o pace de todos os treinos futuros. O custo de errar
 * para cima é prescrever treino que machuca; para baixo, é destreinar. Por isso
 * são necessários VÁRIOS treinos concordando, com margem acima do ruído do
 * instrumento, e o passo é de 1 ponto por vez — nunca um salto para o "VDOT
 * implícito" do melhor treino.
 */

// ── Limiares (revisáveis; o racional de cada um está aqui) ───────────────────

/**
 * Quantos treinos de qualidade precisam concordar.
 *
 * Calibrado pela cadência REAL do motor de volume, não por intuição:
 * `VolumePlannerService.distributeWeek` cria no máximo UM slot de qualidade por
 * semana, e só nas fases `build`/`peak` (`days >= 3 && (build || peak)`). Um
 * plano de 10 km / 12 semanas tem 5 treinos de qualidade no total, todos a
 * partir da semana 7.
 *
 * Com 3, a primeira reestimativa possível é no fecho da 3ª semana de build —
 * e um plano típico permite ~1 movimento de VDOT. Exigir 5 tornaria a fase
 * decorativa; exigir 2 deixaria duas semanas atípicas mandarem no plano.
 */
export const MIN_QUALITY_EFFORTS = 3;

/**
 * Horizonte máximo para juntar esses treinos.
 *
 * A 1 treino de qualidade por semana, 3 treinos levam ≥3 semanas — e com uma
 * falta, 4 ou 5. 56 dias (8 semanas) absorve duas ausências sem invalidar a
 * janela, e ainda descarta desempenho velho demais para descrever a forma de
 * hoje.
 */
export const QUALITY_WINDOW_DAYS = 56;

/**
 * Margem mínima (s/km) ALÉM da faixa prescrita para o treino contar como sinal.
 *
 * A faixa já embute ±8 s/km de tolerância de execução, então 15 aqui significa
 * ~23 s/km de distância do centro. O piso é ditado pelo instrumento: o replay
 * recorta as sub-etapas na granularidade do GPS (~10 m), o que custa até
 * ~10 s/km de contaminação de fronteira — medido em `effort-replay.spec.ts`.
 * Uma margem menor mediria o próprio erro de medição.
 */
export const MIN_DELTA_SEC_BEYOND_BAND = 15;

/** Passo por reestimativa. Um ponto de VDOT ≈ 10–15 s/km em Z1. */
export const VDOT_STEP = 1;

// ── Tipos ────────────────────────────────────────────────────────────────────

interface QualityCandidate {
  workoutId: string;
  dateStr: string;
  effort: QualityEffort;
  deltaSeconds: number;
  impliedVdot: number;
}

export interface VdotChange {
  planId: string;
  vdotBefore: number;
  vdotAfter: number;
  direction: 'up' | 'down';
  reason: string;
  sampleSize: number;
  avgDeltaSeconds: number;
  workoutsRepriced: number;
  briefingsInvalidated: number;
}

interface WorkoutRow {
  id: string;
  scheduled_date: string;
  instructions_json: unknown;
}

@Injectable()
export class VdotService {
  private readonly logger = new Logger(VdotService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly paceCalculator: PaceCalculatorService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Semeadura
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Grava o VDOT inicial do plano — o que a geração já calculava e jogava fora.
   *
   * Best-effort: um plano sem VDOT gravado continua funcionando (os paces já
   * foram cravados nos segmentos); só não participa da reestimativa. Falhar a
   * criação do plano por causa disso seria trocar um recurso novo por um
   * fluxo que já funciona.
   */
  async seedForPlan(
    userId: string,
    planId: string,
    vdot: number | null | undefined,
  ): Promise<void> {
    if (!Number.isFinite(vdot as number) || !vdot) return;
    const value = Math.round(vdot * 10) / 10;

    try {
      const client = this.supabaseService.getClient();
      await client
        .from('training_plans')
        .update({ vdot_current: value })
        .eq('id', planId);

      await client.from('plan_vdot_history').insert({
        user_id: userId,
        plan_id: planId,
        vdot_before: null,
        vdot_after: value,
        source: 'seed',
        reason: 'VDOT inicial estimado no onboarding',
      });

      this.logger.log(`[VDOT] Plano ${planId} semeado com VDOT ${value}`);
    } catch (error) {
      this.logger.warn(
        `[VDOT] Falha ao semear VDOT do plano ${planId}: ${String(error)}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reestimativa
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Roda no fecho de uma semana do plano. Devolve a mudança quando houve — e
   * `null` quando não houve, que é o caso ESPERADO na maioria das semanas.
   */
  async reestimateForPlan(
    userId: string,
    planId: string,
    weekNumber: number,
    todayStr = toSaoPauloDateStr(new Date().toISOString()),
  ): Promise<VdotChange | null> {
    const client = this.supabaseService.getClient();

    const { data: plan } = await client
      .from('training_plans')
      .select('id, vdot_current')
      .eq('id', planId)
      .maybeSingle();

    const vdotBefore = Number(plan?.vdot_current);
    if (!plan || !Number.isFinite(vdotBefore) || vdotBefore <= 0) {
      // Plano anterior à Fase 3, ou walk/run: sem VDOT não há o que reestimar,
      // e inventar um valor de partida seria pior que não mexer.
      return null;
    }

    const votedIds = await this.loadVotedWorkoutIds(planId);
    const candidates = await this.collectQualityCandidates(
      planId,
      vdotBefore,
      votedIds,
      todayStr,
    );

    const decision = this.decide(candidates, vdotBefore);
    if (!decision) return null;

    const { direction, sample, avgDelta, vdotAfter } = decision;

    // A CONSEQUÊNCIA antes do REGISTRO: se a reescrita de paces falhar, nada é
    // gravado, os treinos não são marcados como já-votados, e a próxima semana
    // tenta de novo. O inverso deixaria o plano anunciando um VDOT que os paces
    // não refletem.
    const repriced = await this.applyPacesToFutureWorkouts(
      planId,
      vdotAfter,
      todayStr,
    );
    const briefings = await this.invalidateBriefings(repriced.workoutIds);

    const reason = this.buildReason(direction, sample.length, avgDelta);

    await client
      .from('training_plans')
      .update({ vdot_current: vdotAfter })
      .eq('id', planId);

    await client.from('plan_vdot_history').insert({
      user_id: userId,
      plan_id: planId,
      vdot_before: vdotBefore,
      vdot_after: vdotAfter,
      source: 'reestimate',
      reason,
      week_number: weekNumber,
      sample_size: sample.length,
      avg_delta_seconds: avgDelta,
      evidence: {
        workout_ids: sample.map((c) => c.workoutId),
        efforts: sample.map((c) => ({
          workout_id: c.workoutId,
          date: c.dateStr,
          zones: c.effort.zones,
          pace_seconds: c.effort.paceSecPerKm,
          prescribed_min: c.effort.prescribedPaceMin,
          prescribed_max: c.effort.prescribedPaceMax,
          delta_seconds: c.deltaSeconds,
          implied_vdot: c.impliedVdot,
          coverage: c.effort.coverage,
        })),
      },
    });

    this.logger.log(
      `[VDOT] Plano ${planId}: ${vdotBefore} → ${vdotAfter} (${reason}); ` +
        `${repriced.count} treinos reprecificados, ${briefings} briefings invalidados`,
    );

    return {
      planId,
      vdotBefore,
      vdotAfter,
      direction,
      reason,
      sampleSize: sample.length,
      avgDeltaSeconds: avgDelta,
      workoutsRepriced: repriced.count,
      briefingsInvalidated: briefings,
    };
  }

  /**
   * A REGRA. Pura, sem I/O — é o coração da fase e o que os testes travam.
   *
   * Move só quando os `MIN_QUALITY_EFFORTS` treinos mais recentes apontam TODOS
   * na mesma direção, cada um por mais que `MIN_DELTA_SEC_BEYOND_BAND`. Um
   * treino dentro da faixa (delta 0) é execução correta, não evidência — e
   * basta um para travar a mudança.
   */
  private decide(
    candidates: QualityCandidate[],
    vdotBefore: number,
  ): {
    direction: 'up' | 'down';
    sample: QualityCandidate[];
    avgDelta: number;
    vdotAfter: number;
  } | null {
    if (candidates.length < MIN_QUALITY_EFFORTS) return null;

    // Os mais recentes primeiro; a janela é deslizante sobre os treinos, não
    // sobre as semanas — com 1 treino de qualidade por semana, exigir "N na
    // mesma semana" nunca aconteceria.
    const sample = candidates
      .slice()
      .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1))
      .slice(0, MIN_QUALITY_EFFORTS);

    const allFaster = sample.every(
      (c) => c.deltaSeconds <= -MIN_DELTA_SEC_BEYOND_BAND,
    );
    const allSlower = sample.every(
      (c) => c.deltaSeconds >= MIN_DELTA_SEC_BEYOND_BAND,
    );
    if (!allFaster && !allSlower) return null;

    const direction: 'up' | 'down' = allFaster ? 'up' : 'down';
    const { min, max } = this.paceCalculator.bounds;
    const raw = vdotBefore + (direction === 'up' ? VDOT_STEP : -VDOT_STEP);
    const vdotAfter = Math.round(Math.min(max, Math.max(min, raw)) * 10) / 10;

    // Já no teto/piso do modelo: não há passo a dar, e gravar histórico de uma
    // mudança que não mudou nada só polui a série.
    if (vdotAfter === vdotBefore) return null;

    const avgDelta = Math.round(
      sample.reduce((s, c) => s + c.deltaSeconds, 0) / sample.length,
    );

    return { direction, sample, avgDelta, vdotAfter };
  }

  private buildReason(
    direction: 'up' | 'down',
    n: number,
    avgDelta: number,
  ): string {
    const lado = direction === 'up' ? 'acima' : 'abaixo';
    return (
      `${n} treinos de qualidade consistentemente ${lado} do prescrito ` +
      `(média de ${Math.abs(avgDelta)} s/km além da faixa)`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Coleta do sinal
  // ──────────────────────────────────────────────────────────────────────────

  /** Treinos que já sustentaram uma reestimativa — cada um vota UMA vez. */
  private async loadVotedWorkoutIds(planId: string): Promise<Set<string>> {
    const { data } = await this.supabaseService
      .getClient()
      .from('plan_vdot_history')
      .select('evidence')
      .eq('plan_id', planId)
      .eq('source', 'reestimate');

    const voted = new Set<string>();
    for (const row of data ?? []) {
      const ids = (row.evidence as { workout_ids?: unknown })?.workout_ids;
      if (Array.isArray(ids)) {
        for (const id of ids) if (typeof id === 'string') voted.add(id);
      }
    }
    return voted;
  }

  private async collectQualityCandidates(
    planId: string,
    vdotCurrent: number,
    votedIds: Set<string>,
    todayStr: string,
  ): Promise<QualityCandidate[]> {
    const client = this.supabaseService.getClient();
    const since = this.shiftDays(todayStr, -QUALITY_WINDOW_DAYS);

    const { data: workouts } = await client
      .from('workouts')
      .select('id, scheduled_date, instructions_json')
      .eq('plan_id', planId)
      .eq('status', 'completed')
      .gte('scheduled_date', since)
      .lte('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: false });

    const rows = ((workouts ?? []) as WorkoutRow[]).filter(
      (w) => !votedIds.has(w.id),
    );
    if (rows.length === 0) return [];

    // Uma query para todas as rotas — não uma por treino.
    const { data: routes } = await client
      .from('workout_routes')
      .select('workout_id, raw_data')
      .in(
        'workout_id',
        rows.map((w) => w.id),
      );

    const routeByWorkout = new Map<string, unknown>();
    for (const r of routes ?? []) {
      routeByWorkout.set(r.workout_id as string, r.raw_data);
    }

    const candidates: QualityCandidate[] = [];
    for (const w of rows) {
      const points = normalizePoints(routeByWorkout.get(w.id));
      if (points.length < 2) continue; // esteira, ou GPS que não gravou

      const steps = buildEffortSteps(w.instructions_json);
      const effort = summarizeQualityEffort(replaySteps(steps, points));
      if (!effort) continue;

      // A zona "dominante" do esforço, para o VDOT implícito. Com mais de uma,
      // a mais intensa manda — é ela que define o teto do atleta.
      const zone = (effort.zones.slice().sort().pop() ?? 'Z4') as TrainingZone;

      candidates.push({
        workoutId: w.id,
        dateStr: w.scheduled_date,
        effort,
        deltaSeconds: deltaToPrescribedBand(effort),
        impliedVdot: this.paceCalculator.impliedVdotForZonePace(
          zone,
          effort.paceSecPerKm,
        ),
      });
    }

    this.logger.log(
      `[VDOT] Plano ${planId}: ${candidates.length} treino(s) de qualidade ` +
        `elegíveis na janela de ${QUALITY_WINDOW_DAYS}d (VDOT atual ${vdotCurrent})`,
    );
    return candidates;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Aplicação
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Reescreve `pace_min`/`pace_max` dos treinos AINDA NÃO REALIZADOS.
   *
   * ── O QUE NÃO É TOCADO, E POR QUÊ ────────────────────────────────────────
   *
   * Só pace. Nunca `distance_km`, nunca a estrutura de segmentos, nunca a zona.
   * É essa fronteira que separa a Fase 3 da Fase 6: pace é derivação pura
   * `(zone, vdot)`, enquanto volume exigiria redistribuir km entre treinos,
   * respeitar longão/deload/taper e reescalar segmentos.
   *
   * Treino passado ou de hoje não se toca: reescrever o alvo de algo que já foi
   * corrido reescreveria a história, e um insight semanal já fechado passaria a
   * descrever uma prescrição que nunca existiu.
   *
   * `plan_json` guarda uma cópia dos mesmos segmentos, mas nenhum consumidor lê
   * pace de lá — `getPlanOverview` tira dali só `week.phase`, e todo o resto do
   * app (coach in-workout, cards, briefing, insight) lê
   * `workouts.instructions_json`. Reescrever os dois exigiria reconciliar
   * índices de semana/treino sem chave estável, o que é risco sem retorno.
   */
  async applyPacesToFutureWorkouts(
    planId: string,
    vdot: number,
    todayStr: string,
  ): Promise<{ count: number; workoutIds: string[] }> {
    const client = this.supabaseService.getClient();
    const ranges = this.paceCalculator.getZonePaceRangesSeconds(vdot);

    const { data: workouts } = await client
      .from('workouts')
      .select('id, scheduled_date, instructions_json')
      .eq('plan_id', planId)
      .eq('status', 'pending')
      .gt('scheduled_date', todayStr);

    const touched: string[] = [];
    for (const w of (workouts ?? []) as WorkoutRow[]) {
      if (!Array.isArray(w.instructions_json)) continue;

      const segments = JSON.parse(
        JSON.stringify(w.instructions_json),
      ) as unknown[];
      const changed = applyZonePacesToSegments(segments, ranges);
      if (changed === 0) continue;

      const { error } = await client
        .from('workouts')
        .update({ instructions_json: segments })
        .eq('id', w.id);

      if (error) {
        this.logger.warn(
          `[VDOT] Falha ao reprecificar treino ${w.id}: ${error.message}`,
        );
        continue;
      }
      touched.push(w.id);
    }

    return { count: touched.length, workoutIds: touched };
  }

  /**
   * Apaga os briefings profundos dos treinos reprecificados.
   *
   * `workout_briefings` tem `workout_id UNIQUE` e é gerado UMA vez: sem isto, o
   * texto do treinador continuaria citando "@ 6:12–6:30/km" ao lado de um card
   * já mostrando o pace novo — a voz do coach contradizendo o próprio app. O
   * texto regenera sob demanda na próxima abertura do treino.
   */
  private async invalidateBriefings(workoutIds: string[]): Promise<number> {
    if (workoutIds.length === 0) return 0;

    const { data, error } = await this.supabaseService
      .getClient()
      .from('workout_briefings')
      .delete()
      .in('workout_id', workoutIds)
      .select('id');

    if (error) {
      this.logger.warn(
        `[VDOT] Falha ao invalidar briefings: ${error.message} — ` +
          'o texto do coach pode citar o pace antigo até ser regenerado',
      );
      return 0;
    }
    return (data ?? []).length;
  }

  /** Soma dias a uma data YYYY-MM-DD sem passar por `Date` (e sem fuso). */
  private shiftDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = Date.UTC(y, m - 1, d) + days * 86_400_000;
    return new Date(base).toISOString().slice(0, 10);
  }
}
