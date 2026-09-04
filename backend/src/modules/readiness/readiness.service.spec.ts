import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { ReadinessService } from './readiness.service';
import {
  ReadinessAIService,
  ReadinessInput,
  ReadinessVerdict,
} from './readiness-ai.service';

/**
 * O treino planejado chegando ao prompt — e o erro deixando de ser mudo.
 *
 * O que estes testes protegem, em ordem de importância:
 *   1. o treino de HOJE é o do dia de São Paulo, não o do relógio UTC do
 *      Railway (era `new Date().getDay()`);
 *   2. a consulta nunca mais toca `training_plans.current_week`/`is_active` —
 *      colunas inexistentes cujo 42703 era engolido, mantendo o treino fora do
 *      prompt e desligando a regra de prevenção;
 *   3. quando a consulta falha, o erro APARECE no log, o check-in continua
 *      funcionando, e a IA é avisada de que não olhou (em vez de afirmar ao
 *      corredor que ele não tem treino);
 *   4. treino de plano CANCELADO não entra — cancelar um plano não apaga seus
 *      workouts;
 *   5. o id usado é o do parâmetro, nunca outro.
 */

interface Row {
  [key: string]: unknown;
}

/**
 * Mock de Supabase com estado. Derivado do de `vdot.service.spec.ts`, com três
 * diferenças exigidas por este service:
 *
 *  - expõe `from` ALÉM de `getClient()`: `getActivityLoadData` usa
 *    `this.supabaseService.from(...)` direto, enquanto o resto usa `getClient()`;
 *  - grava `calls` (tabela, select, eq, in) para as asserções negativas — é
 *    assim que se prova que uma coluna NÃO é mais consultada;
 *  - aceita `failOn`, para simular o 42703 numa tabela específica.
 */
function buildMock(seed: Record<string, Row[]>, failOn?: Record<string, Row>) {
  const tables = JSON.parse(JSON.stringify(seed)) as Record<string, Row[]>;
  const calls = {
    tables: [] as string[],
    selects: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
  };
  let autoId = 0;

  const from = jest.fn((table: string) => {
    if (!tables[table]) tables[table] = [];
    calls.tables.push(table);

    const preds: Array<(row: Row) => boolean> = [];
    let pending: 'select' | 'insert' | 'upsert' = 'select';
    let payload: Row = {};

    const matches = (row: Row) => preds.every((p) => p(row));

    const apply = (): { data: Row[]; error: Row | null } => {
      if (failOn?.[table]) return { data: [], error: failOn[table] };
      if (pending === 'insert' || pending === 'upsert') {
        const created = { id: `row-${++autoId}`, ...payload };
        tables[table].push(created);
        return { data: [created], error: null };
      }
      return { data: tables[table].filter(matches), error: null };
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['order', 'limit', 'not', 'or', 'gte', 'lte', 'gt']) {
      chain[m] = jest.fn(() => chain);
    }
    chain.select = jest.fn((cols?: string) => {
      if (typeof cols === 'string') calls.selects.push(cols);
      return chain;
    });
    chain.eq = jest.fn((c: string, v: unknown) => {
      calls.eq.push([c, v]);
      preds.push((r) => r[c] === v);
      return chain;
    });
    chain.in = jest.fn((c: string, vals: unknown[]) => {
      calls.in.push([c, vals]);
      preds.push((r) => vals.includes(r[c]));
      return chain;
    });
    chain.insert = jest.fn((d: Row) => {
      pending = 'insert';
      payload = d;
      return chain;
    });
    chain.upsert = jest.fn((d: Row) => {
      pending = 'upsert';
      payload = d;
      return chain;
    });
    chain.single = jest.fn(() => {
      const { data, error } = apply();
      return Promise.resolve({
        data: data[0] ?? null,
        error: error ?? (data[0] ? null : { message: 'no rows' }),
      });
    });
    chain.maybeSingle = jest.fn(() => {
      const { data, error } = apply();
      return Promise.resolve({ data: data[0] ?? null, error });
    });
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => Promise.resolve(apply()).then(onF, onR);

    return chain;
  });

  const service = { getClient: jest.fn(() => ({ from })), from };
  return { mock: service as unknown as SupabaseService, tables, calls };
}

