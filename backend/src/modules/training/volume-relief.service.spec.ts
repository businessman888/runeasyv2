/**
 * Fase 6.2 — os GUARDS e o caminho de conflito do alívio.
 *
 * O que este arquivo prova: quem pode ser aliviado, quem não pode e por quê, e
 * que um conflito vira RESULTADO com preview recalculada — nunca exceção.
 *
 * O que ele NÃO prova, de propósito: atomicidade, lock, CAS e idempotência. Nada
 * disso existe em JavaScript. Isso é provado contra Postgres de verdade em
 * `test/integration/volume-relief.int-spec.ts`. Foi justamente mockar a parte
 * transacional que deixou a mina 2 da 6.1 passar por 95 testes verdes.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../database';
import { VolumePlannerService } from '../../common/volume-planner';
import { PlanAdaptationService } from './plan-adaptation.service';
import { VolumeReliefService } from './volume-relief.service';

const TODAY = '2026-08-17';
const PLAN = 'plan-1';
const USER = 'user-1';

const segments = () => [
  { type: 'warmup', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
  { type: 'main', distance_km: 6, pace_min: 360, pace_max: 390, zone: 'Z2' },
  { type: 'cooldown', distance_km: 2, pace_min: 400, pace_max: 440, zone: 'Z1' },
];

interface Ctx {
  plan?: Record<string, unknown> | null;
  workout?: Record<string, unknown> | null;
  /** O treino aparece na janela editável do banco? */
  inEditableWindow?: boolean;
  applyResult?: Record<string, unknown>;
}

const build = async (ctx: Ctx = {}) => {
  const plan =
    ctx.plan === undefined
      ? {
          id: PLAN,
          status: 'active',
          generation_status: 'complete',
          duration_weeks: 12,
          goal: '10k',
          goal_type: 'general',
          race_distance: null,
        }
      : ctx.plan;

  const workout =
    ctx.workout === undefined
      ? {
          id: 'w-1',
          plan_id: PLAN,
          status: 'pending',
          scheduled_date: '2026-08-25',
          is_race_day: false,
          week_number: 3,
        }
      : ctx.workout;

  // Mock mínimo do PostgREST: só os dois `.maybeSingle()` que `resolve` faz.
  const supabase = {
    getClient: () => ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: table === 'training_plans' ? plan : workout,
            error: null,
          }),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseService;

  const applyMock = jest.fn(async (_params: Record<string, any>) => ({
    applied: true,
    replayed: false,
    adaptationId: 'adapt-1',
    affected: { workouts: 1, briefings: 1 },
    ...(ctx.applyResult ?? {}),
  }));

  const foundation = {
    todayStr: () => TODAY,
    getStateDigest: jest.fn(async () => 'digest-abc'),
    assertPlanEditable: jest.fn(async () => ({ editable: true })),
    loadEditableWorkouts: jest.fn(async () =>
      ctx.inEditableWindow === false
        ? []
        : [
            {
              id: 'w-1',
              week_number: 3,
              scheduled_date: '2026-08-25',
              status: 'pending',
              type: 'long_run',
              title: 'Rodagem longa',
              distance_km: 10,
              instructions_json: segments(),
              instructions_md5: 'md5-original',
            },
          ],
    ),
    apply: applyMock,
  } as unknown as PlanAdaptationService;

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VolumeReliefService,
      { provide: SupabaseService, useValue: supabase },
      { provide: PlanAdaptationService, useValue: foundation },
      VolumePlannerService,
    ],
  }).compile();

  return {
    service: module.get(VolumeReliefService),
    applyMock,
    foundation,
  };
};

describe('VolumeReliefService — preview', () => {
  it('oferece os dois níveis com o resultado JÁ CALCULADO', async () => {
    const { service } = await build();
    const p: any = await service.preview(USER, 'w-1');

    expect(p.available).toBe(true);
    expect(p.digest).toBe('digest-abc');
    expect(p.current.distanceKm).toBe(10);

    expect(p.options).toEqual([
      { level: 'light', targetPct: 20, achievedPct: 20, distanceKm: 8, durationSeconds: 0 },
      { level: 'strong', targetPct: 35, achievedPct: 35, distanceKm: 6.5, durationSeconds: 0 },
    ]);
  });

  it('busca o digest DEPOIS de ler o alvo', async () => {
    // Ordem importa: o digest tem de descrever o mesmo estado que a preview
    // está mostrando, não um anterior a ele.
    const { service, foundation } = await build();
    const order: string[] = [];
    (foundation.loadEditableWorkouts as jest.Mock).mockImplementation(
      async () => {
        order.push('window');
        return [
          {
            id: 'w-1',
            week_number: 3,
            scheduled_date: '2026-08-25',
            status: 'pending',
            type: 'long_run',
            title: 'Rodagem longa',
            distance_km: 10,
            instructions_json: segments(),
            instructions_md5: 'md5-original',
          },
        ];
      },
    );
    (foundation.getStateDigest as jest.Mock).mockImplementation(async () => {
      order.push('digest');
      return 'digest-abc';
    });

    await service.preview(USER, 'w-1');
    expect(order).toEqual(['window', 'digest']);
  });

  it('recusa quando não há o que reduzir', async () => {
    const { service, foundation } = await build();
    (foundation.loadEditableWorkouts as jest.Mock).mockResolvedValue([
      {
        id: 'w-1',
        scheduled_date: '2026-08-25',
        status: 'pending',
        instructions_json: [{ type: 'main', distance_km: 1, pace_min: 360 }],
        instructions_md5: 'md5',
      },
    ]);

    const p: any = await service.preview(USER, 'w-1');
    expect(p.available).toBe(false);
    expect(p.reason).toBe('nothing_to_reduce');
    expect(p.message).toMatch(/volume mínimo/);
  });
});

