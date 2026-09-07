import { Test, TestingModule } from '@nestjs/testing';
import { AIRouterService } from '../../common/ai';
import { ReadinessAIService } from './readiness-ai.service';
import {
  ReadinessDecision,
  decideReadiness,
} from './helpers/readiness-score.helper';
import type { LoadSignal } from './helpers/load-series.helper';
import {
  Baselines,
  READINESS_DIMENSIONS,
} from './helpers/subjective-baseline.helper';

/**
 * O CHECK-IN NUNCA MORRE POR CAUSA DA IA.
 *
 * Hoje ele morre: `ReadinessAIService` fazia `throw`, e `AIRouterService.call`
 * lança por chave ausente, por bloco de texto ausente, por `JSON.parse` de
 * resposta truncada e por qualquer erro de rede — cada um virando um 500 em
 * cima de um corredor que já tinha respondido o quiz.
 *
 * Com o veredito decidido em código, o texto é a única coisa que depende da
 * rede, e texto tem substituto. Todo teste aqui é sobre isso.
 *
 * A segunda exigência é do mobile: `ReadinessResultScreen` desreferencia
 * `ai_analysis.headline`, `.reasoning` e `.plan_adjustment` SEM guarda. Campo
 * vazio não degrada — quebra a tela. Por isso os três são verificados um a um.
 */

const semBaseline: Baselines = READINESS_DIMENSIONS.reduce((acc, d) => {
  acc[d] = { n: 0, median: null };
  return acc;
}, {} as Baselines);

const SEM_CARGA: LoadSignal = {
  modulates: false,
  reason: 'sem_historico',
  acuteMinPerDay: 0,
  chronicMinPerDay: 0,
  chronicMinPerWeek: 0,
  ratio: null,
  diasDesdeUltimaCorrida: null,
  floorProgress: {
    spanDays: 6,
    runDays: 3,
    missingSpanDays: 8,
    missingRunDays: 3,
  },
};

const COM_CARGA: LoadSignal = {
  modulates: true,
  reason: 'ok',
  acuteMinPerDay: 35,
  chronicMinPerDay: 22,
  chronicMinPerWeek: 154,
  ratio: 1.59,
  diasDesdeUltimaCorrida: 1,
  floorProgress: null,
};

function decisao(over: Partial<Parameters<typeof decideReadiness>[0]> = {}) {
  return decideReadiness({
    answers: { sleep: 4, legs: 3, mood: 4, stress: 4, motivation: 4 },
    baselines: semBaseline,
    load: SEM_CARGA,
    ...over,
  });
}

async function build(router: Partial<AIRouterService>) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      ReadinessAIService,
      { provide: AIRouterService, useValue: router },
    ],
  }).compile();
  return mod.get(ReadinessAIService);
}

const routerOk = (data: unknown) => ({
  isAvailable: true,
  call: jest.fn().mockResolvedValue({ data }),
});

const completo = (a: {
  headline: string;
  reasoning: string;
  plan_adjustment: string;
}) => {
  expect(a.headline.trim().length).toBeGreaterThan(0);
  expect(a.reasoning.trim().length).toBeGreaterThan(0);
  expect(a.plan_adjustment.trim().length).toBeGreaterThan(0);
};

describe('narrate — nunca rejeita, nunca devolve campo vazio', () => {
  it('router indisponível (sem ANTHROPIC_API_KEY) → narrativa local', async () => {
    const service = await build({
      isAvailable: false,
    } as Partial<AIRouterService>);
    const a = await service.narrate(decisao(), {});
    completo(a);
  });

  it('call REJEITA (rede, chave, JSON truncado) → narrativa local', async () => {
    const service = await build({
      isAvailable: true,
      call: jest
        .fn()
        .mockRejectedValue(new SyntaxError('Unexpected end of JSON')),
    } as unknown as Partial<AIRouterService>);

    await expect(service.narrate(decisao(), {})).resolves.toBeDefined();
    completo(await service.narrate(decisao(), {}));
  });

  it('resposta VAZIA → os três campos vêm do fallback', async () => {
    const service = await build(
      routerOk({}) as unknown as Partial<AIRouterService>,
    );
    completo(await service.narrate(decisao(), {}));
  });

  it('resposta PARCIAL → só o que faltou é substituído', async () => {
    // O caso que o all-or-nothing do insight semanal deixaria passar: headline
    // boa, reasoning em branco. No mobile isso renderiza `undefined`.
    const service = await build(
      routerOk({
        headline: 'Tudo certo hoje',
        reasoning: '   ',
      }) as unknown as Partial<AIRouterService>,
    );

    const a = await service.narrate(decisao(), {});
    expect(a.headline).toBe('Tudo certo hoje');
    completo(a);
  });

  it('campos de tipo errado não passam', async () => {
    const service = await build(
      routerOk({
        headline: 42,
        reasoning: null,
        plan_adjustment: [],
      }) as unknown as Partial<AIRouterService>,
    );
    completo(await service.narrate(decisao(), {}));
  });

  it('resposta boa é preservada inteira', async () => {
    const service = await build(
      routerOk({
        headline: 'Pernas pesadas hoje',
        reasoning: 'Suas pernas vieram em 3/5.',
        plan_adjustment: 'Reduza a intensidade.',
      }) as unknown as Partial<AIRouterService>,
    );
    const a = await service.narrate(decisao(), {});
    expect(a).toEqual({
      headline: 'Pernas pesadas hoje',
      reasoning: 'Suas pernas vieram em 3/5.',
      plan_adjustment: 'Reduza a intensidade.',
    });
  });
});

