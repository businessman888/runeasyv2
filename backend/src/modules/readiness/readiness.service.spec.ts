import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { ReadinessService } from './readiness.service';
import { ReadinessEngineService } from './readiness-engine.service';
import {
  PlannedContext,
  ReadinessAIService,
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
 * Colunas cuja comparação é TEMPORAL — `gte`/`lte` sobre elas usam `Date.parse`.
 *
 * ⚠️ Declarado, não inferido, e a coerção não é opcional. Os seeds destes testes
 * escrevem `'2026-03-09T04:00:00Z'` enquanto o código de produção compara com
 * `'2026-03-09T06:00:00.000Z'`. A comparação de string crua até funciona quando
 * os dois lados têm exatamente o mesmo formato — e quebra em silêncio no dia em
 * que um seed omitir os milissegundos ou o `Z`. Pior: `scheduled_date`
 * ('YYYY-MM-DD') contra um timestamp ISO compara errado de um jeito que PARECE
 * certo, porque o prefixo bate.
 */
const DATE_COLUMNS = new Set([
  'created_at',
  'start_date',
  'scheduled_date',
  'updated_at',
  'completed_at',
]);

/**
 * Mock de Supabase com estado. Derivado do de `vdot.service.spec.ts`, com quatro
 * diferenças exigidas por este service:
 *
 *  - expõe `from` ALÉM de `getClient()`: parte do service usa
 *    `this.supabaseService.from(...)` direto, o resto usa `getClient()`;
 *  - grava `calls` (tabela, select, eq, in, gte, lte, order, limit) para as
 *    asserções negativas — é assim que se prova que uma coluna NÃO é mais
 *    consultada;
 *  - aceita `failOn`, para simular o 42703 numa tabela específica;
 *  - **`gte`/`lte`/`gt`/`lt`, `order` e `limit` FILTRAM DE VERDADE.**
 *
 * ── POR QUE O ÚLTIMO ITEM É UM PRÉ-REQUISITO, E NÃO UM CAPRICHO ───────────────
 *
 * Até aqui esses seis métodos eram passthrough no-op. Duas consequências, e as
 * duas invalidavam testes que pareciam sólidos:
 *
 *  1. **A janela do check-in não tinha cobertura nenhuma.** `hasCheckedInToday`
 *     filtra por `.gte('created_at', inicioDaJanela)`; com o `gte` inerte, uma
 *     linha de ONTEM era devolvida como se fosse de hoje. A suíte só passava
 *     porque `readiness_history` era sempre semeada vazia. Trocar o corte de
 *     meia-noite para 03:00 não conseguiria quebrar teste nenhum.
 *  2. **`.order(desc).limit(1).single()` devolvia a ordem de INSERÇÃO** — ou
 *     seja, o check-in mais ANTIGO. Qualquer teste chamado "devolve o veredito
 *     de hoje" era vazio: passaria contra uma implementação que devolvesse
 *     sempre a primeira linha da tabela.
 */
function buildMock(seed: Record<string, Row[]>, failOn?: Record<string, Row>) {
  const tables = JSON.parse(JSON.stringify(seed)) as Record<string, Row[]>;
  const calls = {
    tables: [] as string[],
    selects: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    gte: [] as Array<[string, unknown]>,
    lte: [] as Array<[string, unknown]>,
    order: [] as Array<[string, boolean]>,
    limit: [] as number[],
  };
  let autoId = 0;

  /** Compara uma célula com um valor, coagindo datas. `NULL` nunca satisfaz. */
  const cmp = (
    row: Row,
    col: string,
    v: unknown,
    op: (a: number | string, b: number | string) => boolean,
  ): boolean => {
    const cell = row[col];
    if (cell === null || cell === undefined) return false; // como no SQL
    if (DATE_COLUMNS.has(col)) {
      const a = Date.parse(String(cell));
      const b = Date.parse(String(v));
      if (!Number.isNaN(a) && !Number.isNaN(b)) return op(a, b);
    }
    return op(cell as string, v as string);
  };

  const from = jest.fn((table: string) => {
    if (!tables[table]) tables[table] = [];
    calls.tables.push(table);

    const preds: Array<(row: Row) => boolean> = [];
    let pending: 'select' | 'insert' | 'upsert' = 'select';
    let payload: Row = {};
    let sort: { col: string; asc: boolean } | null = null;
    let lim: number | null = null;

    const matches = (row: Row) => preds.every((p) => p(row));

    const apply = (): { data: Row[]; error: Row | null } => {
      if (failOn?.[table]) return { data: [], error: failOn[table] };
      if (pending === 'insert' || pending === 'upsert') {
        const created = { id: `row-${++autoId}`, ...payload };
        tables[table].push(created);
        return { data: [created], error: null };
      }

      let rows = tables[table].filter(matches);

      if (sort) {
        const { col, asc } = sort;
        rows = [...rows].sort((x, y) => {
          const a = DATE_COLUMNS.has(col)
            ? Date.parse(String(x[col]))
            : (x[col] as number);
          const b = DATE_COLUMNS.has(col)
            ? Date.parse(String(y[col]))
            : (y[col] as number);
          if (a === b) return 0;
          return (a < b ? -1 : 1) * (asc ? 1 : -1);
        });
      }

      if (lim !== null) rows = rows.slice(0, lim);

      return { data: rows, error: null };
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['not', 'or']) {
      chain[m] = jest.fn(() => chain);
    }

    const comparadores: Array<
      [string, (a: number | string, b: number | string) => boolean]
    > = [
      ['gte', (a, b) => a >= b],
      ['lte', (a, b) => a <= b],
      ['gt', (a, b) => a > b],
      ['lt', (a, b) => a < b],
    ];
    for (const [m, op] of comparadores) {
      chain[m] = jest.fn((c: string, v: unknown) => {
        if (m === 'gte') calls.gte.push([c, v]);
        if (m === 'lte') calls.lte.push([c, v]);
        preds.push((r) => cmp(r, c, v, op));
        return chain;
      });
    }

    chain.order = jest.fn((c: string, opts?: { ascending?: boolean }) => {
      const asc = opts?.ascending !== false;
      calls.order.push([c, asc]);
      sort = { col: c, asc };
      return chain;
    });
    chain.limit = jest.fn((n: number) => {
      calls.limit.push(n);
      lim = n;
      return chain;
    });
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

/**
 * Histórico que PASSA o piso — 4x/semana por 8 semanas, 45 min cada.
 *
 * Precisa existir em todo teste que exercita o caminho completo do check-in:
 * desde a R.1, `analyzeReadiness` recusa ANTES da IA quando o corredor está
 * abaixo do piso (span <14 dias ou <6 dias com corrida). Sem este histórico,
 * um teste sobre o treino planejado nunca chegaria ao prompt.
 *
 * O último dia é 2 dias antes de `AGORA` porque a série de carga termina no
 * último dia FECHADO.
 */
function historicoQuePassaOPiso(): Row[] {
  const out: Row[] = [];
  // AGORA = 2026-03-10T02:00:00Z → dia de readiness 2026-03-09, série até 03-08.
  const base = Date.UTC(2026, 2, 8);
  for (let k = 0; k <= 55; k++) {
    if (![0, 2, 4, 6].includes(k % 7)) continue;
    const d = new Date(base - k * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      id: `hist-${k}`,
      user_id: USER,
      start_date: `${iso}T13:00:00.000Z`,
      moving_time: 45 * 60,
      type: 'Run',
    });
  }
  return out;
}

describe('ReadinessService — treino planejado', () => {
  let aiService: { narrate: jest.Mock; buildMetricsSummary: jest.Mock };

  async function build(
    seed: Record<string, Row[]>,
    failOn?: Record<string, Row>,
  ) {
    const { mock, calls } = buildMock(
      {
        readiness_history: [],
        users: [{ id: USER }],
        // Por padrão o corredor PASSA o piso; quem quiser testar o bloqueio
        // sobrescreve com `{ activities: [] }`.
        activities: historicoQuePassaOPiso(),
        training_plans: [{ id: 'plan-ativo', user_id: USER, status: 'active' }],
        workouts: [],
        ...seed,
      },
      failOn,
    );

    aiService = {
      narrate: jest.fn().mockResolvedValue({ ...verdict.ai_analysis }),
      buildMetricsSummary: jest.fn().mockReturnValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReadinessService,
        // O engine real, com o MESMO Supabase mockado: as consultas de carga e
        // de baseline passam pelo mock de verdade em vez de um stub, então o
        // caminho degradado (tabela vazia → sem histórico) é o que roda aqui.
        ReadinessEngineService,
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

  /**
   * O CONTEXTO de treino entregue ao narrador.
   *
   * Depois da R.1 a IA recebe `(decision, contexto, userId)` — o veredito já
   * decidido no 1º argumento, o treino no 2º. Estes testes seguem sendo sobre o
   * treino, então olham o 2º.
   */
  const inputDaIA = (): PlannedContext => {
    const [primeiraChamada] = aiService.narrate.mock.calls as unknown[][];
    return primeiraChamada[1] as PlannedContext;
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

    // Uma consulta só POR DATA, com os dois dias juntos. Antes eram duas
    // sequenciais e idênticas, cada uma carregando `plan_json` inteiro.
    //
    // Contar `calls.tables` não serve mais: desde a R.1 o motor também lê
    // `workouts`, por `activity_id`, para descobrir o tipo de cada corrida. São
    // consultas diferentes com propósitos diferentes; o que este teste protege
    // é a busca por data.
    const porData = calls.in.filter(([col]) => col === 'scheduled_date');
    expect(porData).toHaveLength(1);
    expect(porData[0][1]).toEqual(['2026-03-09', '2026-03-10']);
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

    // (i) o check-in NÃO cai — e sai com veredito, não com "aprendendo".
    //
    // `workouts` falhando derruba DUAS coisas ao mesmo tempo: a busca do treino
    // planejado e a descoberta do tipo de cada corrida (a ponderação da carga).
    // A segunda degrada para peso 1,0 e o piso continua sendo satisfeito pelas
    // `activities`, que não falharam.
    const r = await service.analyzeReadiness(USER, answers);
    expect(r.kind).toBe('ok');
    expect(r).toMatchObject({ verdict: { status_color: 'green' } });

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

  /**
   * Privacidade — o log NÃO pode carregar dado de saúde.
   *
   * Havia um `logger.log(..., JSON.stringify(insertData))` no caminho de
   * gravação, e `insertData` contém `check_in_answers` (sono, dor, humor,
   * estresse, motivação autorrelatados), `ai_analysis` e `metrics_summary` —
   * que repetem esses valores em texto corrido. Rodava a cada check-in, colado
   * a um `user_id`, direto para a retenção de log do Railway.
   *
   * O teste captura TODOS os níveis de log de um check-in completo e procura
   * as chaves que só aparecem quando alguém serializa o objeto inteiro. É essa
   * a regressão que ele existe para pegar.
   */
  /**
   * A JANELA DO CHECK-IN — o corte das 03:00 de São Paulo.
   *
   * Estes testes não existiam, e não PODIAM existir: o mock tratava `.gte()`
   * como no-op, então qualquer linha semeada em `readiness_history` era
   * devolvida independentemente do timestamp. A suíte só passava porque a tabela
   * era sempre semeada vazia.
   *
   * Com o mock filtrando de verdade, este bloco falha contra o corte à
   * meia-noite e passa contra o corte às 03:00.
   */
  describe('a janela de 03:00 SP', () => {
    const AS_15H_SP_DO_DIA_10 = new Date('2026-03-10T18:00:00.000Z');

    const linhaDeCheckIn = (createdAt: string): Row => ({
      id: 'rh-1',
      user_id: USER,
      created_at: createdAt,
      score: 80,
      status_color: 'green',
      status_label: 'Pronto',
      ai_analysis: { headline: 'h', reasoning: 'r', plan_adjustment: 'p' },
      metrics_summary: [],
      check_in_answers: answers,
    });

    beforeEach(() => {
      jest.setSystemTime(AS_15H_SP_DO_DIA_10);
    });

    it('check-in de 01:00 SP pertence ao dia ANTERIOR — não bloqueia hoje', async () => {
      // 04:00Z = 01:00 SP do dia 10. Com corte à meia-noite isto seria "hoje" e
      // o corredor ficaria sem check-in; com corte às 03:00 é de ontem.
      const { service } = await build({
        readiness_history: [linhaDeCheckIn('2026-03-10T04:00:00.000Z')],
      });

      expect(await service.hasCheckedInToday(USER)).toBeNull();
    });

    it('check-in de 03:00 SP em ponto JÁ é de hoje', async () => {
      const { service } = await build({
        readiness_history: [linhaDeCheckIn('2026-03-10T06:00:00.000Z')],
      });

      expect(await service.hasCheckedInToday(USER)).not.toBeNull();
    });

    it('check-in do meio da tarde é de hoje', async () => {
      const { service } = await build({
        readiness_history: [linhaDeCheckIn('2026-03-10T17:00:00.000Z')],
      });

      expect(await service.hasCheckedInToday(USER)).not.toBeNull();
    });

    it('consulta a janela pela borda das 03:00, não pela meia-noite', async () => {
      const { service, calls } = await build({ readiness_history: [] });
      await service.hasCheckedInToday(USER);

      const janela = calls.gte.find(([col]) => col === 'created_at');
      expect(janela).toBeDefined();
      expect(String(janela[1])).toBe('2026-03-10T06:00:00.000Z');
      // 03:00Z seria meia-noite SP — o corte antigo.
      expect(String(janela[1])).not.toBe('2026-03-10T03:00:00.000Z');
    });

    it('entre vários check-ins da janela, devolve o MAIS RECENTE', async () => {
      // Sem `order`/`limit` reais no mock, este teste devolveria o mais antigo
      // e passaria contra uma implementação que ignorasse a ordenação.
      const { service } = await build({
        readiness_history: [
          { ...linhaDeCheckIn('2026-03-10T07:00:00.000Z'), score: 40 },
          { ...linhaDeCheckIn('2026-03-10T16:00:00.000Z'), score: 90 },
        ],
      });

      const v = await service.hasCheckedInToday(USER);
      expect(v?.verdict.readiness_score).toBe(90);
    });

    it('não devolve o check-in de OUTRO corredor', async () => {
      const { service } = await build({
        readiness_history: [
          { ...linhaDeCheckIn('2026-03-10T16:00:00.000Z'), user_id: OUTRO },
        ],
      });

      expect(await service.hasCheckedInToday(USER)).toBeNull();
    });
  });

  describe('privacidade do log', () => {
    it('não emite o conteúdo do quiz nem do veredito em nenhum nível', async () => {
      const capturado: string[] = [];
      const captura = (...args: unknown[]) => {
        // Serializa argumento não-string em vez de `String(a)`: assim o teste
        // pega tanto `logger.log(msg, JSON.stringify(obj))` quanto
        // `logger.log(msg, obj)` — a segunda forma viraria '[object Object]'
        // e escaparia da asserção, embora o Nest imprima o objeto inteiro.
        capturado.push(
          args
            .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
            .join(' '),
        );
      };
      for (const nivel of [
        'log',
        'warn',
        'error',
        'debug',
        'verbose',
      ] as const) {
        jest.spyOn(Logger.prototype, nivel).mockImplementation(captura);
      }

      const { service } = await build({ workouts: [workout()] });
      await service.analyzeReadiness(USER, answers);

      const tudo = capturado.join('\n');

      // As chaves que só aparecem se o objeto inteiro for serializado.
      expect(tudo).not.toContain('check_in_answers');
      expect(tudo).not.toContain('metrics_summary');
      expect(tudo).not.toContain('ai_analysis');
      // E o conteúdo em si, pelas dimensões do quiz.
      expect(tudo).not.toContain('motivation');
      expect(tudo).not.toContain('"sleep"');

      // O log continua servindo para depurar a escrita.
      expect(tudo).toContain(USER);
      expect(tudo).toContain('score=');
    });
  });
});
