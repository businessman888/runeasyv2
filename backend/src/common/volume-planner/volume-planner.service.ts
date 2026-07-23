import { Injectable, Logger } from '@nestjs/common';
import {
  CapacityInput,
  EffectiveCapacity,
  ViabilityResult,
  WeekPhase,
  WeekSkeleton,
  WorkoutSlot,
  WalkRunWeek,
  WalkRunInterval,
} from './volume-planner.types';
import {
  WEEKLY_KM_MIDPOINTS,
  FREQUENCY_IMPLIED_KM,
  LEVEL_FALLBACK_WEEKLY_KM,
  MIN_WEEKLY_KM,
  WEEKLY_INCREASE_CAP_PCT,
  DELOAD_EVERY_N_WEEKS,
  DELOAD_PCT,
  TAPER_FACTORS,
  LONG_RUN_SHARE_MAX,
  LONG_RUN_SHARE_BY_GOAL,
  MAX_VOLUME_GROWTH_FACTOR,
  LONG_RUN_TABLE,
  MIN_WARMUP_KM,
  MIN_COOLDOWN_KM,
  WALKRUN_START,
  WALKRUN_DEFAULT_KEY,
  WALKRUN_PROGRESSION,
} from './volume-planner.constants';

/** Fases de periodização (nº de semanas por fase). Espelha calculateRacePhases. */
export interface Phases {
  base: number;
  build: number;
  peak: number;
  taper: number;
}

export interface SkeletonInput {
  capacity: EffectiveCapacity;
  goalKm: number;
  totalWeeks: number;
  daysPerWeek: number;
  phases: Phases;
}

export interface WalkRunInput {
  walkCapacity?: string | null;
  totalWeeks: number;
  daysPerWeek: number;
  phases: Phases;
}

/**
 * Motor determinístico de volume e progressão (Fase B). TODOS os métodos são
 * PUROS (sem I/O) — em especial `assessViability`, que a Fase C chama no
 * onboarding ANTES de gerar qualquer plano.
 *
 * Número é cálculo (aqui). Forma é escolha da IA (no prompt).
 */
@Injectable()
export class VolumePlannerService {
  private readonly logger = new Logger(VolumePlannerService.name);

  // ── Escopo 1 — capacidade efetiva ──────────────────────────────────────────

  /**
   * Deriva o ponto de partida do plano a partir dos sinais do onboarding.
   * Âncora = volume semanal atual; frequência recente é um TETO conservador
   * (na contradição, prevalece o menor). recent_distance é o teto do longão.
   * Sem os campos da Fase A, cai para uma estimativa por nível (retrocompat).
   */
  deriveEffectiveCapacity(input: CapacityInput): EffectiveCapacity {
    const neverRan = input.recentDistanceKm === 0;

    const kmAnchor =
      input.currentWeeklyKm && WEEKLY_KM_MIDPOINTS[input.currentWeeklyKm] != null
        ? WEEKLY_KM_MIDPOINTS[input.currentWeeklyKm]
        : null;

    const freqCap =
      input.recentFrequency && FREQUENCY_IMPLIED_KM[input.recentFrequency] != null
        ? FREQUENCY_IMPLIED_KM[input.recentFrequency]
        : null;

    let weeklyKm: number;
    if (kmAnchor != null && freqCap != null) {
      // Contradição (ex.: never + gt30) → prevalece o mais conservador.
      weeklyKm = Math.min(kmAnchor, freqCap);
    } else if (kmAnchor != null) {
      weeklyKm = kmAnchor;
    } else if (freqCap != null) {
      weeklyKm = freqCap;
    } else {
      // Retrocompat: sem campos da Fase A.
      weeklyKm =
        (input.level && LEVEL_FALLBACK_WEEKLY_KM[input.level]) ??
        LEVEL_FALLBACK_WEEKLY_KM.beginner;
    }

    weeklyKm = Math.max(weeklyKm, MIN_WEEKLY_KM);

    // Teto do longão inicial: o que a pessoa já demonstrou (recent_distance),
    // limitado ainda pela fração do volume semanal inicial.
    const shareCap = weeklyKm * LONG_RUN_SHARE_MAX;
    const demonstrated =
      input.recentDistanceKm && input.recentDistanceKm > 0
        ? input.recentDistanceKm
        : shareCap;
    const longRunCapKm = Math.max(
      MIN_WARMUP_KM + MIN_COOLDOWN_KM,
      Math.min(demonstrated, Math.max(shareCap, demonstrated)),
    );

    return {
      weeklyKm: this.round(weeklyKm),
      longRunCapKm: this.round(longRunCapKm),
      neverRan,
    };
  }