const USER = 'c40efbbd-d792-4561-ad15-0ecc0d9fda84';
const OUTRO = '2a85ccc8-e7c3-479f-a99c-8876d0083ceb';

const answers = { sleep: 4, legs: 3, mood: 5, stress: 4, motivation: 5 };

const verdict: ReadinessVerdict = {
  readiness_score: 80,
  status_color: 'green',
  status_label: 'Sinal verde',
  ai_analysis: { headline: 'h', reasoning: 'r', plan_adjustment: 'p' },
  metrics_summary: [],
  generated_at: '2026-03-09T10:00:00.000Z',
};

function workout(over: Partial<Row> = {}): Row {
  return {
    id: 'w1',
    user_id: USER,
    plan_id: 'plan-ativo',
    type: 'intervals',
    title: null,
    objective: 'Estímulo de VO2max',
    distance_km: 8,
    scheduled_date: '2026-03-09',
    scheduled_time: '06:00:00',
    is_race_day: false,
    status: 'pending',
    ...over,
  };
}

/**
 * 02:00 UTC do dia 10 = 23:00 do dia 9 em São Paulo.
 * A janela onde o dia UTC e o dia SP DISCORDAM — é ela que expõe o bug antigo.
 */
const AGORA_UTC = new Date('2026-03-10T02:00:00.000Z');

