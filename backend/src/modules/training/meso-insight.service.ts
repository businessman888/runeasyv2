import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService, AI_FEATURES } from '../../common/ai';
import { VolumePlannerService, WeekPhase } from '../../common/volume-planner';
import {
  PlanWeekWindow,
  derivePlanWeeks,
  isPlanFinished,
} from './helpers/plan-window.helper';
import {
  MESO_BLOCK_WEEKS,
  weeksOfBlock,
  blockClosedByWeek,
  dominantPhase,
  PHASE_LABELS,
} from './helpers/meso-block.helper';
import {
  ZoneBucket,
  IntensityBucket,
  WindowWorkoutRow,
  buildZoneDistribution,
  buildIntensityAdherence,
  avgExpectedPaceSeconds,
  num,
  round1,
} from './helpers/window-metrics.helper';
import { resolveTargetFrequency } from './wellness/helpers/metrics.helper';
import { toSaoPauloDateStr } from './wellness/helpers/streak.helper';
import { VdotService, MeasuredQualityEffort } from './vdot.service';

/**
 * INSIGHT DE MESOCICLO — o arco de um BLOCO DE 4 SEMANAS do plano.
 *
 * ── A ALTITUDE QUE FALTAVA ────────────────────────────────────────────────────
 *
 * O insight semanal é a foto de uma semana; a retrospectiva é o ciclo inteiro.
 * Entre os dois não havia nada — um plano de 12 semanas produzia 11 fotos e 1
 * fechamento, e nenhuma delas descrevia a TENDÊNCIA de um bloco de treino.
 *
 * ── REFLEXÃO, SEM AÇÃO ────────────────────────────────────────────────────────
 *
 * Esta fase não decide nada. Não há enum de reajuste, não há endpoint de
 * aplicar, não há write em `workouts`. O espaço de ação já está ocupado:
 * calendário é ação do insight SEMANAL, pace é automático desde a Fase 3
 * (reestimativa de VDOT), e volume/prescrição é explicitamente Fase 6. Uma ação
 * nova aqui anteciparia a Fase 6 com outro nome e diluiria o único canal que
 * hoje pede um toque.
 *
 * ── O EIXO NÃO É O VDOT ───────────────────────────────────────────────────────
 *
 * Seria tentador vender a fase como "a evolução do seu nível", mas a cadência
 * real não sustenta isso: slots de qualidade só existem em build/peak, um por
 * semana, e com `MIN_QUALITY_EFFORTS = 3` um plano de 12 semanas move o VDOT no
 * máximo UMA vez — no fecho da semana 9, que cai no bloco 3, que é suprimido.
 * Os blocos que de fato disparam terão VDOT parado quase sempre.
 *
 * Por isso o eixo é `volumeTrend` + `qualityEfforts`, e o VDOT é um destaque
 * ocasional. "Sem movimento" tem conteúdo próprio — o pace real dos tiros —,
 * não é um vazio a ser preenchido com invenção.
 */

/** Uma linha de `plan_meso_insights`, na forma mínima que este service lê. */
export interface MesoInsightRow {
  id: string;
  plan_id: string;
  user_id: string;
  block_index: number;
  week_start: number;
  week_end: number;
  block_start: string;
  block_end: string;
  dominant_phase: string;
  ai_narrative: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  notified_at: string | null;
  seen_at: string | null;
}

/** Uma semana do arco — o dado que o insight semanal não tem como produzir. */
export interface VolumeTrendPoint {
  weekNumber: number;
  plannedKm: number;
  completedKm: number;
}

/** Movimento de VDOT dentro do bloco. `null` é o caso comum. */
export interface MesoVdotHighlight {
  vdotBefore: number;
  vdotAfter: number;
  direction: 'up' | 'down';
  weekNumber: number | null;
  reason: string | null;
  sampleSize: number | null;
}

export interface MesoMetrics {
  blockIndex: number;
  weekStart: number;
  weekEnd: number;
  blockStart: string;
  blockEnd: string;
  dominantPhase: WeekPhase;
  phaseLabel: string;

  // ── Aderência ao plano (escopo: workouts do plano no bloco) ──
  plannedWorkouts: number;
  completedWorkouts: number;
  completionRate: number;
  plannedDistanceKm: number;
  completedDistanceKm: number;
  distanceVsGoalPercent: number;
  executionRatioPercent: number;
  avgPaceSeconds: number;
  expectedPaceSeconds: number;

  frequencyActualDays: number;
  frequencyTargetDays: number;

