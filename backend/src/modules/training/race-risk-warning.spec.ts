import { TrainingAIService, TrainingPlanRequest } from './training-ai.service';
import { PaceCalculatorService } from '../../common/pace-calculator';
import {
  VolumePlannerService,
  RACE_WARNING_INCREASE_THRESHOLD,
} from '../../common/volume-planner';

/**
 * Aviso de risco para provas com data marcada.
 *
 * Duas coisas em jogo:
 *  1. O aviso precisa ser RARO e SIGNIFICATIVO. Com o limiar das metas de
 *     distância (~10%/sem), 88% dos cenários de prova disparavam — ruído que
 *     todo mundo aprende a ignorar. Daí um limiar dedicado, bem mais tolerante.
 *  2. Quem NUNCA CORREU e tem prova marcada é o perfil mais arriscado do app, e
 *     passava batido: `neverRan` devolvia `feasible: true` antes de qualquer
 *     avaliação.
 *
 * O teste mais importante daqui é o de ISOLAMENTO: nada disso pode alterar o
 * veredito das metas de distância.
 */
describe('TrainingAIService — aviso de risco em provas', () => {
  const paceCalculator = new PaceCalculatorService();
  const volumePlanner = new VolumePlannerService();
  const aiRouter = new Proxy(
    {},
    {
      get() {
        throw new Error('a viabilidade não pode usar IA');
      },
    },
  );
  const service = new TrainingAIService(
    aiRouter as never,
    paceCalculator,
    volumePlanner,
  );

  type Req = Partial<TrainingPlanRequest> & { targetWeeks: number };

  /** Prova com data marcada. */
  const race = (raceDistance: number, weeks: number, over: Req | object = {}): Req => ({
    goal: 'race',
    goalType: 'race',
    raceDistance,
    raceWeeksUntil: weeks,
    targetWeeks: weeks,
    level: 'beginner',
    daysPerWeek: 4,
    recentDistanceKm: 5,
    recentFrequency: '2x',
    currentWeeklyKm: '5_10',
    ...over,
  });

  /** Quem nunca correu: o onboarding zera frequência e volume. */
  const neverRanRace = (raceDistance: number, weeks: number): Req =>
    race(raceDistance, weeks, {
      recentDistanceKm: 0,
      recentFrequency: null,
      currentWeeklyKm: null,
      walkCapacity: 'effort',
    });

  // ── O limiar dedicado ─────────────────────────────────────────────────────

  describe('limiar', () => {
    it('é bem mais tolerante que o teto das metas de distância', () => {
      // 2,5× o teto seguro de progressão semanal (10%).
      expect(RACE_WARNING_INCREASE_THRESHOLD).toBeGreaterThan(0.1);
      expect(RACE_WARNING_INCREASE_THRESHOLD).toBe(0.25);
    });

    it('prova arriscada (21k em 5 sem, base fraca) → avisa', () => {
      const v = service.assessRequestViability(
        race(21.1, 5, { recentDistanceKm: 5, recentFrequency: '1x', currentWeeklyKm: 'lt5' }),
      );
      expect(v.raceRiskWarning).toBe(true);
      expect(v.requiredWeeklyIncreasePct).toBeGreaterThan(1); // >100%/sem
    });

    it('prova apertada mas fazível (10k em 12 sem, base 15 km/sem) → NÃO avisa', () => {
      // Exige 12,0%/sem: acima do teto das metas de distância (10%), mas bem
      // abaixo do limiar de prova. É exatamente o caso que virava ruído antes.
      const v = service.assessRequestViability(
        race(10, 12, {
          level: 'intermediate',
          recentDistanceKm: 5,
          recentFrequency: '3x',
          currentWeeklyKm: '10_20',
        }),
      );
      expect(v.raceRiskWarning).toBe(false);
      expect(v.feasible).toBe(false); // infeasible pelo critério antigo…
      // …e é justamente por isso que o aviso não pode se apoiar em `feasible`.
    });

    it('caso de fronteira: 10k em 8 sem exige 25,4%/sem → avisa por pouco', () => {
      // Documenta onde a linha cai. Com o limiar em 30% este caso NÃO avisava;
      // ele mudou de lado ao baixarmos para 25% (que era o preço de pegar
      // "nunca correu + maratona em 16 semanas", a 27%/sem). Se na calibração
      // real ele se mostrar ruído, é o primeiro candidato a subir o limiar.
      const v = service.assessRequestViability(
        race(10, 8, {
          level: 'intermediate',
          recentDistanceKm: 5,
          recentFrequency: '3x',
          currentWeeklyKm: '10_20',
        }),
      );
      expect(v.requiredWeeklyIncreasePct).toBeCloseTo(0.254, 3);
      expect(v.raceRiskWarning).toBe(true);
    });

    it('prova confortável → não avisa', () => {
      const v = service.assessRequestViability(
        race(10, 16, {
          level: 'intermediate',
          recentDistanceKm: 10,
          recentFrequency: '4x_plus',
          currentWeeklyKm: '20_30',
        }),
      );
      expect(v.raceRiskWarning).toBe(false);
      expect(v.feasible).toBe(true);
    });
  });

  // ── Nunca correu + prova ──────────────────────────────────────────────────

  describe('nunca correu com prova marcada', () => {
    it.each<[string, number, number, boolean]>([
      ['5k em 24 sem (6 meses)', 5, 24, false],
      ['5k em 12 sem', 5, 12, false],
      ['10k em 12 sem', 10, 12, false],
      ['meia em 16 sem', 21.1, 16, false],
      ['maratona em 16 sem', 42.2, 16, true],
      ['maratona em 12 sem', 42.2, 12, true],
      ['meia em 8 sem', 21.1, 8, true],
    ])('%s → avisa=%s', (_n, dist, weeks, esperado) => {
      const v = service.assessRequestViability(neverRanRace(dist, weeks));
      expect(v.raceRiskWarning).toBe(esperado);
    });

    it('entra na AVALIAÇÃO de risco — não avisa automaticamente', () => {
      // A distinção que define o desenho: o limiar discrimina sozinho.
      const seguro = service.assessRequestViability(neverRanRace(5, 24));
      const perigoso = service.assessRequestViability(neverRanRace(42.2, 12));
      expect(seguro.raceRiskWarning).toBe(false);
      expect(perigoso.raceRiskWarning).toBe(true);
    });

    it('o PLANO não muda: feasible e neverRan seguem intactos', () => {
      // A geração continua indo para o protocolo caminhada/corrida.
      const v = service.assessRequestViability(neverRanRace(42.2, 12));
      expect(v.neverRan).toBe(true);
      expect(v.feasible).toBe(true);
      expect(v.peakLongRunKm).toBe(0);
      expect(v.requiredWeeklyIncreasePct).toBe(0);
      expect(v.raceRiskWarning).toBe(true); // só o aviso acende
    });

    it('nunca correu SEM prova → nada muda, sem aviso', () => {
      const v = service.assessRequestViability({
        goal: 'marathon',
        goalType: 'distance',
        level: 'beginner',
        daysPerWeek: 3,
        targetWeeks: 12,
        recentDistanceKm: 0,
        walkCapacity: 'effort',
      });
      expect(v.neverRan).toBe(true);
      expect(v.feasible).toBe(true);
      expect(v.raceRiskWarning).toBe(false);
    });
  });

  // ── A flag chega ao Briefing (via /preview, não só /precheck) ─────────────

  describe('exposição no preview do Briefing', () => {
    it('prova de risco aceitável: feasible false MAS raceRiskWarning false', () => {
      // É o caso das ~48% que faziam o Briefing esconder a projeção sem motivo.
      const p = service.buildPlanPreview(
        race(10, 12, {
          level: 'intermediate',
          recentDistanceKm: 5,
          recentFrequency: '3x',
          currentWeeklyKm: '10_20',
        }),
      );
      expect(p.viability.feasible).toBe(false);
      expect(p.viability.raceRiskWarning).toBe(false);
    });

    it('prova arriscada: raceRiskWarning true chega ao preview', () => {
      const p = service.buildPlanPreview(
        race(21.1, 5, {
          recentDistanceKm: 5,
          recentFrequency: '1x',
          currentWeeklyKm: 'lt5',
        }),
      );
      expect(p.viability.raceRiskWarning).toBe(true);
    });

    it('nunca correu + maratona 12 sem: aviso chega mesmo no modo walk_run', () => {
      const p = service.buildPlanPreview(neverRanRace(42.2, 12));
      expect(p.mode).toBe('walk_run');
      expect(p.viability.raceRiskWarning).toBe(true);
    });

    it('meta de distância nunca acende a flag no preview', () => {
      for (const goal of ['5k', '10k', 'half_marathon', 'marathon']) {
        const p = service.buildPlanPreview({
          goal,
          goalType: 'distance',
          level: 'beginner',
          daysPerWeek: 4,
          targetWeeks: 12,
          recentDistanceKm: 5,
          recentFrequency: '2x',
          currentWeeklyKm: '5_10',
        });
        expect(p.viability.raceRiskWarning).toBe(false);
      }
    });
  });

  // ── ISOLAMENTO: o item inegociável ────────────────────────────────────────

  describe('isolamento das metas de distância', () => {
    const DIST = [0, 3, 5, 10, 15];
    const FREQ = ['never', '1x', '2x', '3x', '4x_plus'];
    const KM = ['lt5', '5_10', '10_20', '20_30', 'gt30'];
    const LEVEL = ['beginner', 'intermediate', 'advanced'];
    const GOAL = ['5k', '10k', 'half_marathon', 'marathon', 'general_fitness'];

    /** Percorre todas as combinações NÃO-prova do espaço de onboarding. */
    function sweepDistanceGoals(visit: (v: ReturnType<typeof service.assessRequestViability>) => void) {
      for (const d of DIST)
        for (const level of LEVEL)
          for (const goal of GOAL)
            for (const tf of [1, 3, 6]) {
              const freqs = d === 0 ? [null] : FREQ;
              const kms = d === 0 ? [null] : KM;
              for (const recentFrequency of freqs)
                for (const currentWeeklyKm of kms) {
                  visit(
                    service.assessRequestViability({
                      goal,
                      level,
                      daysPerWeek: 4,
                      targetWeeks: tf * 4,
                      recentDistanceKm: d,
                      recentFrequency,
                      currentWeeklyKm,
                    }),
                  );
                }
            }
    }

    it('nenhuma meta de distância acende o aviso', () => {
      let acendeu = 0;
      sweepDistanceGoals((v) => {
        if (v.raceRiskWarning) acendeu++;
      });
      expect(acendeu).toBe(0);
    });

    /**
     * Impressão digital do veredito COMPLETO de todas as 4.545 combinações
     * não-prova, capturada do build ANTERIOR a esta mudança. Se qualquer campo
     * de qualquer combinação mudar, o hash muda e este teste quebra — que é a
     * garantia de que o caminho de prova não vazou para o de distância.
     */
    it('o veredito das metas de distância é byte-idêntico ao de antes', () => {
      const linhas: string[] = [];
      sweepDistanceGoals((v) => {
        linhas.push(
          [
            v.feasible ? 1 : 0,
            v.requiredWeeklyIncreasePct,
            v.minWeeksRecommended,
            v.maxGoalKmInWindow,
            v.peakLongRunKm,
            v.neverRan ? 1 : 0,
          ].join(','),
        );
      });

      expect(linhas).toHaveLength(4545);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createHash } = require('crypto') as typeof import('crypto');
      const fingerprint = createHash('sha256').update(linhas.join(';')).digest('hex');
      expect(fingerprint).toBe(
        'f8a0d390853aa9ab0ae3d9cec202704a9fd309aa09040e59dc974aeb525398f0',
      );
    });
  });
});
