import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WeeklyInsightService } from './weekly-insight.service';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService } from '../../common/ai';
import { VdotService } from './vdot.service';
import { TrainingService } from './training.service';
import { PlanWeekWindow } from './helpers/plan-window.helper';

/**
 * Fase 2A — métricas de uma SEMANA DO PLANO.
 *
 * ⚠️ `WeeklyInsightService` usa `supabaseService.getClient().from(...)`, como o
 * `RetrospectiveService` e diferente dos demais services — por isso o mock é o
 * mesmo daquela suíte: roteador por NOME DE TABELA, porque a mesma execução
 * consulta tabelas diferentes e um chain stub único não distinguiria.
 */

type TableData = Record<string, unknown[]>;

function makeChain(rows: unknown[]) {
  const result = { data: rows, error: null };
  const first = { data: rows[0] ?? null, error: null };
  const chain: Record<string, unknown> = {};
  const passthrough = [
    'select',
    'eq',
    'neq',
    'gte',
    'lte',
    'gt',
    'lt',
    'in',
    'is',
    'not',
    'or',
    'order',
    'limit',
    'insert',
    'update',
    'delete',
    'upsert',
  ];
  for (const m of passthrough) chain[m] = jest.fn(() => chain);
  chain.single = jest.fn(() => Promise.resolve(first));
  chain.maybeSingle = jest.fn(() => Promise.resolve(first));
  chain.then = (
    onF: (v: typeof result) => unknown,
    onR?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(onF, onR);
  return chain;
}

function buildSupabaseMock(tables: TableData) {
  const from = jest.fn((table: string) => makeChain(tables[table] ?? []));
  return {
    mock: {
      getClient: jest.fn(() => ({ from })),
    } as unknown as SupabaseService,
    from,
  };
}

/** Treino de plano. Segmento único de 5 km a 5:30/km (330 s/km). */
const planWorkout = (over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  week_number: 2,
  scheduled_date: '2026-06-08',
  status: 'pending',
  distance_km: 5,
  distance_run: null,
  time_run_seconds: null,
  pace_seconds_per_km: null,
  instructions_json: [
    { type: 'main', distance_km: 5, pace_min: 330, zone: 'Z1' },
  ],
  metadata: { zone: 'Z1' },
  ...over,
});

/** Corrida de `activities` — `distance` em METROS. */
const activity = (over: Record<string, unknown> = {}) => ({
  start_date: '2026-06-08T12:00:00Z',
  distance: 5000,
  moving_time: 1650,
  average_pace: 330,
  calories: 300,
  elevation_gain: 20,
  ...over,
});

const WEEK: PlanWeekWindow = {
  weekNumber: 2,
  startStr: '2026-06-08',
  endStr: '2026-06-14',
  source: 'workouts',
};