  // ── Escopo 3 — longão de pico atado à meta (tabela + interpolação) ──────────

  /** Faixa do longão de pico para a distância-meta (km). */
  peakLongRunForGoal(goalKm: number): { min: number; max: number } {
    const t = LONG_RUN_TABLE;
    if (goalKm <= t[0].goalKm) return { min: t[0].min, max: t[0].max };
    if (goalKm >= t[t.length - 1].goalKm) {
      const last = t[t.length - 1];
      return { min: last.min, max: last.max };
    }
    for (let i = 0; i < t.length - 1; i++) {
      const lo = t[i];
      const hi = t[i + 1];
      if (goalKm >= lo.goalKm && goalKm <= hi.goalKm) {
        const f = (goalKm - lo.goalKm) / (hi.goalKm - lo.goalKm);
        return {
          min: this.round(lo.min + (hi.min - lo.min) * f),
          max: this.round(lo.max + (hi.max - lo.max) * f),
        };
      }
    }
    const last = t[t.length - 1];
    return { min: last.min, max: last.max };
  }

  /** Alvo único (ponto médio da faixa) do longão de pico. */
  private peakLongTarget(goalKm: number): number {
    const { min, max } = this.peakLongRunForGoal(goalKm);
    return this.round((min + max) / 2);
  }

  /**
   * Fração máxima do longão sobre o volume semanal, VARIÁVEL por distância da
   * meta (interpola na LONG_RUN_SHARE_BY_GOAL). Maratona usa fatia maior (45%)
   * porque longões de maratona são proporção maior do volume em corredores de
   * volume moderado; provas curtas usam ~35%.
   */
  private longRunShareForGoal(goalKm: number): number {
    const t = LONG_RUN_SHARE_BY_GOAL;
    if (goalKm <= t[0].goalKm) return t[0].share;
    if (goalKm >= t[t.length - 1].goalKm) return t[t.length - 1].share;
    for (let i = 0; i < t.length - 1; i++) {
      if (goalKm >= t[i].goalKm && goalKm <= t[i + 1].goalKm) {
        const f = (goalKm - t[i].goalKm) / (t[i + 1].goalKm - t[i].goalKm);
        return t[i].share + (t[i + 1].share - t[i].share) * f;
      }
    }
    return t[t.length - 1].share;
  }

  // ── Escopo 8 — viabilidade (PURA, chamável sem gerar plano) ─────────────────

  /**
   * A meta é atingível no prazo? Compara o volume semanal de pico necessário
   * (para acomodar o longão de pico dentro do share) com o que a rampa segura
   * (≤ teto/semana) alcança nas semanas de construção disponíveis.
   */
  assessViability(input: {
    capacity: EffectiveCapacity;
    goalKm: number;
    totalWeeks: number;
    phases?: Phases;
  }): ViabilityResult {
    const { capacity, goalKm, totalWeeks } = input;
    const phases = input.phases ?? this.calculatePhases(totalWeeks, goalKm);

    const peakLong = this.peakLongTarget(goalKm);
    const share = this.longRunShareForGoal(goalKm);
    // Volume de pico necessário p/ o longão caber no share máximo (por meta).
    const peakWeeklyNeeded = peakLong / share;
    const v1 = capacity.weeklyKm;

    // Semanas efetivas de rampa (base+build; deloads não somam progresso).
    const rampWeeks = Math.max(phases.base + phases.build - 1, 1);
    const cap = WEEKLY_INCREASE_CAP_PCT;

    // Rampa geométrica exigida p/ ir de v1 → peakWeeklyNeeded em rampWeeks.
    const ratio = peakWeeklyNeeded / v1;
    const requiredWeeklyIncreasePct =
      ratio <= 1 ? 0 : Math.pow(ratio, 1 / rampWeeks) - 1;

    // Viável exige DUAS coisas: (a) a rampa cabe no teto/semana E (b) o volume de
    // pico necessário não ultrapassa a barreira absoluta de crescimento (2.5×).
    // Sem (b), a maratona de quem sai de 30 km/sem seria marcada "viável" mesmo o
    // longão travando em 26 km (barreira) sem nunca chegar aos 31 km da tabela.
    const withinRamp = requiredWeeklyIncreasePct <= cap + 1e-9;
    const withinAbsolute =
      peakWeeklyNeeded <= v1 * MAX_VOLUME_GROWTH_FACTOR + 1e-9;
    const feasible = withinRamp && withinAbsolute;

    // Semanas mínimas: rampWeeks p/ chegar em peakWeeklyNeeded ao teto seguro,
    // + peak + taper.
    const rampWeeksNeeded =
      ratio <= 1 ? 1 : Math.ceil(Math.log(ratio) / Math.log(1 + cap));
    const minWeeksRecommended =
      rampWeeksNeeded + phases.peak + phases.taper + this.deloadCount(rampWeeksNeeded);

    // Maior meta atingível no prazo: qual peakLong a rampa segura alcança
    // (limitada pela barreira absoluta de crescimento), e qual meta corresponde
    // a esse peakLong (inverso da tabela).
    const reachablePeakWeekly = Math.min(
      v1 * Math.pow(1 + cap, rampWeeks),
      v1 * MAX_VOLUME_GROWTH_FACTOR,
    );
    const reachablePeakLong = reachablePeakWeekly * share;
    const maxGoalKmInWindow = this.goalForPeakLong(reachablePeakLong);

    return {
      feasible,
      requiredWeeklyIncreasePct: this.round(requiredWeeklyIncreasePct * 100) / 100,
      minWeeksRecommended,
      maxGoalKmInWindow: this.round(maxGoalKmInWindow),
      peakLongRunKm: peakLong,
    };
  }

