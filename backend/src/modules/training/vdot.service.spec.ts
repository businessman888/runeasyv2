import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../database';
import { PaceCalculatorService } from '../../common/pace-calculator';
import {
  VdotService,
  MIN_QUALITY_EFFORTS,
  MIN_DELTA_SEC_BEYOND_BAND,
  VDOT_STEP,
} from './vdot.service';

/**
 * Fase 3 — a reestimativa de VDOT.
 *
 * O que estes testes protegem, em ordem de importância:
 *   1. o VDOT NÃO se move sem evidência consistente (anti-montanha-russa);
 *   2. quando se move, anda 1 ponto — nunca salta para o VDOT implícito;
 *   3. mover reescreve os paces FUTUROS e invalida os briefings tocados;
 *   4. o mesmo treino não vota duas vezes.
 */

interface Row {
  [key: string]: unknown;
}

/**
 * Mock de Supabase com estado.
 *
 * `in`, `gt`, `gte` e `lte` FILTRAM de verdade — não são passthrough. Isso é
 * deliberado: são justamente esses operadores que implementam "só treinos
 * futuros" e "só a janela recente". Como passthrough, o teste de que o passado
 * não é tocado passaria validando o mock, não o código.
 */
function buildMock(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let autoId = 0;

  const from = jest.fn((table: string) => {
    if (!tables[table]) tables[table] = [];
    const preds: Array<(row: Row) => boolean> = [];
    let pending: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};

    const matches = (row: Row) => preds.every((p) => p(row));

    const apply = (): Row[] => {
      if (pending === 'insert') {
        const created = { id: `row-${++autoId}`, ...payload };
        tables[table].push(created);
        return [created];
      }
      if (pending === 'update') {
        const hit = tables[table].filter(matches);
        for (const row of hit) Object.assign(row, payload);
        return hit;
      }
      if (pending === 'delete') {
        const hit = tables[table].filter(matches);
        tables[table] = tables[table].filter((r) => !matches(r));
        return hit;
      }
      return tables[table].filter(matches);
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['order', 'limit', 'not', 'or']) {
      chain[m] = jest.fn(() => chain);
    }
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn((c: string, v: unknown) => {
      preds.push((r) => r[c] === v);
      return chain;
    });
    chain.in = jest.fn((c: string, vals: unknown[]) => {
      preds.push((r) => vals.includes(r[c]));
      return chain;
    });
    chain.gt = jest.fn((c: string, v: string) => {
      preds.push((r) => String(r[c]) > v);
      return chain;
    });
    chain.gte = jest.fn((c: string, v: string) => {
      preds.push((r) => String(r[c]) >= v);
      return chain;
    });
    chain.lte = jest.fn((c: string, v: string) => {
      preds.push((r) => String(r[c]) <= v);
      return chain;
    });
    chain.insert = jest.fn((d: Row) => {
      pending = 'insert';
      payload = d;
      return chain;
    });
    chain.update = jest.fn((d: Row) => {
      pending = 'update';
      payload = d;
      return chain;
    });
    chain.delete = jest.fn(() => {
      pending = 'delete';
      return chain;
    });
    chain.single = jest.fn(() => {
      const rows = apply();
      return Promise.resolve({
        data: rows[0] ?? null,
        error: rows[0] ? null : { message: 'no rows' },
      });
    });
    chain.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: apply()[0] ?? null, error: null }),
    );
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: apply(), error: null }).then(onF, onR);

    return chain;
  });

  return {
    mock: {
      getClient: jest.fn(() => ({ from })),
    } as unknown as SupabaseService,
    tables,
  };
}

// ── Geração de GPS sintético ─────────────────────────────────────────────────

const M_PER_DEG = (6371000 * Math.PI) / 180;

/** Traçado reto para leste com pace constante por perna, ponto a cada 10 m. */
function gps(legs: Array<{ m: number; pace: number }>): Row[] {
  const points: Row[] = [
    { latitude: 0, longitude: 0, timestamp: 1_700_000_000_000 },
  ];
  for (const leg of legs) {
    const last = points[points.length - 1] as {
      longitude: number;
      timestamp: number;
    };
    const n = Math.round(leg.m / 10);
    for (let i = 1; i <= n; i++) {
      points.push({
        latitude: 0,
        longitude: last.longitude + (i * 10) / M_PER_DEG,
        timestamp: last.timestamp + Math.round(i * 10 * leg.pace),
      });
    }
  }
  return points;
}

// Faixas do VDOT 40 (tabela de Daniels): Z4 ≈ 5:05/km → [297, 313] com ±8.
const Z1_MIN = 393;
const Z1_MAX = 434;
const Z4_MIN = 297;
const Z4_MAX = 313;

