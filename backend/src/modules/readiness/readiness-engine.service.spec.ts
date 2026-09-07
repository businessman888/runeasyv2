import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { ReadinessEngineService } from './readiness-engine.service';
import { addDaysStr } from '../training/helpers/plan-window.helper';

/**
 * O MOTOR CONTRA O BANCO — e a invariante que importa mais que todas:
 *
 *   **NADA aqui pode derrubar um check-in.**
 *
 * O corredor já respondeu as cinco perguntas quando este código roda. Uma
 * consulta que falha pode custar a modulação por carga ou o baseline; não pode
 * custar a resposta. Cada teste abaixo derruba UMA consulta e exige que o
 * veredito continue saindo, com a degradação nomeada.
 *
 * O segundo tema é o sentido do JOIN. `activities.workout_id` está NULL em 14
 * de 14 linhas de produção; o vínculo vivo é `workouts.activity_id`. Ligar pelo
 * lado errado devolve tipo `null` para 100% das corridas, todas pesam 1,0, e
 * nada avisa — a mesma forma do 42703 que a R.0 consertou. Há teste para o
 * sentido, não só para o resultado.
 */

interface Row {
  [k: string]: unknown;
}

/** 15:00 SP do dia 10 → dia de readiness 2026-03-10, série até o dia 09. */
const AGORA = new Date('2026-03-10T18:00:00.000Z');
const DIA = '2026-03-10';
const FIM_DA_SERIE = addDaysStr(DIA, -1); // 2026-03-09
const USER = 'user-1';

const answers = { sleep: 4, legs: 4, mood: 4, stress: 4, motivation: 4 };

/** Uma corrida de `min` minutos, `k` dias antes do FIM da série. */
function atividade(id: string, k: number, min = 45): Row {
  return {
    id,
    user_id: USER,
    start_date: `${addDaysStr(FIM_DA_SERIE, -k)}T13:00:00.000Z`,
    moving_time: min * 60,
    type: 'Run',
  };
}

/** Rotina semanal que passa o piso com folga: 4x/semana por 8 semanas. */
function rotina(): Row[] {
  const out: Row[] = [];
  for (let k = 0; k <= 55; k++) {
    if ([0, 2, 4, 6].includes(k % 7)) out.push(atividade(`a-${k}`, k));
  }
  return out;
}

/**
 * Mock focado no engine: ele só LÊ, e sempre `await` no builder (nunca
 * `.single()`). Registra as chamadas para as asserções sobre o formato da
 * consulta — é assim que se prova o sentido do join.
 */
function buildMock(
  seed: Record<string, Row[]>,
  failOn: Record<string, Row> = {},
) {
  const calls = {
    tables: [] as string[],
    selects: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    gte: [] as Array<[string, unknown]>,
    order: [] as Array<[string, boolean]>,
  };

  const from = jest.fn((table: string) => {
    calls.tables.push(table);
    const preds: Array<(r: Row) => boolean> = [];

    const resolver = () => {
      if (failOn[table]) return { data: null, error: failOn[table] };
      const rows = (seed[table] ?? []).filter((r) => preds.every((p) => p(r)));
      return { data: rows, error: null };
    };

    const chain: Record<string, unknown> = {};
    chain.select = jest.fn((cols?: string) => {
      if (cols) calls.selects.push(cols);
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
    // Só timestamps ISO chegam aqui, e a comparação lexicográfica entre eles é
    // a mesma que a cronológica. `texto()` recusa qualquer outra coisa em vez
    // de virar '[object Object]' silenciosamente.
    const texto = (v: unknown): string => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      throw new Error(`comparação com valor não-textual: ${typeof v}`);
    };

    chain.gte = jest.fn((c: string, v: unknown) => {
      calls.gte.push([c, v]);
      preds.push((r) => texto(r[c]) >= texto(v));
      return chain;
    });
    chain.lt = jest.fn((c: string, v: unknown) => {
      preds.push((r) => texto(r[c]) < texto(v));
      return chain;
    });
    chain.order = jest.fn((c: string, o?: { ascending?: boolean }) => {
      calls.order.push([c, o?.ascending !== false]);
      return chain;
    });
    chain.limit = jest.fn(() => chain);
    chain.then = (
      onF: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => Promise.resolve(resolver()).then(onF, onR);

    return chain;
  });

  return {
    mock: { getClient: () => ({ from }) } as unknown as SupabaseService,
    calls,
  };
}

async function build(
  seed: Record<string, Row[]>,
  failOn: Record<string, Row> = {},
) {
  const { mock, calls } = buildMock(seed, failOn);
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ReadinessEngineService,
      { provide: SupabaseService, useValue: mock },
    ],
  }).compile();
  return { engine: moduleRef.get(ReadinessEngineService), calls };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(AGORA);
  // As degradações logam; silenciar mantém a saída da suíte legível.
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── A invariante ─────────────────────────────────────────────────────────────