  // ── Escopo 2/3/4 — esqueleto de volume (corrida) ────────────────────────────

  /**
   * Constrói a curva de volume/longão de todo o plano e distribui por treino.
   * Volume total nunca sobe mais que o teto/semana (segurança > atingir a meta);
   * deload garantido; taper nas semanas finais; longão visa o pico da tabela mas
   * é limitado pelo share do volume (por isso um iniciante de baixo volume NÃO
   * chega ao longão da meta em poucas semanas — isso é a viabilidade, não um bug).
   */
  buildVolumeSkeleton(input: SkeletonInput): WeekSkeleton[] {
    const { capacity, goalKm, totalWeeks, daysPerWeek, phases } = input;
    const phaseByWeek = this.phaseByWeek(totalWeeks, phases);
    const lastPeakWeek = phases.base + phases.build + phases.peak; // 1-based

    const peakLong = this.peakLongTarget(goalKm);
    const share = this.longRunShareForGoal(goalKm);

    // TETO DE VOLUME DE PICO — duas barreiras independentes, a menor vence:
    //  (1) atado ao longão: pico ≤ peakLong / share. Impede o volume de crescer
    //      descolado do longão (o que inchava os treinos de meio de semana ACIMA
    //      do longão — estrutura invertida).
    //  (2) absoluta: pico ≤ MAX_VOLUME_GROWTH_FACTOR × capacidade inicial.
    const peakWeeklyCeil = Math.min(
      peakLong / share,
      capacity.weeklyKm * MAX_VOLUME_GROWTH_FACTOR,
    );

    // 1) Curva de volume semanal (segura). A LINHA DE TENDÊNCIA (`trend`) sobe
    //    monotonicamente pelas semanas de rampa (limitada por peakWeeklyCeil); o
    //    deload é um VALE temporário (trend×0.75) que NÃO reduz a tendência —
    //    senão 1.10³×0.75≈1.0 zeraria o ganho do ciclo e o volume serrilharia no
    //    lugar (o atleta nunca evolui).
    const totals: number[] = [];
    const deload: boolean[] = [];
    let trend = Math.min(capacity.weeklyKm, peakWeeklyCeil);
    for (let w = 1; w <= totalWeeks; w++) {
      const phase = phaseByWeek[w - 1];
      if (w === 1) {
        totals.push(this.round(trend));
        deload.push(false);
        continue;
      }
      if (phase === 'taper') {
        // Taper progressivo sobre o pico de volume alcançado.
        const peakVol = Math.max(...totals);
        const taperIdx = w - (totalWeeks - phases.taper); // 1..taper
        const factors = this.taperFactors(phases.taper);
        totals.push(this.round(peakVol * factors[taperIdx - 1]));
        deload.push(false);
        continue;
      }
      const isDeload = w % DELOAD_EVERY_N_WEEKS === 0 && phase !== 'peak';
      if (isDeload) {
        // Vale: recua a partir da tendência, sem alterar a tendência.
        totals.push(this.round(trend * (1 - DELOAD_PCT)));
        deload.push(true);
      } else if (phase === 'peak') {
        // Pico: mantém a tendência (o volume mais alto do plano).
        totals.push(this.round(trend));
        deload.push(false);
      } else {
        // Rampa: a tendência sobe (teto seguro por semana), limitada pelo teto.
        trend = Math.min(trend * (1 + WEEKLY_INCREASE_CAP_PCT), peakWeeklyCeil);
        totals.push(this.round(trend));
        deload.push(false);
      }
    }

    // 2) Curva do longão: rampa L[1] → peakLong até a última semana de pico,
    //    sempre limitada pelo share do volume da semana (auto-capa baixo volume).
    const longStart = Math.min(capacity.longRunCapKm, peakLong);
    const skeleton: WeekSkeleton[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      const phase = phaseByWeek[w - 1];
      const total = totals[w - 1];
      const shareCap = total * share;

      let longTarget: number;
      if (phase === 'taper') {
        longTarget = Math.min(peakLong, shareCap) * 0.6; // encurta no taper
      } else {
        const f = Math.min((w - 1) / Math.max(lastPeakWeek - 1, 1), 1);
        longTarget = longStart + (peakLong - longStart) * f;
      }
      let longRunKm = Math.min(longTarget, shareCap);
      if (deload[w - 1]) longRunKm *= 0.8; // longão também recua no deload
      longRunKm = this.round(Math.max(longRunKm, MIN_WARMUP_KM + MIN_COOLDOWN_KM));

      const workouts = this.distributeWeek(
        total,
        longRunKm,
        daysPerWeek,
        phase,
      );

      skeleton.push({
        weekNumber: w,
        phase,
        isDeload: deload[w - 1],
        isPeak: phase === 'peak',
        isTaper: phase === 'taper',
        totalKm: this.round(workouts.reduce((s, x) => s + x.distanceKm, 0)),
        longRunKm,
        workouts,
      });
    }

    return skeleton;
  }

