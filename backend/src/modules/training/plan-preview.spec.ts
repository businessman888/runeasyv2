import { TrainingAIService } from './training-ai.service';
import { PaceCalculatorService } from '../../common/pace-calculator';
import { VolumePlannerService } from '../../common/volume-planner';

/**
 * Prévia do BriefingScreen — a tela PRÉ-pagamento onde o usuário decide assinar.
 *
 * O que estes testes protegem (ver
 * `auditorias/2026-07-27-briefing-previa-treino-e-arquetipo.md`):
 *  1. PARITY — o treino #1 da prévia é o MESMO que a geração produzirá.
 *  2. SEM IA — a prévia não pode chamar o roteador de IA (custo + ~7 min).
 *  3. SEM PACE INVENTADO — quem nunca correu não recebe pace nenhum.
 */
describe('TrainingAIService.buildPlanPreview', () => {
  const paceCalculator = new PaceCalculatorService();
  const volumePlanner = new VolumePlannerService();

  /**
   * `aiRouter` é deliberadamente um proxy que estoura em QUALQUER acesso: se a
   * prévia algum dia encostar na IA, estes testes falham em vez de passar caro
   * e lento em produção.
   */
  const explodingAiRouter = new Proxy(
    {},
    {
      get() {
        throw new Error('buildPlanPreview NÃO pode usar IA');
      },
    },
  );

  const service = new TrainingAIService(
    explodingAiRouter as never,
    paceCalculator,
    volumePlanner,
  );

  const beginner = {
    goal: '5k',
    level: 'beginner',
    daysPerWeek: 4,
    targetWeeks: 12,
    recentDistanceKm: 3,
    recentFrequency: '1x',
    currentWeeklyKm: 'lt5',
    calculatedPace: 7.0,
  };

  const neverRan = {
    goal: '5k',
    level: 'beginner',
    daysPerWeek: 3,
    targetWeeks: 12,
    recentDistanceKm: 0,
    walkCapacity: 'effort',
  };

  it('não toca no roteador de IA', () => {
    expect(() => service.buildPlanPreview(beginner)).not.toThrow();
    expect(() => service.buildPlanPreview(neverRan)).not.toThrow();
  });

  it('parity: treino #1 == semana 1 do esqueleto de volume real', () => {
    const preview = service.buildPlanPreview(beginner);

    const goalKm = volumePlanner.resolveGoalKm({ goal: beginner.goal });
    const capacity = volumePlanner.deriveEffectiveCapacity({
      currentWeeklyKm: beginner.currentWeeklyKm,
      recentFrequency: beginner.recentFrequency,
      recentDistanceKm: beginner.recentDistanceKm,
      level: beginner.level,
    });
    const phases = volumePlanner.calculatePhases(beginner.targetWeeks, goalKm);
    const skeleton = volumePlanner.buildVolumeSkeleton({
      capacity,
      goalKm,
      totalWeeks: beginner.targetWeeks,
      daysPerWeek: beginner.daysPerWeek,
      phases,
    });

    expect(preview.mode).toBe('run');
    expect(preview.week1FirstWorkout.distanceKm).toBe(
      skeleton[0].workouts[0].distanceKm,
    );
    expect(preview.week1TotalKm).toBe(skeleton[0].totalKm);
  });

  it('semana 1 é fase base → treino #1 nunca é sessão de qualidade', () => {
    const preview = service.buildPlanPreview(beginner);
    expect(preview.week1FirstWorkout.type).toBe('easy_run');
    expect(preview.week1FirstWorkout.zone).toBe('Z1');
  });

  it('pace vem em segundos/km, como faixa coerente', () => {
    const { paceRangeSeconds } = service.buildPlanPreview(beginner)
      .week1FirstWorkout;
    expect(paceRangeSeconds).not.toBeNull();
    expect(paceRangeSeconds!.min).toBeLessThan(paceRangeSeconds!.max);
    // Segundos/km, não decimal min/km (o reparo de pace depende disso).
    expect(paceRangeSeconds!.min).toBeGreaterThan(120);
  });

  describe('"nunca corri"', () => {
    it('vira walk/run por tempo, SEM pace e SEM distância', () => {
      const preview = service.buildPlanPreview(neverRan);

      expect(preview.mode).toBe('walk_run');
      expect(preview.week1FirstWorkout.type).toBe('walk_run');
      expect(preview.week1FirstWorkout.paceRangeSeconds).toBeNull();
      expect(preview.week1FirstWorkout.distanceKm).toBeNull();
      expect(preview.week1FirstWorkout.durationSeconds).toBeGreaterThan(0);
    });

    it('parity: bloco == buildWalkRunSkeleton da semana 1', () => {
      const preview = service.buildPlanPreview(neverRan);
      const phases = volumePlanner.calculatePhases(neverRan.targetWeeks, 5);
      const real = volumePlanner.buildWalkRunSkeleton({
        walkCapacity: neverRan.walkCapacity,
        totalWeeks: neverRan.targetWeeks,
        daysPerWeek: neverRan.daysPerWeek,
        phases,
      })[0].workouts[0];

      expect(preview.week1FirstWorkout.structure).toEqual({
        reps: real.reps,
        runSeconds: real.runSeconds,
        walkSeconds: real.walkSeconds,
      });
    });

    it('walk_capacity muda o ponto de partida', () => {
      const easy = service.buildPlanPreview({
        ...neverRan,
        walkCapacity: 'easy',
      });
      const notYet = service.buildPlanPreview({
        ...neverRan,
        walkCapacity: 'not_yet',
      });
      expect(easy.week1FirstWorkout.structure!.runSeconds).toBeGreaterThan(
        notYet.week1FirstWorkout.structure!.runSeconds,
      );
    });
  });

  describe('chave do arquétipo', () => {
    it('nunca correu → walk_run_starter, mesmo com limitação declarada', () => {
      // Regressão: antes, a limitação tinha prioridade máxima e apagava o caso
      // "nunca corri" — o usuário mais frágil recebia pace inventado.
      const preview = service.buildPlanPreview({
        ...neverRan,
        limitations: 'dor no joelho',
      });
      expect(preview.archetypeKey).toBe('walk_run_starter');
      expect(preview.hasLimitation).toBe(true);
    });

    it('já correu distância mas está parado → detrained', () => {
      const preview = service.buildPlanPreview({
        goal: 'half_marathon',
        level: 'intermediate',
        daysPerWeek: 3,
        targetWeeks: 12,
        recentDistanceKm: 10,
        recentFrequency: 'never',
        currentWeeklyKm: 'lt5',
        calculatedPace: 6.0,
      });
      expect(preview.archetypeKey).toBe('detrained');
    });

    it('corredor_express exige volume que sustente intensidade', () => {
      const base = {
        goal: '10k',
        level: 'intermediate',
        daysPerWeek: 3,
        targetWeeks: 12,
        recentDistanceKm: 10,
        calculatedPace: 5.2,
      };
      // Volume alto + poucos dias → express legítimo.
      expect(
        service.buildPlanPreview({
          ...base,
          recentFrequency: '4x_plus',
          currentWeeklyKm: '20_30',
        }).archetypeKey,
      ).toBe('corredor_express');

      // Mesmos 3 dias, mas volume baixo → NÃO promete HIIT a quem mal corre.
      expect(
        service.buildPlanPreview({
          ...base,
          recentFrequency: '1x',
          currentWeeklyKm: 'lt5',
        }).archetypeKey,
      ).not.toBe('corredor_express');
    });

    it('viabilidade não escolhe a chave — ela é só flag de tom', () => {
      // A barreira de crescimento (2.5×) reprova quase todo volume baixo. Se
      // `!feasible` escolhesse a chave, viraria o arquétipo da maioria.
      const preview = service.buildPlanPreview({
        goal: 'marathon',
        level: 'advanced',
        daysPerWeek: 5,
        targetWeeks: 24,
        recentDistanceKm: 15,
        recentFrequency: '4x_plus',
        currentWeeklyKm: 'gt30',
        calculatedPace: 4.5,
      });
      expect(preview.viability.feasible).toBe(true);
      expect(preview.archetypeKey).toBe('maratonista_nato');
    });
  });
});
