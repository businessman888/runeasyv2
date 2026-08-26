import { PlanAdaptationService, PatchItem } from './plan-adaptation.service';

/**
 * Troca de Dias T.0 — o pré-check da data DESTINO, na camada TypeScript.
 *
 * ── O QUE ESTE ARQUIVO PROVA, E O QUE ELE NÃO PROVA ──────────────────────────
 *
 * PROVA que o serviço recusa um patch com data no passado SEM ir ao banco, e —
 * o que mais importa nesta sub-fase — que ele NÃO recusa nada que a Fase 3, a
 * 6.2 e a 6.3 mandem. Isso é verificável aqui porque é decisão de JavaScript.
 *
 * NÃO prova a guarda de verdade: essa é o `RAISE … RE422` de
 * `apply_plan_adaptation`, e vive em `test/integration/plan-adaptation.int-spec`
 * contra Postgres real — com um teste de paridade entre as duas. Um mock de
 * `.rpc()` não executa SQL nenhum, e foi exatamente assim que a mina 2 da 6.1
 * atravessou 95 testes verdes.
 */

const TODAY = '2026-08-15';

/** Client Supabase mínimo: só `.rpc()`, que é tudo que `apply()` toca. */
function mockClient(result: Record<string, unknown> = { applied: true }) {
  // Implementação tipada em vez de `jest.fn().mockResolvedValue()`: as asserções
  // leem `mock.calls`, e com o mock cru cada acesso vira `any` — o que o lint do
  // projeto proíbe. Assim `calls[0][0]` é `string` e `calls[0][1]` é o objeto de
  // parâmetros, sem cast nenhum.
  const rpc = jest.fn<
    Promise<unknown>,
    [fn: string, params: { p_patch: PatchItem[] }]
  >();
  rpc.mockResolvedValue({ data: result, error: null });
  return {
    rpc,
    service: new PlanAdaptationService({
      getClient: () => ({ rpc }),
    } as never),
  };
}

const base = {
  userId: 'user-1',
  planId: 'plan-1',
  expectedDigest: 'digest-abc',
  todayStr: TODAY,
  meta: { source: 'manual' as const },
};

describe('PlanAdaptationService.apply — a fronteira do DESTINO', () => {
  it('recusa data no PASSADO sem chamar a RPC', async () => {
    const { rpc, service } = mockClient();

    const r = await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-1',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-08-10' },
        },
      ],
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('new_date_in_past');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recusa data em HOJE — o dia inteiro é congelado', async () => {
    const { rpc, service } = mockClient();

    const r = await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-1',
          expected: { status: 'pending' },
          set: { scheduled_date: TODAY },
        },
      ],
    });

    expect(r.reason).toBe('new_date_in_past');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('NÃO devolve `currentDigest` — a recusa não é retentável', async () => {
    // `revision_conflict` e `row_conflict` vêm com digest porque quem os recebe
    // deve recalcular a preview. Aqui recalcular não muda nada: a data
    // continuaria no passado. Entregar um digest convidaria ao retry infinito.
    const { service } = mockClient();

    const r = await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-1',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-01-01' },
        },
      ],
    });

    expect(r.currentDigest).toBeUndefined();
  });

  it('UM item ruim derruba o patch inteiro, antes de qualquer ida ao banco', async () => {
    const { rpc, service } = mockClient();

    const r = await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-ok',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-08-20' }, // futuro, válido
        },
        {
          workout_id: 'w-ruim',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-08-12' }, // passado
        },
      ],
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('new_date_in_past');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('aceita data no FUTURO e segue para a RPC', async () => {
    const { rpc, service } = mockClient({
      applied: true,
      adaptation_id: 'a-1',
      affected: { workouts: 1, briefings: 0 },
    });

    const r = await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-1',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-08-20' },
        },
      ],
    });

    expect(r.applied).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('apply_plan_adaptation');
  });

  it('loga em ERROR, não em WARN — a recusa denuncia defeito', async () => {
    // Com os dois modos da Troca de Dias corretos, isto é impossível em uso
    // normal: o Modo 1 começa na próxima semana e o Modo 2 só oferece dias
    // futuros. Um ERROR aqui é sempre a rede de segurança avisando que a camada
    // de cima falhou — WARN esconderia isso no ruído.
    const { service } = mockClient();
    const spy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await service.apply({
      ...base,
      kind: 'swap_days',
      patch: [
        {
          workout_id: 'w-1',
          expected: { status: 'pending' },
          set: { scheduled_date: '2026-08-01' },
        },
      ],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('w-1');
    expect(spy.mock.calls[0][0]).toContain('2026-08-01');
    spy.mockRestore();
  });
});