describe('o prompt não deixa a IA falar de carga que o motor não sabe', () => {
  it('abaixo do piso, o bloco CARGA proíbe explicitamente', async () => {
    const router = routerOk({
      headline: 'a',
      reasoning: 'b',
      plan_adjustment: 'c',
    });
    const service = await build(router as unknown as Partial<AIRouterService>);
    await service.narrate(decisao({ load: SEM_CARGA }), {});

    const [args] = router.call.mock.calls as Array<[{ userMessage: string }]>;
    expect(args[0].userMessage).toContain('APRENDENDO');
    expect(args[0].userMessage).toContain('NÃO mencione carga');
  });

  it('com carga válida, a razão vai no prompt', async () => {
    const router = routerOk({
      headline: 'a',
      reasoning: 'b',
      plan_adjustment: 'c',
    });
    const service = await build(router as unknown as Partial<AIRouterService>);
    await service.narrate(decisao({ load: COM_CARGA }), {});

    const [args] = router.call.mock.calls as Array<[{ userMessage: string }]>;
    expect(args[0].userMessage).toContain('1.59');
    expect(args[0].userMessage).not.toContain('NÃO mencione carga');
  });

  it('o veredito é entregue como JÁ DECIDIDO', async () => {
    const router = routerOk({
      headline: 'a',
      reasoning: 'b',
      plan_adjustment: 'c',
    });
    const service = await build(router as unknown as Partial<AIRouterService>);
    await service.narrate(decisao(), {});

    const [args] = router.call.mock.calls as Array<[{ userMessage: string }]>;
    expect(args[0].userMessage).toContain('JÁ DECIDIDO');
    expect(args[0].userMessage).toContain('RECOMENDAÇÃO JÁ DECIDIDA');
  });
});

describe('metrics_summary é montado em código', () => {
  it('quatro tiles, todos com value e icon', () => {
    const service = new ReadinessAIService({} as AIRouterService);
    const tiles = service.buildMetricsSummary(decisao());

    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.value.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
    }
  });

  it('usa a resposta REAL do corredor, não um número inventado', () => {
    // O prompt antigo pedia `"value": "Xh XXm"` — horas de sono que não existem
    // em lugar nenhum do payload. As linhas gravadas têm alucinação ou o
    // placeholder literal.
    const service = new ReadinessAIService({} as AIRouterService);
    const tiles = service.buildMetricsSummary(
      decisao({
        answers: { sleep: 2, legs: 5, mood: 3, stress: 4, motivation: 4 },
      }),
    );

    expect(tiles.find((t) => t.label === 'Sono')?.value).toBe('2/5');
    expect(tiles.find((t) => t.label === 'Pernas')?.value).toBe('5/5');
    expect(JSON.stringify(tiles)).not.toContain('Relative Effort');
    expect(JSON.stringify(tiles)).not.toContain('h 30m');
  });

  it('o tile de carga mostra o progresso do piso — sem campo novo na UI', () => {
    const service = new ReadinessAIService({} as AIRouterService);
    const tile = service
      .buildMetricsSummary(decisao({ load: SEM_CARGA }))
      .find((t) => t.label === 'Carga de treino');

    expect(tile?.value).toBe('Aprendendo');
    expect(tile?.sublabel).toContain('8 dias');
    expect(tile?.sublabel).toContain('3 corridas');
  });

  it('o tile de carga distingue "não consegui olhar" de "pouco volume"', () => {
    const service = new ReadinessAIService({} as AIRouterService);

    const indisponivel = service
      .buildMetricsSummary(
        decisao({
          load: { ...SEM_CARGA, reason: 'indisponivel', floorProgress: null },
        }),
      )
      .find((t) => t.label === 'Carga de treino');
    expect(indisponivel?.value).toBe('Indisponível');

    const pouco = service
      .buildMetricsSummary(
        decisao({
          load: {
            ...SEM_CARGA,
            reason: 'carga_irrelevante',
            floorProgress: null,
          },
        }),
      )
      .find((t) => t.label === 'Carga de treino');
    expect(pouco?.value).toBe('Pouco volume');
  });
});

describe('a narrativa determinística conta o que importa', () => {
  it('cita as dimensões que mais pesaram, com o valor que o corredor digitou', async () => {
    const service = await build({
      isAvailable: false,
    } as Partial<AIRouterService>);
    const a = await service.narrate(
      decisao({
        answers: { sleep: 1, legs: 1, mood: 5, stress: 5, motivation: 5 },
      }),
      {},
    );
    expect(a.reasoning).toContain('as pernas (1/5)');
    expect(a.reasoning).toContain('o sono (1/5)');
  });

  it('NÃO cita a pontuação — ela já está na tela', async () => {
    const service = await build({
      isAvailable: false,
    } as Partial<AIRouterService>);
    const d = decisao();
    const a = await service.narrate(d, {});
    expect(a.reasoning).not.toContain(String(d.score));
  });

  it('conta a pausa em vez de acusar excesso de carga', async () => {
    const service = await build({
      isAvailable: false,
    } as Partial<AIRouterService>);
    const a = await service.narrate(
      decisao({
        load: { ...COM_CARGA, diasDesdeUltimaCorrida: 21 },
      }),
      {},
    );
    expect(a.reasoning).toContain('21 dias');
  });

  it('abaixo do piso, não menciona carga em frase nenhuma', async () => {
    const service = await build({
      isAvailable: false,
    } as Partial<AIRouterService>);
    const a = await service.narrate(decisao({ load: SEM_CARGA }), {});
    expect(a.reasoning.toLowerCase()).not.toContain('carga');
    expect(a.reasoning.toLowerCase()).not.toContain('volume');
  });
});