  // ── Total corrido na janela (INCLUI corrida livre) ──
  totalDistanceKm: number;
  totalRunsInPeriod: number;
  freeRunDistanceKm: number;

  // ── Blocos estruturados ──
  volumeTrend: VolumeTrendPoint[];
  zoneDistribution: {
    prescribed: Record<string, ZoneBucket>;
    executed: Record<string, ZoneBucket>;
  };
  intensityAdherence: Record<string, IntensityBucket>;
  qualityEfforts: MeasuredQualityEffort[];
  vdotHighlight: MesoVdotHighlight | null;
}

/** Treino do plano, na forma que o roll-up precisa. */
interface MesoWorkoutRow extends WindowWorkoutRow {
  week_number: number | null;
  scheduled_date: string | null;
}

interface ActivityRow {
  start_date: string;
  distance: number | null;
}

interface PlanRow {
  goal: string | null;
  goal_type: string | null;
  race_distance: number | null;
  duration_weeks: number | null;
}

interface VdotHistoryRow {
  vdot_before: number | string | null;
  vdot_after: number | string | null;
  week_number: number | null;
  reason: string | null;
  sample_size: number | null;
}

@Injectable()
export class MesoInsightService {
  private readonly logger = new Logger(MesoInsightService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly aiRouter: AIRouterService,
    private readonly volumePlanner: VolumePlannerService,
    private readonly vdotService: VdotService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Gatilho
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * A semana que acabou de fechar encerra um bloco? Se sim, gera o insight.
   *
   * Chamado de dentro do laço de semanas do `WeeklyInsightService` — não há
   * cron próprio. Piggyback deliberado: o cron da Fase 2 já varre planos ativos
   * de Pro à meia-noite de São Paulo, já derivou as janelas de semana e já
   * carregou os treinos do plano. Um segundo cron repetiria tudo isso para
   * chegar na mesma conclusão um instante depois.
   *
   * Devolve a linha criada, ou `null` quando não havia bloco a fechar (o caso
   * de 3 em cada 4 semanas), quando o bloco já tem insight, ou quando a geração
   * falhou. O chamador usa isso para decidir se silencia o push do semanal.
   */
  async maybeGenerateForClosedWeek(params: {
    userId: string;
    planId: string;
    weekNumber: number;
    weeks: PlanWeekWindow[];
    workouts: MesoWorkoutRow[];
    planFrequency: number | null;
  }): Promise<MesoInsightRow | null> {
    const { userId, planId, weekNumber, weeks, workouts, planFrequency } =
      params;

    const lastWeekNumber = weeks[weeks.length - 1]?.weekNumber ?? 0;
    const blockIndex = blockClosedByWeek(weekNumber, lastWeekNumber);
    if (blockIndex == null) return null;

    return this.generateForBlock({
      userId,
      planId,
      blockIndex,
      weeks,
      workouts,
      planFrequency,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Geração
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Gera (ou tenta gerar) o insight de UM bloco.
   *
   * Placeholder → métricas → narrativa → UPDATE. Falha deixa a linha em
   * `status='failed'` em vez de apagá-la: a UNIQUE já garante unicidade, então
   * persistir a falha é seguro e deixa a porta aberta para tentar de novo.
   * Mesma escolha do `plan_week_insights`.
   */
  async generateForBlock(params: {
    userId: string;
    planId: string;
    blockIndex: number;
    weeks: PlanWeekWindow[];
    workouts: MesoWorkoutRow[];
    planFrequency: number | null;
  }): Promise<MesoInsightRow | null> {
    const { userId, planId, blockIndex, weeks, workouts, planFrequency } =
      params;
    const supabase = this.supabaseService.getClient();

    const blockWeeks = weeksOfBlock(blockIndex);
    const windows = weeks.filter((w) => blockWeeks.includes(w.weekNumber));
    if (windows.length === 0) return null;

    const blockStart = windows
      .map((w) => w.startStr)
      .reduce((a, b) => (a < b ? a : b));
    const blockEnd = windows
      .map((w) => w.endStr)
      .reduce((a, b) => (a > b ? a : b));

    // Dedupe POR TABELA, nunca em memória: a checagem é uma query e a
    // `UNIQUE (plan_id, block_index)` é a rede final — que é também o que
    // protege se o backend rodar em mais de uma réplica.
    const { data: existing } = await supabase
      .from('plan_meso_insights')
      .select('id')
      .eq('plan_id', planId)
      .eq('block_index', blockIndex)
      .maybeSingle();
    if (existing) return null;

    const phase = await this.resolveDominantPhase(planId, blockWeeks);

    const { data: inserted, error: insertError } = await supabase
      .from('plan_meso_insights')
      .insert({
        user_id: userId,
        plan_id: planId,
        block_index: blockIndex,
        week_start: blockWeeks[0],
        week_end: blockWeeks[blockWeeks.length - 1],
        block_start: blockStart,
        block_end: blockEnd,
        dominant_phase: phase,
        status: 'processing',
      })
      .select()
      .single();

    const row = inserted as MesoInsightRow | null;
    if (insertError || !row) {
      // Caminho esperado quando a UNIQUE barra uma corrida entre réplicas.
      this.logger.warn(
        `[MesoInsight] Não criou placeholder p/ plano ${planId} bloco ${blockIndex}: ${insertError?.message}`,
      );
      return null;
    }

    try {
      const metrics = await this.buildMesoMetrics({
        userId,
        planId,
        blockIndex,
        blockWeeks,
        blockStart,
        blockEnd,
        phase,
        windows,
        workouts,
        planFrequency,
      });

      const narrative = await this.generateNarrative(userId, metrics);

      const { data: updated, error: updateError } = await supabase
        .from('plan_meso_insights')
        .update({
          planned_workouts: metrics.plannedWorkouts,
          completed_workouts: metrics.completedWorkouts,
          completion_rate: metrics.completionRate,
          planned_distance_km: metrics.plannedDistanceKm,
          completed_distance_km: metrics.completedDistanceKm,
          distance_vs_goal_percent: metrics.distanceVsGoalPercent,
          execution_ratio_percent: metrics.executionRatioPercent,
          avg_pace_seconds: metrics.avgPaceSeconds,
          expected_pace_seconds: metrics.expectedPaceSeconds,
          frequency_actual_days: metrics.frequencyActualDays,
          frequency_target_days: metrics.frequencyTargetDays,
          total_distance_km: metrics.totalDistanceKm,
          total_runs_in_period: metrics.totalRunsInPeriod,
          free_run_distance_km: metrics.freeRunDistanceKm,
          volume_trend: metrics.volumeTrend,
          zone_distribution: metrics.zoneDistribution,
          intensity_adherence: metrics.intensityAdherence,
          quality_efforts: metrics.qualityEfforts,
          vdot_highlight: metrics.vdotHighlight,
          ai_narrative: narrative,
          status: 'completed',
          processed_at: new Date().toISOString(),
          notified_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select()
        .single();

      if (updateError || !updated) {
        this.logger.error('[MesoInsight] UPDATE falhou:', updateError);
        await this.markFailed(row.id);
        return null;
      }

      await this.sendNotification(
        userId,
        row.id,
        planId,
        blockIndex,
        metrics.phaseLabel,
      );

      this.logger.log(
        `[MesoInsight] Bloco ${blockIndex} (S${metrics.weekStart}-${metrics.weekEnd}, ` +
          `${phase}) gerado p/ plano ${planId}`,
      );
      return updated as MesoInsightRow;
    } catch (err) {
      this.logger.error(`[MesoInsight] Erro gerando bloco ${blockIndex}:`, err);
      await this.markFailed(row.id);
      return null;
    }
  }

  private async markFailed(id: string): Promise<void> {
    await this.supabaseService
      .getClient()
      .from('plan_meso_insights')
      .update({ status: 'failed', processed_at: new Date().toISOString() })
      .eq('id', id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fase dominante
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * A fase de cada semana do bloco, RECOMPUTADA de `calculatePhases`.
   *
   * Nunca lida de `plan_json.weeks[].phase`: até 2026-08-11 aquele campo era
   * eco do modelo, não cálculo, e planos gerados antes do fix carregam a fase
   * que a IA inventou. `calculatePhases` é função pura de
   * (duration_weeks, goalKm) — recomputá-la dá a resposta certa inclusive para
   * planos antigos.
   */
  private async resolveDominantPhase(
    planId: string,
    blockWeeks: number[],
  ): Promise<WeekPhase> {
    const { data } = await this.supabaseService
      .getClient()
      .from('training_plans')
      .select('goal, goal_type, race_distance, duration_weeks')
      .eq('id', planId)
      .maybeSingle();

    const plan = (data ?? null) as PlanRow | null;
    const totalWeeks = Number(plan?.duration_weeks) || 0;
    if (!plan || totalWeeks <= 0) return 'base';

    const goalKm = this.volumePlanner.resolveGoalKm({
      goal: plan.goal,
      goalType: plan.goal_type,
      raceDistance: plan.race_distance,
    });
    const phases = this.volumePlanner.calculatePhases(totalWeeks, goalKm);

    // A escada mora no VolumePlannerService (Fase 6.1). Existiam duas cópias —
    // esta e a do próprio motor — e o overview estava prestes a virar a
    // terceira; duas implementações da mesma regra é como as fronteiras
    // divergentes nasceram.
    return dominantPhase(
      blockWeeks.map((week) => this.volumePlanner.phaseOfWeek(week, phases)),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Métricas
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Métricas do bloco, em DOIS BLOCOS QUE NUNCA SE SOMAM (regra da Fase 1A).
   *
   * ── POR QUE DE `workouts`, E NÃO SOMANDO `plan_week_insights` ─────────────
   *
   * Somar as linhas semanais parece o caminho barato, e herdaria dois buracos:
   *
   *   1. a ÚLTIMA semana do plano nunca tem linha em `plan_week_insights` (é
   *      suprimida de propósito, porque a retrospectiva a cobre) — e semanas
   *      também faltam por cutoff de ativação, por falha, ou por o usuário não
   *      ser Pro na época;
   *   2. percentual não agrega por média. As semanas do bloco têm tamanhos bem
   *      diferentes (o deload corta 25% do volume), e a média das razões não é
   *      a razão das somas.
   *
   * Calcular dos treinos custa o mesmo array que o chamador já carregou.
   */
  async buildMesoMetrics(params: {
    userId: string;
    planId: string;
    blockIndex: number;
    blockWeeks: number[];
    blockStart: string;
    blockEnd: string;
    phase: WeekPhase;
    windows: PlanWeekWindow[];
    workouts: MesoWorkoutRow[];
    planFrequency: number | null;
  }): Promise<MesoMetrics> {
    const {
      userId,
      planId,
      blockIndex,
      blockWeeks,
      blockStart,
      blockEnd,
      phase,
      workouts,
      planFrequency,
    } = params;

    const inBlock = workouts.filter(
      (w) => w.week_number != null && blockWeeks.includes(w.week_number),
    );
    const completed = inBlock.filter((w) => w.status === 'completed');

    // ── Aderência ao plano ──
    const plannedWorkouts = inBlock.length;
    const completedWorkouts = completed.length;

    const plannedDistanceKm = sum(inBlock, (w) => num(w.distance_km));
    const completedDistanceKm = sum(completed, (w) =>
      num(w.distance_run ?? w.distance_km),
    );
    // Denominador do executionRatio: o prescrito SÓ dos concluídos. É o que
    // separa "não apareceu" de "apareceu e não cumpriu".
    const prescribedOfCompletedKm = sum(completed, (w) => num(w.distance_km));

    const completedSeconds = sum(completed, (w) => num(w.time_run_seconds));
    const avgPaceSeconds =
      completedDistanceKm > 0 && completedSeconds > 0
        ? Math.round(completedSeconds / completedDistanceKm)
        : 0;

    // ── Total corrido na janela (inclui livre) ──
    const activities = await this.fetchActivitiesInWindow(
      userId,
      blockStart,
      blockEnd,
    );
    const totalDistanceKm = sum(activities, (a) => (a.distance || 0) / 1000);
    // Piso em 0: `activities` pode não cobrir um treino manual sem GPS, e um
    // "livre" negativo confundiria mais do que informaria.
    const freeRunDistanceKm = Math.max(
      0,
      totalDistanceKm - completedDistanceKm,
    );

    // ── O ARCO: uma entrada por semana do bloco ──
    const volumeTrend: VolumeTrendPoint[] = blockWeeks.map((weekNumber) => {
      const ofWeek = inBlock.filter((w) => w.week_number === weekNumber);
      const doneOfWeek = ofWeek.filter((w) => w.status === 'completed');
      return {
        weekNumber,
        plannedKm: round1(sum(ofWeek, (w) => num(w.distance_km))),
        completedKm: round1(
          sum(doneOfWeek, (w) => num(w.distance_run ?? w.distance_km)),
        ),
      };
    });

    // ── Zonas e intensidade (helpers compartilhados com o semanal) ──
    const zoneDistribution = buildZoneDistribution(inBlock, completed);
    const { buckets: intensityAdherence } = buildIntensityAdherence(completed);

    // ── Execução de qualidade: o pace REAL dos tiros do bloco ──
    // Best-effort: sem isso o insight ainda existe, só fica sem o número que
    // sustenta a conversa quando o VDOT não se moveu.
    let qualityEfforts: MeasuredQualityEffort[] = [];
    try {
      qualityEfforts = await this.vdotService.describeQualityEfforts(
        planId,
        blockStart,
        blockEnd,
      );
    } catch (error) {
      this.logger.warn(
        `[MesoInsight] Medição dos tiros falhou p/ plano ${planId}: ${String(error)}`,
      );
    }

    const vdotHighlight = await this.loadVdotHighlight(planId, blockWeeks);

    // ── Frequência: DIAS DISTINTOS, não contagem de treinos ──
    const frequencyActualDays = new Set(
      completed.map((w) => w.scheduled_date).filter(Boolean),
    ).size;
    // A janela tem MESO_BLOCK_WEEKS semanas — o mesmo helper que o semanal
    // chama com 1 e a retrospectiva com `window.weeks`.
    const frequencyTargetDays = resolveTargetFrequency(
      planFrequency,
      plannedWorkouts,
      MESO_BLOCK_WEEKS,
    );

    return {
      blockIndex,
      weekStart: blockWeeks[0],
      weekEnd: blockWeeks[blockWeeks.length - 1],
      blockStart,
      blockEnd,
      dominantPhase: phase,
      phaseLabel: PHASE_LABELS[phase],

      plannedWorkouts,
      completedWorkouts,
      completionRate: pct(completedWorkouts, plannedWorkouts),
      plannedDistanceKm: round1(plannedDistanceKm),
      completedDistanceKm: round1(completedDistanceKm),
      distanceVsGoalPercent: pct(completedDistanceKm, plannedDistanceKm),
      executionRatioPercent: pct(completedDistanceKm, prescribedOfCompletedKm),
      avgPaceSeconds,
      expectedPaceSeconds: avgExpectedPaceSeconds(completed),

      frequencyActualDays,
      frequencyTargetDays,

      totalDistanceKm: round1(totalDistanceKm),
      totalRunsInPeriod: activities.length,
      freeRunDistanceKm: round1(freeRunDistanceKm),

      volumeTrend,
      zoneDistribution,
      intensityAdherence,
      qualityEfforts,
      vdotHighlight,
    };
  }

  private async fetchActivitiesInWindow(
    userId: string,
    startStr: string,
    endStr: string,
  ): Promise<ActivityRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('activities')
      .select('start_date, distance')
      .eq('user_id', userId)
      .gte('start_date', `${startStr}T00:00:00-03:00`)
      .lte('start_date', `${endStr}T23:59:59-03:00`);

    if (error) {
      this.logger.warn(
        `[MesoInsight] fetchActivities falhou: ${error.message}`,
      );
      return [];
    }

    // Bounds em UTC sangram um dia nas bordas; o filtro pelo dia LOCAL corrige.
    // Mesmo padrão de `StatsService` e do insight semanal.
    return ((data || []) as ActivityRow[]).filter((a) => {
      const day = toSaoPauloDateStr(a.start_date);
      return day >= startStr && day <= endStr;
    });
  }

  /**
   * Movimento de VDOT dentro do bloco — `null` quando não houve.
   *
   * `source='reestimate'` exclui a linha de semeadura, que tem
   * `week_number NULL` e não pertence a bloco nenhum.
   */
  private async loadVdotHighlight(
    planId: string,
    blockWeeks: number[],
  ): Promise<MesoVdotHighlight | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('plan_vdot_history')
      .select('vdot_before, vdot_after, week_number, reason, sample_size')
      .eq('plan_id', planId)
      .eq('source', 'reestimate')
      .in('week_number', blockWeeks)
      .order('created_at', { ascending: false })
      .limit(1);

    const row = ((data ?? []) as VdotHistoryRow[])[0];
    if (!row) return null;

    const before = Number(row.vdot_before);
    const after = Number(row.vdot_after);
    if (!Number.isFinite(before) || !Number.isFinite(after)) return null;

    return {
      vdotBefore: before,
      vdotAfter: after,
      direction: after >= before ? 'up' : 'down',
      weekNumber: row.week_number,
      reason: row.reason,
      sampleSize: row.sample_size,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Narrativa
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * A voz do coach na altitude de BLOCO — o arco das 4 semanas, não a foto de
   * uma. Recebe tudo medido e só narra.
   *
   * As três regras que a Fase 3 custou a aprender estão todas aqui:
   * só citar número medido, declarar a ausência em voz alta, e nunca inventar
   * causa.
   */
  private async generateNarrative(
    userId: string,
    m: MesoMetrics,
  ): Promise<string> {
    if (!this.aiRouter.isAvailable) return this.fallbackNarrative(m);

    const systemPrompt = `Você é um treinador de corrida da RunEasy comentando um BLOCO DE 4 SEMANAS de treino.

REGRAS INVIOLÁVEIS:
- Os números abaixo JÁ ESTÃO MEDIDOS. Você NÃO recalcula e NÃO inventa nenhum outro.
- Esta é a visão de BLOCO, não de uma semana: fale do ARCO (como o volume evoluiu ao longo das 4 semanas, o que se manteve, o que oscilou).
- 2 a 4 frases, segunda pessoa, português do Brasil, tom direto e sem bajulação.
- Cite pelo menos dois números reais que recebeu.
- NÃO existe recomendação nem ajuste nesta mensagem. NÃO sugira mudar o plano, adiar semana, aliviar ritmo ou trocar treino — outra parte do app cuida disso.
- É PROIBIDO ligar dois números por causa e efeito sem que a mensagem diga que eles se ligam. Em especial: volume, frequência e regularidade NÃO alteram o nível estimado — quem altera é o ritmo dos tiros. Nunca escreva que treinar mais (ou ser constante) fez o nível subir.
- Ao falar de RITMO DE TIRO ou de ALVO DE ZONA, use SÓ o bloco TIROS DO BLOCO.
- "Extra", "a mais" e "além do plano" só valem para o que estiver rotulado como FORA DO PLANO.
- Responda APENAS com JSON válido: {"narrative": "..."}`;

    const arco = m.volumeTrend
      .map(
        (p) =>
          `semana ${p.weekNumber}: ${p.completedKm} km corridos de ${p.plannedKm} km prescritos`,
      )
      .join('\n  ');

    const userPrompt = `BLOCO ${m.blockIndex} DO PLANO — semanas ${m.weekStart} a ${m.weekEnd} (${m.blockStart} a ${m.blockEnd})
Fase predominante do bloco: ${m.phaseLabel}

ARCO DO VOLUME, semana a semana:
  ${arco}
- Um vale no meio do bloco costuma ser semana de recuperação PLANEJADA, não falha.

ADERÊNCIA NO BLOCO INTEIRO:
- Treinos: ${m.completedWorkouts} de ${m.plannedWorkouts} concluídos (${m.completionRate}%)
- Distância do plano: ${m.completedDistanceKm} km de ${m.plannedDistanceKm} km prescritos
- Nos treinos que fez, cumpriu ${m.executionRatioPercent}% da distância prescrita
- Dias treinados: ${m.frequencyActualDays} (meta: ${m.frequencyTargetDays}/semana × 4 semanas)

TOTAL CORRIDO NO PERÍODO: ${m.totalDistanceKm} km em ${m.totalRunsInPeriod} corrida(s)
- deste total, ${m.freeRunDistanceKm} km foram FORA do plano
- o total JÁ INCLUI os ${m.completedDistanceKm} km do plano; NUNCA o descreva como "a mais" ou "extra"

${qualityBlock(m.qualityEfforts)}
${vdotBlock(m.vdotHighlight)}
Escreva a narrativa contando como foi este bloco de 4 semanas.`;

    try {
      const result = await this.aiRouter.call<{ narrative: string }>({
        featureName: AI_FEATURES.WEEKLY_INSIGHT,
        userId,
        systemPrompt: [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: userPrompt,
        maxTokens: 600,
      });

      const narrative = result.data?.narrative;
      if (typeof narrative === 'string' && narrative.trim().length > 0) {
        return narrative.trim();
      }
      this.logger.warn('[MesoInsight] IA devolveu narrativa vazia');
    } catch (err) {
      this.logger.error('[MesoInsight] Narrativa via IA falhou:', err);
    }

    return this.fallbackNarrative(m);
  }

  /** Texto determinístico — mesmos números, sem rede. */
  private fallbackNarrative(m: MesoMetrics): string {
    const parts: string[] = [
      `No bloco ${m.blockIndex} (semanas ${m.weekStart} a ${m.weekEnd}, fase de ${m.phaseLabel}) ` +
        `você concluiu ${m.completedWorkouts} de ${m.plannedWorkouts} treinos, somando ` +
        `${m.completedDistanceKm} km do plano.`,
    ];

    const first = m.volumeTrend[0];
    const last = m.volumeTrend[m.volumeTrend.length - 1];
    if (first && last) {
      parts.push(
        `O volume executado saiu de ${first.completedKm} km na semana ${first.weekNumber} ` +
          `para ${last.completedKm} km na semana ${last.weekNumber}.`,
      );
    }

    if (m.qualityEfforts.length > 0) {
      const dentro = m.qualityEfforts.filter(
        (e) => e.deltaSeconds === 0,
      ).length;
      parts.push(
        `Foram ${m.qualityEfforts.length} treino(s) de qualidade medidos, ` +
          `${dentro} deles dentro do ritmo alvo.`,
      );
    }

    if (m.vdotHighlight) {
      parts.push(
        m.vdotHighlight.direction === 'up'
          ? 'Neste bloco seu nível estimado subiu, e os ritmos dos treinos seguintes acompanharam.'
          : 'Neste bloco seu nível estimado baixou, e os ritmos dos treinos seguintes ficaram mais leves.',
      );
    }

    return parts.join(' ');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Notificação
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * ESTE SERVICE É O DONO DA NOTIFICAÇÃO — o cron não envia nada.
   *
   * Mesmo motivo da Fase 1A/2A: o endpoint manual chama a geração direto, sem
   * passar pelo cron. Se o dono fosse o cron, geração manual não notificaria; e
   * se ambos enviassem, cada insight geraria dois pushes.
   */
  private async sendNotification(
    userId: string,
    insightId: string,
    planId: string,
    blockIndex: number,
    phaseLabel: string,
  ): Promise<void> {
    const TITLE = `Bloco ${blockIndex} fechado 🧭`;
    const BODY = `Quatro semanas de ${phaseLabel} resumidas: veja como foi o arco.`;

    try {
      const created = await this.notificationService.createNotification(
        userId,
        'weekly_insight',
        TITLE,
        BODY,
        { mesoInsightId: insightId, planId, blockIndex, screen: 'Home' },
      );
      if (!created) {
        this.logger.warn('[MesoInsight] createNotification devolveu null');
      }

      await this.notificationService.sendPushNotification(
        userId,
        TITLE,
        BODY,
        {
          type: 'meso_insight',
          screen: 'Home',
          mesoInsightId: insightId,
          blockIndex,
        },
        { channelId: 'reminders' },
      );
    } catch (err) {
      // Falha de notificação nunca derruba a geração — o insight já está gravado.
      this.logger.error('[MesoInsight] Erro notificando:', err);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Gatilho manual
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Gera o insight do último bloco FECHADO e elegível do plano ativo.
   *
   * Existe para validação em staging e para recuperar de uma falha do cron.
   * Aplica exatamente as mesmas regras dele — último bloco suprimido, bloco
   * inteiro fechado, dedupe por linha.
   */
  async generateLatestClosedBlock(userId: string): Promise<{
    generated: boolean;
    blockIndex: number | null;
    insightId: string | null;
    reason?: string;
  }> {
    const supabase = this.supabaseService.getClient();
    const today = toSaoPauloDateStr(new Date().toISOString());

    const { data: planRow } = await supabase
      .from('training_plans')
      .select('id, frequency_per_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    const plan = planRow as {
      id: string;
      frequency_per_week: number | null;
    } | null;
    if (!plan) {
      return {
        generated: false,
        blockIndex: null,
        insightId: null,
        reason: 'no_active_plan',
      };
    }

    const { data: workoutRows } = await supabase
      .from('workouts')
      .select(
        'week_number, scheduled_date, status, distance_km, distance_run, time_run_seconds, pace_seconds_per_km, instructions_json, metadata',
      )
      .eq('plan_id', plan.id);

    const workouts = (workoutRows ?? []) as MesoWorkoutRow[];
    const weeks = derivePlanWeeks(workouts).filter(
      (w) => w.source === 'workouts',
    );
    if (weeks.length === 0) {
      return {
        generated: false,
        blockIndex: null,
        insightId: null,
        reason: 'no_workouts',
      };
    }

    const lastWeekNumber = weeks[weeks.length - 1].weekNumber;

    // O último bloco ELEGÍVEL: fecha um bloco, não é o último do plano, e todas
    // as suas semanas já terminaram.
    const closed = weeks
      .filter((w) => blockClosedByWeek(w.weekNumber, lastWeekNumber) != null)
      .filter((w) => isPlanFinished(w, today))
      .pop();

    if (!closed) {
      return {
        generated: false,
        blockIndex: null,
        insightId: null,
        reason: 'no_closed_block',
      };
    }

    const blockIndex = blockClosedByWeek(closed.weekNumber, lastWeekNumber)!;
    const insight = await this.generateForBlock({
      userId,
      planId: plan.id,
      blockIndex,
      weeks,
      workouts,
      planFrequency: plan.frequency_per_week,
    });

    return {
      generated: insight != null,
      blockIndex,
      insightId: insight?.id ?? null,
      reason: insight ? undefined : 'already_exists_or_failed',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Leitura
  // ──────────────────────────────────────────────────────────────────────────

  /** O bloco concluído mais recente do usuário. */
  async getLatest(userId: string): Promise<MesoInsightRow | null> {
    const { data } = await this.supabaseService
      .getClient()
      .from('plan_meso_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('block_end', { ascending: false })
      .limit(1);

    return ((data ?? []) as MesoInsightRow[])[0] ?? null;
  }

  /** Carimba `seen_at`. Idempotente: `.is('seen_at', null)` não casa duas vezes. */
  async markSeen(userId: string, insightId: string): Promise<boolean> {
    const { data } = await this.supabaseService
      .getClient()
      .from('plan_meso_insights')
      .update({ seen_at: new Date().toISOString() })
      .eq('id', insightId)
      .eq('user_id', userId)
      .is('seen_at', null)
      .select('id');

    return (data ?? []).length > 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos do prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ritmo REAL dos tiros do bloco — o único número que descreve uma zona.
 *
 * Quando não há nenhum, o bloco DIZ ISSO. Calado, o modelo vai buscar um
 * substituto no pace médio dos treinos e apresentá-lo como alvo de zona: foi
 * exatamente o defeito que a Fase 3 corrigiu no insight semanal.
 */
function qualityBlock(efforts: MeasuredQualityEffort[]): string {
  if (efforts.length === 0) {
    return `TIROS DO BLOCO: nenhum treino de qualidade medido por GPS nestas 4 semanas.
- Isso é normal em fase de base, onde o trabalho é volume aeróbico. Não existe ritmo de tiro nem alvo de zona para citar, e nenhum outro número serve no lugar.
`;
  }

  const linhas = efforts
    .map((e) => {
      const veredito =
        e.deltaSeconds === 0
          ? 'dentro do alvo'
          : e.deltaSeconds < 0
            ? `${Math.abs(e.deltaSeconds)}s/km MAIS RÁPIDO que o alvo`
            : `${e.deltaSeconds}s/km mais lento que o alvo`;
      return `${e.dateStr}, zona ${e.zones.join('/')}: alvo ${fmtBand(e.prescribedPaceMin, e.prescribedPaceMax)}, você fez ${fmtPace(e.paceSecPerKm)} (${veredito})`;
    })
    .join('\n  ');

  return `TIROS DO BLOCO (só o bloco de qualidade, reconstruído do GPS — SEM aquecimento e SEM volta à calma):
  ${linhas}
- ESTE é o ritmo dos tiros e ESTE é o alvo da zona. É o único lugar da mensagem de onde tirar qualquer um dos dois.
`;
}

/**
 * O VDOT é DESTAQUE OCASIONAL, não o eixo.
 *
 * "Não mudou" é o caso comum — a cadência real permite ~1 movimento por plano,
 * e ele cai no bloco final, que é suprimido. Por isso a ausência tem texto
 * próprio, afirmando que é normal: sem isso o modelo trata o silêncio como
 * lacuna e fabrica uma evolução que ninguém mediu.
 */
function vdotBlock(v: MesoVdotHighlight | null): string {
  if (!v) {
    return `NÍVEL ESTIMADO: não mudou neste bloco.
- Isso é o NORMAL e não é um problema: o nível só se move com vários treinos de qualidade consistentemente fora do alvo, o que leva mais de um bloco. NÃO diga que o atleta evoluiu de nível, e NÃO trate isso como estagnação ou como algo que faltou.
`;
  }

  const verbo = v.direction === 'up' ? 'subiu' : 'baixou';
  const efeito =
    v.direction === 'up'
      ? 'os ritmos dos treinos seguintes ficaram um pouco mais rápidos'
      : 'os ritmos dos treinos seguintes ficaram um pouco mais leves';

  return `NÍVEL ESTIMADO: ${verbo} dentro deste bloco${v.weekNumber ? `, no fecho da semana ${v.weekNumber}` : ''}.
- A CAUSA foi o desempenho nos treinos de QUALIDADE${v.reason ? ` (${v.reason})` : ''}, e nada mais. Volume, frequência e regularidade NÃO entram nessa conta.
- Consequência já aplicada: ${efeito}.
- NÃO cite "VDOT" nem números de nível — fale de evolução de ritmo, em linguagem de corredor.
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
}

/** Percentual inteiro, com guarda de divisão por zero. */
function pct(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function fmtMinSec(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  return `${fmtMinSec(seconds)}/km`;
}

function fmtBand(min: number, max: number): string {
  return `${fmtMinSec(min)}–${fmtMinSec(max)}/km`;
}