describe('VolumeReliefService — guards', () => {
  const cases: Array<[string, Ctx, string]> = [
    ['sem plano ativo', { plan: null }, 'no_active_plan'],
    ['treino inexistente', { workout: null }, 'not_found'],
    [
      'treino de HOJE (hoje inteiro é congelado)',
      { workout: { id: 'w-1', plan_id: PLAN, status: 'pending', scheduled_date: TODAY, is_race_day: false, week_number: 3 } },
      'today_or_past',
    ],
    [
      'treino no passado',
      { workout: { id: 'w-1', plan_id: PLAN, status: 'pending', scheduled_date: '2026-08-10', is_race_day: false, week_number: 3 } },
      'today_or_past',
    ],
    [
      'treino já concluído',
      { workout: { id: 'w-1', plan_id: PLAN, status: 'completed', scheduled_date: '2026-08-25', is_race_day: false, week_number: 3 } },
      'not_pending',
    ],
    [
      'dia de PROVA — invariante do contrato',
      { workout: { id: 'w-1', plan_id: PLAN, status: 'pending', scheduled_date: '2026-08-25', is_race_day: true, week_number: 3 } },
      'race_day',
    ],
    [
      'treino de outro plano',
      { workout: { id: 'w-1', plan_id: 'plan-outro', status: 'pending', scheduled_date: '2026-08-25', is_race_day: false, week_number: 3 } },
      'not_in_active_plan',
    ],
    [
      'corrida livre/manual (plan_id nulo)',
      { workout: { id: 'w-1', plan_id: null, status: 'pending', scheduled_date: '2026-08-25', is_race_day: false, week_number: 3 } },
      'not_in_active_plan',
    ],
    [
      'semana de POLIMENTO — o volume já é reduzido de propósito',
      { workout: { id: 'w-1', plan_id: PLAN, status: 'pending', scheduled_date: '2026-08-25', is_race_day: false, week_number: 12 } },
      'taper_week',
    ],
    [
      'sumiu da janela editável entre a leitura e o cálculo',
      { inEditableWindow: false },
      'not_pending',
    ],
  ];

  it.each(cases)('preview recusa: %s', async (_label, ctx, reason) => {
    const { service } = await build(ctx);
    const p: any = await service.preview(USER, 'w-1');
    expect(p.available).toBe(false);
    expect(p.reason).toBe(reason);
    // Toda recusa tem texto — "não pode" sem explicação vira ticket de suporte.
    expect(typeof p.message).toBe('string');
    expect(p.message.length).toBeGreaterThan(0);
  });

  it.each(cases)('apply recusa e NÃO escreve: %s', async (_label, ctx, reason) => {
    const { service, applyMock } = await build(ctx);
    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-abc');
    expect(r.applied).toBe(false);
    expect(r.reason).toBe(reason);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('VolumeReliefService — apply', () => {
  it('monta o patch com o md5 do banco e NÃO toca pace', async () => {
    const { service, applyMock } = await build();
    await service.apply(USER, 'w-1', 'light', 'digest-abc');

    const params = applyMock.mock.calls[0][0] as any;
    expect(params.kind).toBe('reduzir_volume');
    expect(params.expectedDigest).toBe('digest-abc');

    const [item] = params.patch;
    expect(item.workout_id).toBe('w-1');
    // O CAS por linha: sem o md5, uma reprecificação da F3 passaria despercebida.
    expect(item.expected).toEqual({
      status: 'pending',
      instructions_md5: 'md5-original',
    });
    expect(item.set.distance_km).toBe(8);

    const segs = item.set.instructions_json;
    expect(segs[1].distance_km).toBe(4);
    expect(segs.map((s: any) => [s.pace_min, s.pace_max])).toEqual([
      [400, 440],
      [360, 390],
      [400, 440],
    ]);
  });

  it('usa o digest RECEBIDO, nunca um recém-buscado', async () => {
    const { service, applyMock } = await build();
    await service.apply(USER, 'w-1', 'strong', 'digest-DA-PREVIEW');

    const params = applyMock.mock.calls[0][0] as any;
    expect(params.expectedDigest).toBe('digest-DA-PREVIEW');
  });

  it('devolve o resultado no sucesso', async () => {
    const { service } = await build();
    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-abc');

    expect(r).toMatchObject({
      applied: true,
      replayed: false,
      distanceKm: 8,
      achievedPct: 20,
      briefingsInvalidated: 1,
    });
  });

  it('conflito de versão vira RESULTADO com preview recalculada', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'revision_conflict' },
    });

    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-velho');

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');
    expect(r.message).toMatch(/plano mudou/);
    // A preview INTEIRA, não só o digest: o alvo pode ter mudado junto.
    expect(r.preview.available).toBe(true);
    expect(r.preview.options).toHaveLength(2);
  });

  it('conflito de LINHA (a F3 reprecificou) também recalcula', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'row_conflict' },
    });

    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-abc');
    expect(r.reason).toBe('row_conflict');
    expect(r.preview.available).toBe(true);
  });

  it('NUNCA lança em conflito — um throw viraria "verifique sua conexão"', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'revision_conflict' },
    });
    await expect(
      service.apply(USER, 'w-1', 'light', 'x'),
    ).resolves.toBeDefined();
  });

  it('falha de infraestrutura não recalcula preview', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'rpc_error' },
    });

    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-abc');
    expect(r.applied).toBe(false);
    expect(r.preview).toBeUndefined();
  });

  it('replay é sucesso, não erro', async () => {
    const { service } = await build({
      applyResult: { applied: true, replayed: true },
    });

    const r: any = await service.apply(USER, 'w-1', 'light', 'digest-abc');
    expect(r.applied).toBe(true);
    expect(r.replayed).toBe(true);
  });
});