/** Intervalado estruturado: 1 km Z1 + 4×(500 m Z4 / 200 m Z1) + 1 km Z1. */
const intervalSegments = () => [
  {
    type: 'warmup',
    zone: 'Z1',
    distance_km: 1,
    pace_min: Z1_MIN,
    pace_max: Z1_MAX,
  },
  {
    type: 'repeat',
    reps: 4,
    zone: 'Z4',
    work: { distance_km: 0.5, pace_min: Z4_MIN, pace_max: Z4_MAX, zone: 'Z4' },
    recovery: {
      distance_km: 0.2,
      pace_min: Z1_MIN,
      pace_max: Z1_MAX,
      zone: 'Z1',
    },
  },
  {
    type: 'cooldown',
    zone: 'Z1',
    distance_km: 1,
    pace_min: Z1_MIN,
    pace_max: Z1_MAX,
  },
];

const intervalRoute = (workPace: number) =>
  gps([
    { m: 1000, pace: 410 },
    ...Array.from({ length: 4 }, () => [
      { m: 500, pace: workPace },
      { m: 200, pace: 410 },
    ]).flat(),
    { m: 1000, pace: 410 },
  ]);

const TODAY = '2026-06-20';

const qualityWorkout = (id: string, date: string): Row => ({
  id,
  plan_id: 'plan-1',
  user_id: 'user-1',
  status: 'completed',
  scheduled_date: date,
  instructions_json: intervalSegments(),
});

/** Treino futuro, ainda pendente — é o que a reaplicação de pace deve tocar. */
const futureWorkout = (id: string, date: string): Row => ({
  id,
  plan_id: 'plan-1',
  user_id: 'user-1',
  status: 'pending',
  scheduled_date: date,
  instructions_json: intervalSegments(),
});

interface Scenario {
  workPace?: number;
  workPaces?: number[];
  efforts?: number;
  vdot?: number | null;
  history?: Row[];
}

function scenario(opts: Scenario = {}) {
  const n = opts.efforts ?? MIN_QUALITY_EFFORTS;
  const paces =
    opts.workPaces ?? Array.from({ length: n }, () => opts.workPace ?? 265);

  const done = paces.map((_, i) =>
    qualityWorkout(`q${i}`, `2026-06-${String(2 + i * 5).padStart(2, '0')}`),
  );
  const routes = paces.map((pace, i) => ({
    workout_id: `q${i}`,
    raw_data: intervalRoute(pace),
  }));

  return buildMock({
    training_plans: [
      { id: 'plan-1', vdot_current: opts.vdot === undefined ? 40 : opts.vdot },
    ],
    workouts: [
      ...done,
      futureWorkout('f1', '2026-06-25'),
      futureWorkout('f2', '2026-07-02'),
      // Passado e pendente (o atleta não marcou): NÃO deve ser reprecificado.
      { ...futureWorkout('past', '2026-06-10') },
    ],
    workout_routes: routes,
    workout_briefings: [
      { id: 'b1', workout_id: 'f1', content: 'texto com o pace antigo' },
      { id: 'b2', workout_id: 'past', content: 'briefing de treino passado' },
    ],
    plan_vdot_history: opts.history ?? [],
  });
}