  /**
   * Distribui o volume da semana entre os slots (longão + qualidade + easy).
   * Invariante: nenhum treino não-longo excede o longão (o longão é o mais
   * longo). O ÚLTIMO easy absorve o resto para a soma bater EXATAMENTE o total —
   * elimina o drift de arredondamento que fazia o incremento semanal passar de
   * 10% (semana arredonda p/ baixo, seguinte p/ cima).
   */
  private distributeWeek(
    totalKm: number,
    longRunKm: number,
    daysPerWeek: number,
    phase: WeekPhase,
  ): WorkoutSlot[] {
    const days = Math.max(1, daysPerWeek);
    const longSlot = days - 1; // último dia = longão (default)
    const hasQuality = days >= 3 && (phase === 'build' || phase === 'peak');
    const qualitySlot = hasQuality ? 1 : -1;
    const floor = MIN_WARMUP_KM + MIN_COOLDOWN_KM;

    const otherSlots = days - 1;
    const remaining = Math.max(totalKm - longRunKm, 0);
    const perOther = otherSlots > 0 ? remaining / otherSlots : 0;

    // Distribui os não-longos; o último absorve o resíduo para somar exato.
    const others: number[] = [];
    let assigned = 0;
    for (let k = 0; k < otherSlots; k++) {
      const isLast = k === otherSlots - 1;
      let dist = isLast ? remaining - assigned : perOther;
      // Nunca exceder o longão nem cair abaixo do piso.
      dist = Math.min(dist, longRunKm);
      dist = Math.max(dist, floor);
      dist = this.round(dist);
      others.push(dist);
      assigned += dist;
    }

    const workouts: WorkoutSlot[] = [];
    let otherIdx = 0;
    for (let i = 0; i < days; i++) {
      if (i === longSlot) {
        workouts.push({
          slotIndex: i,
          distanceKm: this.round(longRunKm),
          isLong: true,
          isQuality: false,
        });
      } else {
        const dist = others[otherIdx++];
        const isQuality = i === qualitySlot;
        workouts.push({
          slotIndex: i,
          distanceKm: dist,
          isLong: false,
          isQuality,
          maxWorkKm: isQuality
            ? this.round(Math.max(dist - MIN_WARMUP_KM - MIN_COOLDOWN_KM, 0.4))
            : undefined,
        });
      }
    }
    return workouts;
  }