describe('WeeklyInsightService — métricas da semana', () => {
  let service: WeeklyInsightService;

  const build = async (tables: TableData) => {
    const { mock } = buildSupabaseMock(tables);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightService,
        { provide: SupabaseService, useValue: mock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: TrainingService,
          useValue: { reanchorRemainingWorkoutsToToday: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: {
            createNotification: jest.fn(),
            sendPushNotification: jest.fn(),
          },
        },
        // isAvailable:false força o fallback determinístico — sem rede.
        {
          provide: AIRouterService,
          useValue: { isAvailable: false, call: jest.fn() },
        },
        // Este arquivo mede MÉTRICAS; a reestimativa de VDOT tem spec própria.
        {
          provide: VdotService,
          useValue: { reestimateForPlan: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    service = module.get(WeeklyInsightService);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // O teste-título. Mesma regra da Fase 1A, agora por semana.
  // ───────────────────────────────────────────────────────────────────────────
  describe('escopo — aderência × total corrido', () => {
    /** 5 planejados (25 km), 3 concluídos com a distância cheia (15 km). */
    const fivePlannedThreeDone = () =>
      Array.from({ length: 5 }, (_, i) => {
        const done = i < 3;
        return planWorkout({
          id: `w-${i}`,
          scheduled_date: `2026-06-${String(8 + i).padStart(2, '0')}`,
          status: done ? 'completed' : 'pending',
          distance_run: done ? 5 : null,
          time_run_seconds: done ? 1650 : null,
          pace_seconds_per_km: done ? 330 : null,
        });
      });

    it('A ADERÊNCIA NÃO INFLA COM CORRIDA LIVRE', async () => {
      // 15 km do plano + 10 km de corrida livre = 25 km corridos na janela.
      // A aderência tem que continuar 15/25 = 60%, não 100%.
      await build({
        activities: [
          activity({ start_date: '2026-06-08T12:00:00Z', distance: 5000 }),
          activity({ start_date: '2026-06-09T12:00:00Z', distance: 5000 }),
          activity({ start_date: '2026-06-10T12:00:00Z', distance: 5000 }),
          activity({ start_date: '2026-06-11T12:00:00Z', distance: 10000 }),
        ],
      });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        fivePlannedThreeDone(),
        5,
      );

      expect(m.completedDistanceKm).toBe(15);
      expect(m.distanceVsGoalPercent).toBe(60);
      expect(m.totalDistanceKm).toBe(25);
      expect(m.freeRunDistanceKm).toBe(10);
      expect(m.totalRunsInPeriod).toBe(4);
    });

    it('a aderência NUNCA lê activities — zero corridas, mesma aderência', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        fivePlannedThreeDone(),
        5,
      );

      expect(m.completedDistanceKm).toBe(15);
      expect(m.distanceVsGoalPercent).toBe(60);
      expect(m.completionRate).toBe(60);
      // Sem activities não há total corrido — e a livre não pode ficar negativa.
      expect(m.totalDistanceKm).toBe(0);
      expect(m.freeRunDistanceKm).toBe(0);
    });

    it('só conta os treinos da SEMANA pedida', async () => {
      await build({ activities: [] });

      const workouts = [
        ...fivePlannedThreeDone(),
        planWorkout({
          id: 'other',
          week_number: 3,
          status: 'completed',
          distance_run: 20,
        }),
      ];

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        workouts,
        5,
      );

      expect(m.plannedWorkouts).toBe(5);
      expect(m.completedDistanceKm).toBe(15);
    });

    it('usa distance_km como fallback de distance_run em linha legada', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: null,
            distance_km: 7,
          }),
        ],
        3,
      );

      expect(m.completedDistanceKm).toBe(7);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('executionRatio — separa "não apareceu" de "apareceu e não cumpriu"', () => {
    it('3 de 5 com distância cheia → executionRatio 100%', async () => {
      await build({ activities: [] });

      const workouts = Array.from({ length: 5 }, (_, i) =>
        planWorkout({
          id: `w-${i}`,
          status: i < 3 ? 'completed' : 'pending',
          distance_run: i < 3 ? 5 : null,
        }),
      );

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        workouts,
        5,
      );

      // A semana inteira ficou em 60%, mas o que ele FEZ, fez inteiro.
      expect(m.completionRate).toBe(60);
      expect(m.distanceVsGoalPercent).toBe(60);
      expect(m.executionRatioPercent).toBe(100);
    });

    it('5 de 5 encurtando cada treino → executionRatio abaixo de 100%', async () => {
      await build({ activities: [] });

      const workouts = Array.from({ length: 5 }, (_, i) =>
        planWorkout({ id: `w-${i}`, status: 'completed', distance_run: 4 }),
      );

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        workouts,
        5,
      );

      expect(m.completionRate).toBe(100);
      expect(m.executionRatioPercent).toBe(80);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('frequência — DIAS DISTINTOS, não contagem de treinos', () => {
    it('dois treinos no mesmo dia contam 1 dia', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            id: 'a',
            scheduled_date: '2026-06-08',
            status: 'completed',
            distance_run: 5,
          }),
          planWorkout({
            id: 'b',
            scheduled_date: '2026-06-08',
            status: 'completed',
            distance_run: 5,
          }),
          planWorkout({
            id: 'c',
            scheduled_date: '2026-06-10',
            status: 'completed',
            distance_run: 5,
          }),
        ],
        4,
      );

      expect(m.completedWorkouts).toBe(3);
      expect(m.frequencyActualDays).toBe(2);
      expect(m.frequencyActualDays).not.toBe(m.completedWorkouts);
    });

    it('a meta vem de frequency_per_week do plano', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [planWorkout({ status: 'completed', distance_run: 5 })],
        4,
      );

      expect(m.frequencyTargetDays).toBe(4);
      expect(m.frequencyVsGoalPercent).toBe(25);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('zonas — lidas de metadata, não inferidas do tipo', () => {
    it('agrupa prescrito e executado por metadata.zone', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            id: 'a',
            metadata: { zone: 'Z1' },
            status: 'completed',
            distance_run: 5,
            time_run_seconds: 1650,
          }),
          planWorkout({ id: 'b', metadata: { zone: 'Z1' }, status: 'pending' }),
          planWorkout({
            id: 'c',
            metadata: { zone: 'Z3' },
            distance_km: 8,
            status: 'completed',
            distance_run: 8,
            time_run_seconds: 2000,
          }),
        ],
        3,
      );

      expect(m.zoneDistribution.prescribed.Z1).toEqual({
        workouts: 2,
        km: 10,
        seconds: 0,
      });
      expect(m.zoneDistribution.prescribed.Z3.km).toBe(8);
      // Executado só conta o concluído — o Z1 pendente fica de fora.
      expect(m.zoneDistribution.executed.Z1).toEqual({
        workouts: 1,
        km: 5,
        seconds: 1650,
      });
      expect(m.zoneDistribution.executed.Z3.workouts).toBe(1);
    });

    it('NÃO infere zona do tipo do treino quando metadata está vazia', async () => {
      await build({ activities: [] });

      // `inferZoneFromType` da WellnessService mapearia isto para Z1. Aqui a
      // ausência de metadata.zone significa "não sei", e a linha fica fora.
      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [planWorkout({ metadata: null, status: 'completed', distance_run: 5 })],
        3,
      );

      const total = Object.values(m.zoneDistribution.prescribed).reduce(
        (s, b) => s + b.workouts,
        0,
      );
      expect(total).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('aderência de intensidade', () => {
    /** Aquecimento 1 km a 400 + principal 3 km a 300 + volta 1 km a 400. */
    const segmented = () => [
      { type: 'warmup', distance_km: 1, pace_min: 400, zone: 'Z1' },
      { type: 'main', distance_km: 3, pace_min: 300, zone: 'Z1' },
      { type: 'cooldown', distance_km: 1, pace_min: 400, zone: 'Z1' },
    ];

    it('pace esperado é PONDERADO pelos segmentos, não o do principal', async () => {
      await build({ activities: [] });

      // (400×1 + 300×3 + 400×1) / 5 = 340 — e NÃO 300, o do segmento main.
      // Comparar o pace da corrida inteira com o do main faria todo mundo
      // parecer mais lento do que correu.
      const expected = service.expectedPaceForWorkout({
        instructions_json: segmented(),
      } as never);

      expect(expected).toBe(340);
    });

    it('cruza esperado × executado por zona', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: 5,
            time_run_seconds: 1500,
            pace_seconds_per_km: 300, // 40 s/km mais rápido que os 340 esperados
            instructions_json: segmented(),
          }),
        ],
        3,
      );

      expect(m.intensityAdherence.Z1).toEqual({
        n: 1,
        avgExpectedSec: 340,
        avgActualSec: 300,
        avgDeltaSec: -40, // negativo = correu MAIS RÁPIDO
        fasterCount: 1,
      });
      expect(m.easyRunsMeasured).toBe(1);
      expect(m.easyRunsTooFast).toBe(1);
    });

    it('dentro da tolerância não conta como rápido demais', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: 5,
            pace_seconds_per_km: 330, // 10 s/km abaixo — dentro dos 15 de tolerância
            instructions_json: segmented(),
          }),
        ],
        3,
      );

      expect(m.easyRunsMeasured).toBe(1);
      expect(m.easyRunsTooFast).toBe(0);
    });

    it('Z4 não entra na contagem de fáceis — ali correr rápido é o objetivo', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            metadata: { zone: 'Z4' },
            status: 'completed',
            distance_run: 5,
            pace_seconds_per_km: 250,
            instructions_json: segmented(),
          }),
        ],
        3,
      );

      expect(m.intensityAdherence.Z4.n).toBe(1);
      expect(m.easyRunsMeasured).toBe(0);
      expect(m.easyRunsTooFast).toBe(0);
    });

    /**
     * Forma REAL do walk/run, copiada de um plano de produção: um `repeat` com
     * `work`/`recovery` por TEMPO e `pace_min: 0` (a pessoa não tem VDOT, então
     * a geração de propósito não inventa pace).
     */
    const walkRun = () => [
      {
        type: 'repeat',
        reps: 6,
        zone: 'Z1',
        work: { duration_seconds: 90, pace_min: 0, pace_max: 0 },
        recovery: { duration_seconds: 150, pace_min: 0, pace_max: 0 },
      },
    ];

    it('walk/run (pace_min 0) fica de fora — não havia pace prescrito', async () => {
      await build({ activities: [] });

      expect(
        service.expectedPaceForWorkout({
          instructions_json: walkRun(),
        } as never),
      ).toBeNull();

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: 3,
            pace_seconds_per_km: 400,
            instructions_json: walkRun(),
          }),
        ],
        3,
      );

      expect(m.intensityAdherence.Z1).toBeUndefined();
      expect(m.easyRunsMeasured).toBe(0);
    });

    /**
     * Intervalado ESTRUTURADO, na forma que a geração produz hoje: o miolo é um
     * `type: 'repeat'` com `work`/`recovery` aninhados e `reps` — sem
     * `distance_km` nem `pace_min` no topo do bloco.
     *
     * ── A REGRESSÃO QUE ESTE TESTE PRENDE ────────────────────────────────────
     *
     * Até 2026-08-06 a função procurava `seg.repeat.work` (chave que o schema
     * NUNCA produziu) e exigia `distance_km` no topo do bloco. Como um `repeat`
     * não tem nenhum dos dois, o miolo de qualidade inteiro era descartado e
     * sobravam só o aquecimento e a volta à calma — ambos Z1. O pace esperado de
     * um intervalado saía IDÊNTICO ao de uma rodagem leve, e a aderência de
     * Z4/Z5 media o esforço duro com régua de easy. Para a reestimativa de VDOT
     * isso é o pior viés possível: o atleta parece esmagar os alvos de qualidade
     * quando apenas cumpriu o treino.
     *
     * O teste antigo passava porque testava uma forma INVENTADA
     * (`{ type: 'repeat', distance_km: 2, repeat: { work: {...} } }`) — ele
     * congelava a leitura errada em vez de pegá-la.
     */
    const intervaladoEstruturado = () => [
      { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 459 },
      {
        type: 'repeat',
        reps: 5,
        zone: 'Z4',
        work: { distance_km: 0.5, pace_min: 348, zone: 'Z4' },
        recovery: { duration_seconds: 90, pace_min: 459, zone: 'Z1' },
      },
      { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 459 },
    ];

    it('intervalado estruturado: o bloco de qualidade ENTRA no ponderado', async () => {
      await build({ activities: [] });

      const expected = service.expectedPaceForWorkout({
        instructions_json: intervaladoEstruturado(),
      } as never);

      // Σtempo ÷ Σdistância, com o sub-bloco por TEMPO convertido pelo próprio
      // pace prescrito:
      //   warmup    2 km   @459  →  2.000 km,  918 s
      //   work    5×0,5 km @348  →  2.500 km,  870 s
      //   recovery 5×90 s  @459  →  0.980 km,  450 s   (90/459 km por rep)
      //   cooldown  2 km   @459  →  2.000 km,  918 s
      //   3156 ÷ 7,480 = 422
      expect(expected).toBe(422);

      // A trava de verdade: NÃO pode ser o esperado de um easy equivalente.
      const easy = service.expectedPaceForWorkout({
        instructions_json: [
          { type: 'main', zone: 'Z1', distance_km: 6, pace_min: 459 },
        ],
      } as never);
      expect(easy).toBe(459);
      expect(expected).not.toBe(easy);

      // E tem de cair ENTRE o pace do tiro e o do trote — é a definição de um
      // ponderado que enxerga as duas partes do treino.
      expect(expected).toBeGreaterThan(348);
      expect(expected).toBeLessThan(459);
    });

    it('a aderência de Z4 usa o esperado do TIRO, não o do aquecimento', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            metadata: { zone: 'Z4' },
            status: 'completed',
            distance_run: 7.5,
            time_run_seconds: 3200,
            // Corrida inteira a 427 s/km: praticamente em cima dos 422
            // prescritos. Com o bug, o esperado era 459 e este atleta aparecia
            // 32 s/km RÁPIDO DEMAIS — sem ter feito nada além do combinado.
            pace_seconds_per_km: 427,
            instructions_json: intervaladoEstruturado(),
          }),
        ],
        3,
      );

      expect(m.intensityAdherence.Z4).toEqual({
        n: 1,
        avgExpectedSec: 422,
        avgActualSec: 427,
        avgDeltaSec: 5, // positivo = ligeiramente mais lento que o alvo
        fasterCount: 0, // e NÃO conta como rápido demais
      });
    });

    /**
     * A REGRESSÃO QUE ESTE TESTE PRENDE.
     *
     * Até 2026-08-10 o "esperado" era a borda RÁPIDA da faixa (`pace_min`).
     * Quem executava no MEIO do prescrito — que é executar certo — lia na
     * narrativa que ficou lento por metade da largura da banda. Com a Z1 em
     * 393–434, o harness rodando exatamente no alvo produzia "20 segundos mais
     * lento que o planejado".
     */
    it('o esperado é o CENTRO da faixa, não a borda rápida', async () => {
      await build({ activities: [] });
      const banda = () => [
        {
          type: 'main',
          zone: 'Z1',
          distance_km: 6,
          pace_min: 393,
          pace_max: 434,
        },
      ];

      expect(
        service.expectedPaceForWorkout({ instructions_json: banda() } as never),
      ).toBe(414); // (393 + 434) / 2 = 413,5

      expect(
        service.expectedPaceRangeForWorkout({
          instructions_json: banda(),
        } as never),
      ).toEqual({ min: 393, max: 434, center: 414 });
    });

    it('sem pace_max a faixa colapsa num ponto — plano legado intocado', async () => {
      // Planos anteriores gravavam só `pace_min`. O comportamento antigo tem de
      // sobreviver, senão a métrica de todo insight já gerado mudaria de sentido.
      await build({ activities: [] });
      expect(
        service.expectedPaceRangeForWorkout({
          instructions_json: [
            { type: 'main', zone: 'Z1', distance_km: 5, pace_min: 400 },
          ],
        } as never),
      ).toEqual({ min: 400, max: 400, center: 400 });
    });

    /**
     * A OUTRA METADE DA MESMA CORREÇÃO.
     *
     * O que se EXIBE virou o centro, mas o que DISPARA `aliviar_ritmo` continua
     * sendo a borda rápida. Se o cue passasse a medir contra o centro, acusaria
     * de "rápido demais" quem correu dentro da própria faixa pedida — e a
     * mudança feita para a narrativa teria estragado a regra da Fase 2.
     */
    it('correr no CENTRO da faixa NÃO conta como rápido demais', async () => {
      await build({ activities: [] });
      const comFaixa = [
        {
          type: 'main',
          zone: 'Z1',
          distance_km: 6,
          pace_min: 393,
          pace_max: 434,
        },
      ];

      const noAlvo = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: 6,
            pace_seconds_per_km: 414, // o centro exato
            instructions_json: comFaixa,
          }),
        ],
        3,
      );
      expect(noAlvo.easyRunsMeasured).toBe(1);
      expect(noAlvo.easyRunsTooFast).toBe(0);
      expect(noAlvo.intensityAdherence.Z1.avgExpectedSec).toBe(414);
      expect(noAlvo.intensityAdherence.Z1.avgDeltaSec).toBe(0);

      const rapidoDemais = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [
          planWorkout({
            status: 'completed',
            distance_run: 6,
            pace_seconds_per_km: 375, // 18 s/km ALÉM da borda rápida (393)
            instructions_json: comFaixa,
          }),
        ],
        3,
      );
      expect(rapidoDemais.easyRunsTooFast).toBe(1);
    });

    it('reps ausente conta como 1 — mesma convenção do motor que executa', async () => {
      await build({ activities: [] });

      // `segmentEngine.buildSegSteps` faz `Math.max(1, Math.round(reps || 1))`.
      // Se as duas contagens divergirem, o esperado descreve um treino que não
      // é o que o app mandou correr.
      const expected = service.expectedPaceForWorkout({
        instructions_json: [
          { type: 'repeat', work: { distance_km: 2, pace_min: 300 } },
        ],
      } as never);

      expect(expected).toBe(300);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('delta vs semana N−1', () => {
    it('calcula o delta NA HORA, sem depender de linha anterior persistida', async () => {
      // Sem backfill, a primeira semana pós-ativação não tem N−1 gravada. Se o
      // delta viesse da tabela, ficaria vazio para sempre.
      //
      // O mock devolve o MESMO array para as duas janelas; quem separa uma
      // semana da outra é o filtro por dia de São Paulo dentro do service.
      await build({
        activities: [
          activity({ start_date: '2026-06-03T12:00:00Z', distance: 4000 }), // semana 1
          activity({ start_date: '2026-06-08T12:00:00Z', distance: 6000 }), // semana 2
        ],
      });

      const prevWeek: PlanWeekWindow = {
        weekNumber: 1,
        startStr: '2026-06-01',
        endStr: '2026-06-07',
        source: 'workouts',
      };

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        prevWeek,
        [planWorkout({ status: 'completed', distance_run: 6 })],
        3,
      );

      expect(m.metricsDeltas.distance.value).toBe(6);
      expect(m.metricsDeltas.distance.prevValue).toBe(4);
      expect(m.metricsDeltas.distance.deltaPct).toBe(50);
      // A janela também não vaza para o total corrido da semana atual.
      expect(m.totalDistanceKm).toBe(6);
      expect(m.totalRunsInPeriod).toBe(1);
    });

    it('sem semana anterior, deltaPct é null (não 0)', async () => {
      await build({
        activities: [activity({ distance: 6000 })],
      });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [planWorkout({ status: 'completed', distance_run: 6 })],
        3,
      );

      expect(m.metricsDeltas.distance.prevValue).toBe(0);
      expect(m.metricsDeltas.distance.deltaPct).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('semana vazia', () => {
    it('não divide por zero em lugar nenhum', async () => {
      await build({ activities: [] });

      const m = await service.buildPlanWeekMetrics(
        'user-1',
        WEEK,
        null,
        [planWorkout({ status: 'pending' })],
        3,
      );

      expect(m.completionRate).toBe(0);
      expect(m.distanceVsGoalPercent).toBe(0);
      expect(m.executionRatioPercent).toBe(0);
      expect(m.avgPaceSeconds).toBe(0);
      expect(m.expectedPaceSeconds).toBe(0);
      expect(m.frequencyActualDays).toBe(0);
      expect(m.freeRunDistanceKm).toBe(0);
      expect(Number.isFinite(m.frequencyVsGoalPercent)).toBe(true);
    });
  });
});