/**
 * ── A PROVA DE NO-OP ─────────────────────────────────────────────────────────
 *
 * A razão de a T.0 ir isolada e primeiro. Estes são os formatos EXATOS de patch
 * que as três features em produção montam hoje — copiados de
 * `volume-relief.service.ts` (6.2 e 6.3) e `vdot.service.ts` (F3).
 *
 * Nenhum deles carrega `scheduled_date`. O pré-check é, para elas, código morto:
 * `isEditableTargetDate(undefined)` sempre devolve `editable`.
 */
describe('PlanAdaptationService.apply — NO-OP para F3, 6.2 e 6.3', () => {
  const casos: Array<[string, { patch: PatchItem[]; extra?: object }]> = [
    [
      '6.2 — aliviar UM treino (distance_km + instructions_json)',
      {
        patch: [
          {
            workout_id: 'w-1',
            expected: { status: 'pending', instructions_md5: 'abc123' },
            set: { distance_km: 5.4, instructions_json: [{ type: 'main' }] },
          },
        ],
      },
    ],
    [
      '6.3 — aliviar a SEMANA (patch multi-item)',
      {
        patch: [
          {
            workout_id: 'w-1',
            expected: { status: 'pending', instructions_md5: 'aaa' },
            set: { distance_km: 5, instructions_json: [{ type: 'main' }] },
          },
          {
            workout_id: 'w-2',
            expected: { status: 'pending', instructions_md5: 'bbb' },
            set: { distance_km: 9, instructions_json: [{ type: 'main' }] },
          },
        ],
      },
    ],
    [
      'F3 — reprecificação de VDOT (instructions_json + plano + histórico)',
      {
        patch: [
          {
            workout_id: 'w-1',
            expected: { status: 'pending', instructions_md5: 'ccc' },
            set: { instructions_json: [{ type: 'main', pace_min: 300 }] },
          },
        ],
        extra: {
          planPatch: { vdot_current: 42 },
          vdotHistory: {
            vdot_before: 41,
            vdot_after: 42,
            source: 'reestimate',
          },
        },
      },
    ],
    [
      '6.2 — reduzir frequência (só status)',
      {
        patch: [
          {
            workout_id: 'w-1',
            expected: { status: 'pending' },
            set: { status: 'skipped' as const },
          },
        ],
      },
    ],
  ];

  it.each(casos)('%s chega à RPC intacto', async (_label, { patch, extra }) => {
    const { rpc, service } = mockClient({
      applied: true,
      adaptation_id: 'a-1',
    });

    const r = await service.apply({
      ...base,
      kind: 'reduzir_volume',
      patch,
      ...(extra ?? {}),
    });

    expect(r.applied).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    // O patch chega byte a byte como foi montado — o pré-check não filtra,
    // não reordena e não reescreve nada.
    expect(rpc.mock.calls[0][1].p_patch).toEqual(patch);
  });

  it('nenhum caller de produção põe `scheduled_date` no `set`', () => {
    // Se um dia algum puser, este teste continua verde — ele descreve o estado
    // atual, não o proíbe. O que ele documenta é POR QUE a T.0 é no-op para
    // elas: a guarda depende de uma chave que nenhuma delas usa.
    const todosOsSets = casos.flatMap(([, c]) => c.patch.map((p) => p.set));
    for (const s of todosOsSets) {
      expect(s).not.toHaveProperty('scheduled_date');
    }
  });
});