  // ── Escopo 5 — protocolo caminhada/corrida ("nunca corri") ──────────────────

  /**
   * Esqueleto por TEMPO (sem pace). walk_capacity define o ponto de partida;
   * a cada semana aumenta a corrida e reduz a caminhada até (quase) corrida
   * contínua. O backend monta 100% — a IA só decora textos.
   */
  buildWalkRunSkeleton(input: WalkRunInput): WalkRunWeek[] {
    const start =
      (input.walkCapacity && WALKRUN_START[input.walkCapacity]) ??
      WALKRUN_START[WALKRUN_DEFAULT_KEY];

    const weeks: WalkRunWeek[] = [];
    const phaseByWeek = this.phaseByWeek(input.totalWeeks, input.phases);

    for (let w = 1; w <= input.totalWeeks; w++) {
      const step = w - 1;
      const runSeconds = Math.min(
        start.runSeconds + step * WALKRUN_PROGRESSION.runDeltaSec,
        WALKRUN_PROGRESSION.maxRunSec,
      );
      const walkSeconds = Math.max(
        start.walkSeconds + step * WALKRUN_PROGRESSION.walkDeltaSec,
        WALKRUN_PROGRESSION.minWalkSec,
      );
      // Menos reps conforme os blocos de corrida ficam mais longos.
      const reps = Math.max(
        WALKRUN_PROGRESSION.minReps,
        Math.round(start.reps - step * 0.25),
      );
      const block: WalkRunInterval = { reps, runSeconds, walkSeconds };

      const workouts: WalkRunInterval[] = Array.from(
        { length: Math.max(1, input.daysPerWeek) },
        () => ({ ...block }),
      );
      weeks.push({ weekNumber: w, phase: phaseByWeek[w - 1], workouts });
    }
    return weeks;
  }

  // ── Periodização ────────────────────────────────────────────────────────────

  /**
   * Divide o plano em base/build/peak/taper (nº de semanas). Espelha a lógica
   * de TrainingAIService.calculateRacePhases para consistência entre os caminhos.
   */
  calculatePhases(totalWeeks: number, goalKm: number): Phases {
    const taper = goalKm >= 42 ? 3 : goalKm >= 21 ? 2 : 1;
    const peak = goalKm >= 21 ? 3 : 2;
    const remaining = Math.max(totalWeeks - taper - peak, 2);
    const build = Math.max(Math.floor(remaining * 0.4), 1);
    const base = Math.max(remaining - build, 1);
    return { base, build, peak, taper };
  }

  /** Vetor phase por semana (índice 0-based). */
  private phaseByWeek(totalWeeks: number, phases: Phases): WeekPhase[] {
    const out: WeekPhase[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      if (w <= phases.base) out.push('base');
      else if (w <= phases.base + phases.build) out.push('build');
      else if (w <= phases.base + phases.build + phases.peak) out.push('peak');
      else out.push('taper');
    }
    return out;
  }

  private taperFactors(taperWeeks: number): number[] {
    if (taperWeeks <= 2) return TAPER_FACTORS.slice(-taperWeeks);
    // 3+ semanas: prepende fatores mais próximos do pico.
    const extra = Array.from({ length: taperWeeks - 2 }, () => 0.75);
    return [...extra, ...TAPER_FACTORS];
  }

  private deloadCount(weeks: number): number {
    return Math.floor(weeks / DELOAD_EVERY_N_WEEKS);
  }

  /** Inverso aproximado da tabela: dado um longão alcançável, qual meta ele cobre. */
  private goalForPeakLong(peakLong: number): number {
    const t = LONG_RUN_TABLE;
    const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;
    if (peakLong <= mid(t[0])) return t[0].goalKm;
    for (let i = 0; i < t.length - 1; i++) {
      const lo = mid(t[i]);
      const hi = mid(t[i + 1]);
      if (peakLong >= lo && peakLong <= hi) {
        const f = (peakLong - lo) / (hi - lo);
        return t[i].goalKm + (t[i + 1].goalKm - t[i].goalKm) * f;
      }
    }
    return t[t.length - 1].goalKm;
  }

  private round(v: number): number {
    return Math.round(v * 10) / 10;
  }
}