describe('VdotService — reestimativa', () => {
  let service: VdotService;

  const build = async (opts: Scenario = {}) => {
    const built = scenario(opts);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VdotService,
        { provide: SupabaseService, useValue: built.mock },
        PaceCalculatorService,
      ],
    }).compile();
    service = module.get(VdotService);
    return built.tables;
  };

  // ───────────────────────────────────────────────────────────────────────────
  describe('sobe', () => {
    it('3 treinos consistentemente mais rápidos → +1, e SÓ +1', async () => {
      const tables = await build({ workPace: 265 });

      const change = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        6,
        TODAY,
      );

      expect(change).not.toBeNull();
      expect(change!.direction).toBe('up');
      expect(change!.vdotBefore).toBe(40);
      expect(change!.vdotAfter).toBe(40 + VDOT_STEP);

      // O passo é fixo: mesmo que o esforço implique um VDOT muito maior, o
      // plano anda um ponto. Um treino excepcional não é uma capacidade nova.
      const implied = (
        tables.plan_vdot_history[0].evidence as {
          efforts: Array<{ implied_vdot: number }>;
        }
      ).efforts.map((e) => e.implied_vdot);
      expect(Math.max(...implied)).toBeGreaterThan(41);
      expect(change!.vdotAfter).toBe(41);
    });

    it('grava vdot_current, histórico e o motivo determinístico', async () => {
      const tables = await build({ workPace: 265 });
      await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY);

      expect(tables.training_plans[0].vdot_current).toBe(41);

      const hist = tables.plan_vdot_history;
      expect(hist).toHaveLength(1);
      expect(hist[0].source).toBe('reestimate');
      expect(hist[0].vdot_before).toBe(40);
      expect(hist[0].vdot_after).toBe(41);
      expect(hist[0].week_number).toBe(6);
      expect(hist[0].sample_size).toBe(MIN_QUALITY_EFFORTS);
      expect(String(hist[0].reason)).toContain('3 treinos de qualidade');
      expect(Number(hist[0].avg_delta_seconds)).toBeLessThan(
        -MIN_DELTA_SEC_BEYOND_BAND,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('desce', () => {
    it('3 treinos consistentemente mais lentos → −1', async () => {
      const tables = await build({ workPace: 360 });

      const change = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        6,
        TODAY,
      );

      expect(change!.direction).toBe('down');
      expect(change!.vdotAfter).toBe(39);
      expect(tables.training_plans[0].vdot_current).toBe(39);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O teste anti-montanha-russa. É o mais importante do arquivo: o custo de um
  // falso positivo é reescrever o plano inteiro de alguém.
  // ───────────────────────────────────────────────────────────────────────────
  describe('NÃO move', () => {
    it('menos treinos que o mínimo, ainda que todos rápidos', async () => {
      const tables = await build({
        efforts: MIN_QUALITY_EFFORTS - 1,
        workPace: 250,
      });

      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
      expect(tables.training_plans[0].vdot_current).toBe(40);
      expect(tables.plan_vdot_history).toHaveLength(0);
    });

    it('um treino DENTRO da faixa trava a mudança — execução correta não é sinal', async () => {
      // Dois voando, um exatamente no alvo. A regra exige unanimidade.
      const tables = await build({ workPaces: [250, 250, 305] });

      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
      expect(tables.training_plans[0].vdot_current).toBe(40);
    });

    it('rápido, mas dentro da margem — a tolerância da faixa não é evidência', async () => {
      // ~292 s/km: abaixo da faixa, mas menos que MIN_DELTA_SEC_BEYOND_BAND.
      const tables = await build({ workPace: 292 });

      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
      expect(tables.training_plans[0].vdot_current).toBe(40);
    });

    it('direções opostas se anulam', async () => {
      await build({ workPaces: [250, 360, 250] });
      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
    });

    it('plano sem VDOT gravado (anterior à Fase 3, ou walk/run)', async () => {
      const tables = await build({ vdot: null, workPace: 250 });
      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
      expect(tables.plan_vdot_history).toHaveLength(0);
    });

    it('no teto do modelo não há passo a dar', async () => {
      const tables = await build({ vdot: 70, workPace: 200 });
      expect(
        await service.reestimateForPlan('user-1', 'plan-1', 6, TODAY),
      ).toBeNull();
      expect(tables.training_plans[0].vdot_current).toBe(70);
    });

    it('um treino vota UMA vez — a mesma evidência não empurra de novo', async () => {
      const tables = await build({ workPace: 265 });
      const first = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        6,
        TODAY,
      );
      expect(first).not.toBeNull();

      // Sem treino de qualidade novo, a semana seguinte não move nada — mesmo
      // com os mesmos três desempenhos ótimos ainda no banco.
      const second = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        7,
        TODAY,
      );
      expect(second).toBeNull();
      expect(tables.training_plans[0].vdot_current).toBe(41);
      expect(tables.plan_vdot_history).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('aplicação dos paces', () => {
    it('reescreve SÓ os treinos futuros, e só o pace', async () => {
      const tables = await build({ workPace: 265 });
      const antes = JSON.parse(
        JSON.stringify(
          tables.workouts.find((w) => w.id === 'past')!.instructions_json,
        ),
      );

      const change = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        6,
        TODAY,
      );
      expect(change!.workoutsRepriced).toBe(2); // f1 e f2

      const futuro = tables.workouts.find((w) => w.id === 'f1')!
        .instructions_json as Array<Record<string, unknown>>;
      const work = (futuro[1] as { work: { pace_min: number } }).work;

      // VDOT 41 é mais rápido que 40 → o alvo de Z4 baixa.
      expect(work.pace_min).toBeLessThan(Z4_MIN);

      // Volume e estrutura intactos — é a fronteira com a Fase 6.
      expect(work).toHaveProperty('distance_km', 0.5);
      expect(futuro).toHaveLength(3);
      expect((futuro[1] as { reps: number }).reps).toBe(4);
      expect((futuro[0] as { zone: string }).zone).toBe('Z1');

      // Treino no passado não se toca: reescrever o alvo de algo já corrido
      // reescreveria a história, e um insight já fechado passaria a descrever
      // uma prescrição que nunca existiu.
      expect(
        tables.workouts.find((w) => w.id === 'past')!.instructions_json,
      ).toEqual(antes);
    });

    it('apaga os briefings dos treinos tocados — e só deles', async () => {
      const tables = await build({ workPace: 265 });
      const change = await service.reestimateForPlan(
        'user-1',
        'plan-1',
        6,
        TODAY,
      );

      expect(change!.briefingsInvalidated).toBe(1);
      const ids = tables.workout_briefings.map((b) => b.workout_id);
      // O de `f1` some (regenera com o pace novo); o do passado permanece.
      expect(ids).not.toContain('f1');
      expect(ids).toContain('past');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('semeadura', () => {
    it('grava o VDOT inicial e abre o histórico', async () => {
      const tables = await build();
      await service.seedForPlan('user-1', 'plan-1', 42.37);

      expect(tables.training_plans[0].vdot_current).toBe(42.4);
      expect(tables.plan_vdot_history[0].source).toBe('seed');
      expect(tables.plan_vdot_history[0].vdot_before).toBeNull();
    });

    it('VDOT ausente (walk/run) não grava nada', async () => {
      const tables = await build();
      await service.seedForPlan('user-1', 'plan-1', null);
      expect(tables.plan_vdot_history).toHaveLength(0);
    });
  });
});