describe('nenhuma falha de consulta derruba o check-in', () => {
  it('activities falha → carga indisponível, veredito sai mesmo assim', async () => {
    const { engine } = await build(
      { activities: rotina(), workouts: [], readiness_history: [] },
      { activities: { code: '42703', message: 'column does not exist' } },
    );

    const r = await engine.compute(USER, answers);

    expect(r.degradations).toContain('load');
    expect(r.decision.load.reason).toBe('indisponivel');
    expect(r.decision.load.modulates).toBe(false);
    expect(r.decision.load.ratio).toBeNull();
    // O veredito continua existindo, e é 100% do quiz.
    expect(r.decision.score).toBe(r.decision.baseScore);
    expect(r.decision.color).toBe('green');
  });

  it('workouts falha → pesos caem para 1,0, veredito sai', async () => {
    const { engine } = await build(
      { activities: rotina(), workouts: [], readiness_history: [] },
      { workouts: { code: '08006', message: 'connection failure' } },
    );

    const r = await engine.compute(USER, answers);

    expect(r.degradations).toContain('weights');
    // A carga continua sendo calculada — só sem a ponderação por tipo.
    expect(r.decision.load.reason).toBe('ok');
    expect(Number.isFinite(r.decision.score)).toBe(true);
  });

  it('readiness_history falha → baseline vazio, modo ABSOLUTO (o default seguro)', async () => {
    const { engine } = await build(
      { activities: rotina(), workouts: [], readiness_history: [] },
      { readiness_history: { code: '08006', message: 'connection failure' } },
    );

    const r = await engine.compute(USER, answers);

    expect(r.degradations).toContain('baseline');
    for (const s of r.decision.signals) {
      expect(s.mode).toBe('absoluto');
      expect(s.n).toBe(0);
    }
    expect(r.decision.baseScore).toBe(75); // 4 em tudo, régua absoluta
  });

  it('TUDO falha ao mesmo tempo e ainda assim sai um veredito', async () => {
    const erro = { code: '08006', message: 'down' };
    const { engine } = await build(
      { activities: [], workouts: [], readiness_history: [] },
      { activities: erro, workouts: erro, readiness_history: erro },
    );

    const r = await engine.compute(USER, answers);

    expect(r.decision.score).toBe(75);
    expect(r.decision.color).toBe('green');
    expect(r.decision.load.modulates).toBe(false);
  });
});

// ── O sentido do join ────────────────────────────────────────────────────────

describe('o tipo do treino vem por workouts.activity_id', () => {
  it('consulta workouts por activity_id — NUNCA activities.workout_id', async () => {
    const { engine, calls } = await build({
      activities: [atividade('a-1', 1)],
      workouts: [],
      readiness_history: [],
    });

    await engine.compute(USER, answers);

    // O filtro existe e é sobre a coluna certa.
    expect(calls.in.some(([col]) => col === 'activity_id')).toBe(true);
    // E o lado errado nunca é tocado.
    expect(calls.selects.join(' ')).not.toContain('workout_id');
    expect(calls.eq.some(([col]) => col === 'workout_id')).toBe(false);
  });

  it('o tipo encontrado realmente pondera a carga', async () => {
    const semTipo = await build({
      activities: [atividade('a-1', 1, 60)],
      workouts: [],
      readiness_history: [],
    });
    const comTiro = await build({
      activities: [atividade('a-1', 1, 60)],
      workouts: [
        {
          id: 'w1',
          user_id: USER,
          activity_id: 'a-1',
          type: 'intervals',
          source: 'plan',
        },
      ],
      readiness_history: [],
    });

    const a = await semTipo.engine.loadSignalFor(USER);
    const b = await comTiro.engine.loadSignalFor(USER);

    // 60 min × 1,0 contra 60 min × 1,6 — se o join estivesse errado, iguais.
    // Precisão 2 porque `computeLoadSignal` arredonda a duas casas.
    expect(b.acuteMinPerDay).toBeGreaterThan(a.acuteMinPerDay);
    expect(b.acuteMinPerDay / a.acuteMinPerDay).toBeCloseTo(1.6, 2);
  });

  it('atividade sem workout ligado pesa 1,0 em vez de quebrar', async () => {
    const { engine } = await build({
      activities: [atividade('orfa', 1, 60)],
      workouts: [
        {
          id: 'w1',
          user_id: USER,
          activity_id: 'outra',
          type: 'intervals',
          source: 'plan',
        },
      ],
      readiness_history: [],
    });

    const s = await engine.loadSignalFor(USER);
    expect(s.acuteMinPerDay).toBeCloseTo(60 / 7, 2);
  });

  it('duas linhas no mesmo activity_id têm desempate DETERMINÍSTICO', async () => {
    // Estado possível e documentado. Sem desempate, o peso da sessão mudaria
    // entre leituras e o score oscilaria sem o corredor mudar nada.
    const linhas = [
      {
        id: 'w-free',
        user_id: USER,
        activity_id: 'a-1',
        type: 'free_run',
        source: 'free',
      },
      {
        id: 'w-plan',
        user_id: USER,
        activity_id: 'a-1',
        type: 'intervals',
        source: 'plan',
      },
    ];

    const naOrdem = await build({
      activities: [atividade('a-1', 1, 60)],
      workouts: linhas,
      readiness_history: [],
    });
    const invertido = await build({
      activities: [atividade('a-1', 1, 60)],
      workouts: [...linhas].reverse(),
      readiness_history: [],
    });

    const a = await naOrdem.engine.loadSignalFor(USER);
    const b = await invertido.engine.loadSignalFor(USER);

    expect(a.acuteMinPerDay).toBe(b.acuteMinPerDay);
    // O treino de plano descreve o esforço melhor que a corrida livre.
    expect(a.acuteMinPerDay).toBeCloseTo((60 * 1.6) / 7, 2);
  });
});