describe('ReadinessService — treino planejado', () => {
  let aiService: { analyzeReadiness: jest.Mock };

  async function build(
    seed: Record<string, Row[]>,
    failOn?: Record<string, Row>,
  ) {
    const { mock, calls } = buildMock(
      {
        readiness_history: [],
        users: [{ id: USER }],
        activities: [],
        training_plans: [{ id: 'plan-ativo', user_id: USER, status: 'active' }],
        workouts: [],
        ...seed,
      },
      failOn,
    );

    aiService = {
      analyzeReadiness: jest.fn().mockResolvedValue({ ...verdict }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReadinessService,
        { provide: SupabaseService, useValue: mock },
        { provide: ReadinessAIService, useValue: aiService },
        {
          provide: NotificationService,
          useValue: { scheduleRecoveryAnalysisNotification: jest.fn() },
        },
      ],
    }).compile();

    return { service: moduleRef.get(ReadinessService), calls };
  }

  /** O que efetivamente foi entregue ao prompt. */
  const inputDaIA = (): ReadinessInput => {
    const [primeiraChamada] = aiService.analyzeReadiness.mock
      .calls as unknown[][];
    return primeiraChamada[0] as ReadinessInput;
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(AGORA_UTC);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('usa o dia de SÃO PAULO para separar hoje de amanhã', async () => {
    // Às 02:00Z do dia 10, o dia SP ainda é 9. O código antigo lia
    // `new Date().getDay()` (UTC) e teria trocado os dois.
    const { service } = await build({
      workouts: [
        workout({
          id: 'hoje',
          scheduled_date: '2026-03-09',
          type: 'intervals',
        }),
        workout({
          id: 'amanha',
          scheduled_date: '2026-03-10',
          type: 'long_run',
        }),
      ],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout).toMatchObject({ type: 'intervals' });
    expect(inputDaIA().tomorrowWorkout).toMatchObject({ type: 'long_run' });
  });

  it('nunca consulta current_week nem is_active; usa status=active', async () => {
    const { service, calls } = await build({ workouts: [workout()] });

    await service.analyzeReadiness(USER, answers);

    expect(calls.eq).not.toContainEqual(['is_active', true]);
    expect(calls.selects.join(' ')).not.toMatch(/current_week/);
    expect(calls.selects.join(' ')).not.toMatch(/plan_json/);
    expect(calls.eq).toContainEqual(['status', 'active']);
  });

  it('busca hoje e amanhã numa ÚNICA query de workouts', async () => {
    const { service, calls } = await build({ workouts: [workout()] });

    await service.analyzeReadiness(USER, answers);

    expect(calls.tables.filter((t) => t === 'workouts')).toHaveLength(1);
    expect(calls.in).toContainEqual([
      'scheduled_date',
      ['2026-03-09', '2026-03-10'],
    ]);
  });

  it('erro do PostgREST vira log de ERRO, não silêncio — e o check-in sobrevive', async () => {
    const erro = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const { service } = await build(
      {},
      {
        workouts: {
          code: '42703',
          message: 'column workouts.foo does not exist',
          details: null,
        },
      },
    );

    // (i) o check-in NÃO cai
    await expect(
      service.analyzeReadiness(USER, answers),
    ).resolves.toMatchObject({ status_color: 'green' });

    // (ii) o erro aparece, com o código
    expect(erro.mock.calls.flat().join(' ')).toContain('42703');

    // (iii) a IA sabe que não olhou — e não que "não há treino"
    expect(inputDaIA().workoutLookupFailed).toBe(true);
    expect(inputDaIA().todayWorkout).toBeUndefined();
  });

  it('sem treino de verdade, lookupFailed é falso (o oposto do caso acima)', async () => {
    const { service } = await build({ workouts: [] });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().workoutLookupFailed).toBe(false);
    expect(inputDaIA().todayWorkout).toBeUndefined();
  });

  it('ignora treino pendente de plano CANCELADO', async () => {
    // Cancelar um plano só muda `training_plans.status` — os workouts ficam.
    const { service } = await build({
      training_plans: [
        { id: 'plan-morto', user_id: USER, status: 'cancelled' },
        { id: 'plan-ativo', user_id: USER, status: 'active' },
      ],
      workouts: [workout({ id: 'fantasma', plan_id: 'plan-morto' })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout).toBeUndefined();
  });

  it('mantém treino manual (plan_id null) mesmo sem plano ativo', async () => {
    const { service } = await build({
      training_plans: [],
      workouts: [
        workout({
          id: 'manual',
          plan_id: null,
          type: 'easy_run',
          title: 'Corrida do parque',
        }),
      ],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout).toMatchObject({
      type: 'easy_run',
      title: 'Corrida do parque',
    });
  });

  it('title NULL cai para objective — o insert de plano não grava title', async () => {
    const { service } = await build({
      workouts: [workout({ title: null, objective: 'Estímulo de VO2max' })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout.title).toBe('Estímulo de VO2max');
  });

  it('sem title e sem objective, usa o rótulo do tipo', async () => {
    const { service } = await build({
      workouts: [workout({ title: null, objective: null, type: 'long_run' })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout.title).toBe('Longão');
  });

  it('dia de prova recebe intensidade Máxima', async () => {
    const { service } = await build({
      workouts: [
        workout({
          type: 'race_day',
          is_race_day: true,
          title: 'DIA DA PROVA — Maratona SP',
        }),
      ],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout).toMatchObject({
      title: 'DIA DA PROVA — Maratona SP',
      intensity: 'Máxima',
    });
  });

  it('fartlek é Alta intensidade — o mapa incompleto desligava a regra', async () => {
    const { service } = await build({
      workouts: [workout({ type: 'fartlek' })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout.intensity).toBe('Alta');
  });

  it('distance_km null não vira "null" no prompt', async () => {
    const { service } = await build({
      workouts: [workout({ distance_km: null })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(inputDaIA().todayWorkout.distance_km).toBeUndefined();
  });

  it('lê apenas os treinos do userId recebido', async () => {
    const { service, calls } = await build({
      workouts: [
        workout({ id: 'meu', user_id: USER, type: 'tempo' }),
        workout({ id: 'do-outro', user_id: OUTRO, type: 'long_run' }),
      ],
    });

    await service.analyzeReadiness(USER, answers);

    expect(calls.eq).toContainEqual(['user_id', USER]);
    expect(calls.eq).not.toContainEqual(['user_id', OUTRO]);
    expect(inputDaIA().todayWorkout).toMatchObject({ type: 'tempo' });
    expect(JSON.stringify(inputDaIA())).not.toContain(OUTRO);
  });

  it('só considera treinos pendentes', async () => {
    const { service, calls } = await build({
      workouts: [workout({ status: 'completed' })],
    });

    await service.analyzeReadiness(USER, answers);

    expect(calls.eq).toContainEqual(['status', 'pending']);
    expect(inputDaIA().todayWorkout).toBeUndefined();
  });
});
