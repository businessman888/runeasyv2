import {
  TrainingAIService,
  GeneratedPlan,
  GeneratedWorkout,
  GeneratedWorkoutType,
  TrainingPlanRequest,
} from './training-ai.service';
import { PaceCalculatorService } from '../../common/pace-calculator';
import {
  VolumePlannerService,
  WeekSkeleton,
  WEEKLY_TOTAL_TOLERANCE_KM,
} from '../../common/volume-planner';

/**
 * Pós-processamento determinístico de VOLUME + parity da viabilidade.
 *
 * `applyDeterministicVolume` é onde moraram os bugs mais caros desta trilha:
 * casar `slot[i] → workout[i]` por ÍNDICE fazia (a) a distância do longão grudar
 * num easy e (b) o slot órfão do longão SUMIR quando a IA devolvia menos treinos
 * que `days_per_week` — o sintoma de volume semanal caindo de 30 para 19,5 km.
 * O código foi corrigido para mapear por PAPEL; estes testes impedem a volta.
 */
describe('TrainingAIService — volume determinístico e parity', () => {
  const paceCalculator = new PaceCalculatorService();
  const volumePlanner = new VolumePlannerService();

  /** Acesso tipado ao método privado, sem `any`. */
  type Internals = {
    applyDeterministicVolume(plan: GeneratedPlan, skeleton: WeekSkeleton[]): void;
  };

  let service: TrainingAIService;
  let internals: Internals;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // aiRouter estoura se for tocado: este caminho é 100% determinístico.
    const aiRouter = new Proxy(
      {},
      {
        get() {
          throw new Error('applyDeterministicVolume não pode usar IA');
        },
      },
    );
    service = new TrainingAIService(
      aiRouter as never,
      paceCalculator,
      volumePlanner,
    );
    internals = service as unknown as Internals;
    warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => warnSpy.mockRestore());

  // ── Builders ──────────────────────────────────────────────────────────────

  /** Treino contínuo (um único segmento `main`). */
  const contInuo = (
    type: GeneratedWorkoutType,
    day: number,
  ): GeneratedWorkout => ({
    day_of_week: day,
    type,
    distance_km: 0, // será cravado pelo pós-processamento
    segments: [
      { type: 'main', distance_km: 1, pace_min: 300, pace_max: 360 },
    ],
    objective: 'obj',
    tips: [],
  });

  /** Intervalado: warmup + repeat (por distância) + cooldown. */
  const intervalado = (day: number, reps: number, workKm: number): GeneratedWorkout => ({
    day_of_week: day,
    type: 'intervals',
    distance_km: 0,
    segments: [
      { type: 'warmup', distance_km: 1, pace_min: 400, pace_max: 450 },
      {
        type: 'repeat',
        reps,
        work: { distance_km: workKm, pace_min: 280, pace_max: 300 },
        recovery: { duration_seconds: 120, pace_min: 500, pace_max: 560 },
      },
      { type: 'cooldown', distance_km: 1, pace_min: 400, pace_max: 450 },
    ],
    objective: 'obj',
    tips: [],
  });

  const plano = (workouts: GeneratedWorkout[]): GeneratedPlan =>
    ({
      duration_weeks: 1,
      frequency_per_week: workouts.length,
      weeks: [{ week_number: 1, phase: 'base', workouts }],
    }) as GeneratedPlan;

  /** Esqueleto real do motor, para os testes não inventarem números. */
  const esqueletoReal = (daysPerWeek: number, goalKm = 10): WeekSkeleton => {
    const capacity = volumePlanner.deriveEffectiveCapacity({
      currentWeeklyKm: '20_30',
      recentFrequency: '4x_plus',
      recentDistanceKm: 10,
      level: 'intermediate',
    });
    return volumePlanner.buildVolumeSkeleton({
      capacity,
      goalKm,
      totalWeeks: 8,
      daysPerWeek,
      phases: volumePlanner.calculatePhases(8, goalKm),
    })[0];
  };

  const somaTreinos = (p: GeneratedPlan) =>
    Math.round(
      p.weeks[0].workouts.reduce((a, w) => a + w.distance_km, 0) * 10,
    ) / 10;

  // ── O bug real: slots ≠ treinos ───────────────────────────────────────────

  describe('divergência de contagem (slots ≠ treinos)', () => {
    it('5 slots × 4 treinos: o longão NÃO fica órfão e o total bate', () => {
      const sk = esqueletoReal(5);
      expect(sk.workouts).toHaveLength(5);

      const p = plano([
        contInuo('easy_run', 1),
        contInuo('easy_run', 2),
        contInuo('easy_run', 3),
        contInuo('long_run', 4), // 4 treinos para 5 slots
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      const longao = p.weeks[0].workouts.find((w) => w.type === 'long_run')!;
      // O longão recebeu a distância do SLOT de longão — não sumiu.
      expect(longao.distance_km).toBe(sk.longRunKm);
      // E o total não caiu para (total − longão), que era o sintoma do bug.
      expect(somaTreinos(p)).toBeGreaterThan(sk.totalKm - sk.longRunKm);
      expect(Math.abs(somaTreinos(p) - sk.totalKm)).toBeLessThanOrEqual(
        WEEKLY_TOTAL_TOLERANCE_KM,
      );
    });

    it('mais treinos que slots: ninguém fica sem distância', () => {
      const sk = esqueletoReal(3);
      const p = plano([
        contInuo('easy_run', 1),
        contInuo('easy_run', 2),
        contInuo('easy_run', 3),
        contInuo('long_run', 4),
        contInuo('easy_run', 5),
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      for (const w of p.weeks[0].workouts) {
        expect(w.distance_km).toBeGreaterThan(0);
      }
    });
  });

  // ── Mapeamento por PAPEL, não por índice ──────────────────────────────────

  describe('mapeamento por papel', () => {
    it('long_run fora de ordem ainda recebe a distância do longão', () => {
      const sk = esqueletoReal(4);
      // long_run no PRIMEIRO índice; o slot de longão é o último.
      const p = plano([
        contInuo('long_run', 1),
        contInuo('easy_run', 2),
        contInuo('easy_run', 3),
        contInuo('easy_run', 4),
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      const [primeiro, ...resto] = p.weeks[0].workouts;
      expect(primeiro.type).toBe('long_run');
      expect(primeiro.distance_km).toBe(sk.longRunKm);
      // E continua sendo o maior treino da semana.
      for (const w of resto) {
        expect(w.distance_km).toBeLessThanOrEqual(primeiro.distance_km);
      }
    });

    it('sem long_run na resposta, o último treino é promovido a longão', () => {
      const sk = esqueletoReal(4);
      const p = plano([
        contInuo('easy_run', 1),
        contInuo('easy_run', 2),
        contInuo('easy_run', 3),
        contInuo('easy_run', 4), // nenhum long_run
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      const ultimo = p.weeks[0].workouts[3];
      // Promovido no TIPO (para o calendário exibir certo) e na distância.
      expect(ultimo.type).toBe('long_run');
      expect(ultimo.distance_km).toBe(sk.longRunKm);
    });

    it('o treino de qualidade recebe a distância do slot de qualidade', () => {
      // Fase build tem slot de qualidade (base não tem).
      const capacity = volumePlanner.deriveEffectiveCapacity({
        currentWeeklyKm: '20_30',
        recentFrequency: '4x_plus',
        recentDistanceKm: 10,
        level: 'intermediate',
      });
      const skeleton = volumePlanner.buildVolumeSkeleton({
        capacity,
        goalKm: 10,
        totalWeeks: 8,
        daysPerWeek: 4,
        phases: volumePlanner.calculatePhases(8, 10),
      });
      const sk = skeleton.find((w) => w.workouts.some((s) => s.isQuality))!;
      const qSlot = sk.workouts.find((s) => s.isQuality)!;

      const p = plano([
        contInuo('easy_run', 1),
        intervalado(2, 5, 1.0),
        contInuo('easy_run', 3),
        contInuo('long_run', 4),
      ]);
      p.weeks[0].week_number = sk.weekNumber;

      internals.applyDeterministicVolume(p, [sk]);

      const q = p.weeks[0].workouts.find((w) => w.type === 'intervals')!;
      expect(q.distance_km).toBeCloseTo(qSlot.distanceKm, 1);
    });
  });

  // ── Invariantes que valem para qualquer entrada ───────────────────────────

  describe('invariantes', () => {
    it('o longão é sempre o treino mais longo da semana', () => {
      for (const dias of [3, 4, 5]) {
        const sk = esqueletoReal(dias);
        const workouts = Array.from({ length: dias }, (_, i) =>
          contInuo(i === dias - 1 ? 'long_run' : 'easy_run', i + 1),
        );
        const p = plano(workouts);

        internals.applyDeterministicVolume(p, [sk]);

        const dists = p.weeks[0].workouts.map((w) => w.distance_km);
        const longao = p.weeks[0].workouts.find((w) => w.type === 'long_run')!;
        expect(longao.distance_km).toBe(Math.max(...dists));
      }
    });

    it('a soma da semana bate com o totalKm do esqueleto', () => {
      for (const dias of [3, 4, 5]) {
        const sk = esqueletoReal(dias);
        const workouts = Array.from({ length: dias }, (_, i) =>
          contInuo(i === dias - 1 ? 'long_run' : 'easy_run', i + 1),
        );
        const p = plano(workouts);

        internals.applyDeterministicVolume(p, [sk]);

        expect(Math.abs(somaTreinos(p) - sk.totalKm)).toBeLessThanOrEqual(
          WEEKLY_TOTAL_TOLERANCE_KM,
        );
      }
    });

    it('nenhum aquecimento/desaquecimento fica negativo', () => {
      const sk = esqueletoReal(4);
      const p = plano([
        contInuo('easy_run', 1),
        intervalado(2, 8, 1.0), // intervalado grande de propósito
        contInuo('easy_run', 3),
        contInuo('long_run', 4),
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      for (const w of p.weeks[0].workouts) {
        for (const s of w.segments) {
          if (s.type !== 'repeat' && s.distance_km != null) {
            expect(s.distance_km).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  // ── Volume não pode sumir em silêncio ─────────────────────────────────────

  describe('balanço final', () => {
    it('undershoot (poucos treinos) é REGISTRADO, não descartado calado', () => {
      const sk = esqueletoReal(5); // semana cheia
      // Só 2 treinos: o cap "easy ≤ longão" impede realocar todo o volume.
      const p = plano([contInuo('easy_run', 1), contInuo('long_run', 2)]);

      internals.applyDeterministicVolume(p, [sk]);

      const faltando = sk.totalKm - somaTreinos(p);
      expect(faltando).toBeGreaterThan(WEEKLY_TOTAL_TOLERANCE_KM);
      // O warn é a rede: volume-a-menos é seguro, mas nunca silencioso.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('NÃO alocados'),
      );
      // Mesmo no caso degenerado, o longão continua o maior.
      const longao = p.weeks[0].workouts.find((w) => w.type === 'long_run')!;
      expect(longao.distance_km).toBeGreaterThanOrEqual(
        p.weeks[0].workouts[0].distance_km,
      );
    });

    it('semana normal não dispara nenhum aviso de desvio', () => {
      const sk = esqueletoReal(4);
      const p = plano([
        contInuo('easy_run', 1),
        contInuo('easy_run', 2),
        contInuo('easy_run', 3),
        contInuo('long_run', 4),
      ]);

      internals.applyDeterministicVolume(p, [sk]);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ── Lacuna 3 — parity precheck × geração ──────────────────────────────────

  describe('parity: assessRequestViability (precheck) × geração', () => {
    const perfis: Array<{ nome: string; req: Partial<TrainingPlanRequest> & { targetWeeks: number } }> = [
      {
        nome: 'viável (avançado, maratona, volume alto)',
        req: {
          goal: 'marathon', level: 'advanced', daysPerWeek: 5, targetWeeks: 24,
          recentDistanceKm: 15, recentFrequency: '4x_plus', currentWeeklyKm: 'gt30',
        },
      },
      {
        nome: 'inviável (iniciante, 10k, volume baixo)',
        req: {
          goal: '10k', level: 'beginner', daysPerWeek: 4, targetWeeks: 12,
          recentDistanceKm: 5, recentFrequency: '2x', currentWeeklyKm: '5_10',
        },
      },
      {
        nome: 'nunca correu',
        req: {
          goal: '5k', level: 'beginner', daysPerWeek: 3, targetWeeks: 12,
          recentDistanceKm: 0, walkCapacity: 'effort',
        },
      },
      {
        nome: 'prova com data',
        req: {
          goal: '10k', goalType: 'race', raceDistance: 10, raceWeeksUntil: 10,
          level: 'intermediate', daysPerWeek: 4, targetWeeks: 10,
          recentDistanceKm: 10, recentFrequency: '3x', currentWeeklyKm: '10_20',
        },
      },
    ];

    it.each(perfis)(
      'veredito idêntico ao do motor para: $nome',
      ({ req }) => {
        // Caminho do PRECHECK (controller /onboarding/precheck).
        const precheck = service.assessRequestViability(req);

        // Caminho da GERAÇÃO: a mesma capacidade/fases que generatePlan deriva,
        // avaliada direto no motor. Se os dois algum dia divergirem, quebra aqui.
        const goalKm = volumePlanner.resolveGoalKm({
          goal: req.goal,
          goalType: req.goalType,
          raceDistance: req.raceDistance,
          recentDistanceKm: req.recentDistanceKm,
        });
        const capacity = volumePlanner.deriveEffectiveCapacity({
          currentWeeklyKm: req.currentWeeklyKm,
          recentFrequency: req.recentFrequency,
          recentDistanceKm: req.recentDistanceKm,
          level: req.level,
        });

        if (capacity.neverRan) {
          // Quem nunca correu vai para o protocolo caminhada/corrida: sempre
          // viável, e sem longão de pico a perseguir.
          expect(precheck.neverRan).toBe(true);
          expect(precheck.feasible).toBe(true);
          expect(precheck.peakLongRunKm).toBe(0);
          return;
        }

        const motor = volumePlanner.assessViability({
          capacity,
          goalKm,
          totalWeeks: req.targetWeeks,
          phases: volumePlanner.calculatePhases(req.targetWeeks, goalKm),
        });

        expect(precheck.feasible).toBe(motor.feasible);
        expect(precheck.minWeeksRecommended).toBe(motor.minWeeksRecommended);
        expect(precheck.peakLongRunKm).toBe(motor.peakLongRunKm);
        expect(precheck.maxGoalKmInWindow).toBe(motor.maxGoalKmInWindow);
        expect(precheck.goalKm).toBe(goalKm);
        expect(precheck.effectiveWeeklyKm).toBe(capacity.weeklyKm);
      },
    );
  });
});