// ── As fronteiras da consulta ────────────────────────────────────────────────

describe('o formato das consultas', () => {
  it('activities é lida em ordem ASCENDENTE', async () => {
    // Com `desc` + `limit`, o que cai fora do corte é o dado MAIS ANTIGO —
    // exatamente a janela crônica, deflacionando o denominador.
    const { engine, calls } = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: [],
    });

    await engine.compute(USER, answers);

    const ordem = calls.order.find(([col]) => col === 'start_date');
    expect(ordem).toBeDefined();
    expect(ordem[1]).toBe(true);
  });

  it('a série termina ONTEM — o treino de hoje ainda não aconteceu', async () => {
    // Uma corrida hoje (dia 10) não pode entrar: o check-in é de manhã.
    const { engine } = await build({
      activities: [
        ...rotina(),
        {
          id: 'hoje',
          user_id: USER,
          start_date: `${DIA}T13:00:00.000Z`,
          moving_time: 7200,
          type: 'Run',
        },
      ],
      workouts: [],
      readiness_history: [],
    });

    const semHoje = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: [],
    });

    const a = await engine.loadSignalFor(USER);
    const b = await semHoje.engine.loadSignalFor(USER);
    expect(a.acuteMinPerDay).toBe(b.acuteMinPerDay);
  });

  it('o check-in de HOJE não entra no próprio baseline', async () => {
    const doDia = {
      user_id: USER,
      created_at: `${DIA}T12:00:00.000Z`,
      check_in_answers: {
        sleep: 1,
        legs: 1,
        mood: 1,
        stress: 1,
        motivation: 1,
      },
    };
    const deOntem = {
      user_id: USER,
      created_at: `${addDaysStr(DIA, -1)}T12:00:00.000Z`,
      check_in_answers: {
        sleep: 5,
        legs: 5,
        mood: 5,
        stress: 5,
        motivation: 5,
      },
    };

    const { engine } = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: [doDia, deOntem],
    });

    const r = await engine.compute(USER, answers);

    // Só a linha de ontem entra. Se a de hoje entrasse, n seria 2.
    expect(r.baselines.sleep.n).toBe(1);
    expect(r.baselines.sleep.median).toBe(5);
  });

  it('lê apenas o histórico do próprio corredor', async () => {
    const { engine } = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: [
        {
          user_id: 'outro',
          created_at: `${addDaysStr(DIA, -1)}T12:00:00.000Z`,
          check_in_answers: {
            sleep: 1,
            legs: 1,
            mood: 1,
            stress: 1,
            motivation: 1,
          },
        },
      ],
    });

    const r = await engine.compute(USER, answers);
    expect(r.baselines.sleep.n).toBe(0);
  });
});

// ── O caminho feliz ──────────────────────────────────────────────────────────

describe('caminho completo', () => {
  it('sem degradação, com carga em regime e baseline maduro', async () => {
    const historico = Array.from({ length: 15 }, (_, i) => ({
      user_id: USER,
      created_at: `${addDaysStr(DIA, -(i + 1))}T12:00:00.000Z`,
      check_in_answers: {
        sleep: 3,
        legs: 3,
        mood: 3,
        stress: 3,
        motivation: 3,
      },
    }));

    const { engine } = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: historico,
    });

    const r = await engine.compute(USER, answers);

    expect(r.degradations).toEqual([]);
    expect(r.decision.load.reason).toBe('ok');
    expect(r.baselines.sleep.n).toBe(15);
    expect(r.baselines.sleep.median).toBe(3);
    // Baseline 3 respondendo 4 → acima do próprio normal.
    expect(r.decision.signals.find((s) => s.dimension === 'sleep').mode).toBe(
      'misto',
    );
  });

  it('loadSignalFor não toca readiness_history — é o atalho do status', async () => {
    const { engine, calls } = await build({
      activities: rotina(),
      workouts: [],
      readiness_history: [],
    });

    await engine.loadSignalFor(USER);
    expect(calls.tables).not.toContain('readiness_history');
  });
});
