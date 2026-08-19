/**
 * Fase 6.3 — os GUARDS e o transporte do alívio da SEMANA.
 *
 * Arquivo separado do `volume-relief.service.spec.ts` de propósito: aquele
 * cobre a 6.2, está validado no device, e o mock dele é montado para UM treino.
 * Misturar os dois faria uma suíte provada depender de um dublê mais complexo
 * sem necessidade.
 *
 * O que este arquivo prova: qual semana é escolhida, quem é recusado e por quê,
 * e a FORMA do patch multi-item. A atomicidade dele é provada contra Postgres
 * de verdade em `test/integration/week-relief.int-spec.ts`.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../database';
import { VolumePlannerService } from '../../common/volume-planner';
import { PlanAdaptationService } from './plan-adaptation.service';
import { VolumeReliefService } from './volume-relief.service';

const TODAY = '2026-08-17'; // segunda
const PLAN = 'plan-1';
const USER = 'user-1';

const contInuo = (mainKm: number) => [
  { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
  { type: 'main', zone: 'Z2', distance_km: mainKm, pace_min: 360, pace_max: 400 },
  { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
];

/** Semana 1 = corrente (contém hoje). Semana 2 = o ALVO, toda no futuro. */
const TODOS = [
  { id: 'w1', week_number: 1, scheduled_date: '2026-08-17' },
  { id: 'w2', week_number: 1, scheduled_date: '2026-08-20' },
  { id: 'w3', week_number: 2, scheduled_date: '2026-08-24' },
  { id: 'w4', week_number: 2, scheduled_date: '2026-08-26' },
  { id: 'w5', week_number: 2, scheduled_date: '2026-08-29' },
];

const EDITAVEIS = [
  {
    id: 'w2',
    week_number: 1,
    scheduled_date: '2026-08-20',
    status: 'pending',
    type: 'easy_run',
    title: 'Rodagem',
    distance_km: 7,
    instructions_json: contInuo(3),
    instructions_md5: 'md5-w2',
  },
  {
    id: 'w3',
    week_number: 2,
    scheduled_date: '2026-08-24',
    status: 'pending',
    type: 'long_run',
    title: 'Longão',
    distance_km: 12,
    instructions_json: contInuo(8),
    instructions_md5: 'md5-w3',
  },
  {
    id: 'w4',
    week_number: 2,
    scheduled_date: '2026-08-26',
    status: 'pending',
    type: 'tempo',
    title: 'Tempo',
    distance_km: 8,
    instructions_json: contInuo(4),
    instructions_md5: 'md5-w4',
  },
  {
    id: 'w5',
    week_number: 2,
    scheduled_date: '2026-08-29',
    status: 'pending',
    type: 'easy_run',
    title: 'Rodagem',
    distance_km: 7,
    instructions_json: contInuo(3),
    instructions_md5: 'md5-w5',
  },
];

interface Ctx {
  plan?: Record<string, unknown> | null;
  todos?: Array<Record<string, unknown>>;
  editaveis?: Array<Record<string, unknown>>;
  /** Linhas de `plan_adaptations` para o `already_applied`. */
  adaptations?: Array<Record<string, unknown>>;
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

  const supabase = {
    getClient: () => ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          limit: () => Promise.resolve({ data: ctx.adaptations ?? [], error: null }),
          maybeSingle: async () => ({ data: plan, error: null }),
          // `workouts` é consumido sem `.maybeSingle()` — o await cai no `then`.
          then: (resolve: (v: unknown) => void) =>
            resolve({
              data: table === 'workouts' ? (ctx.todos ?? TODOS) : [],
              error: null,
            }),
        };
        return chain;
      },
    }),
  } as unknown as SupabaseService;

  const applyMock = jest.fn(async (_p: Record<string, any>) => ({
    applied: true,
    replayed: false,
    adaptationId: 'adapt-1',
    affected: { workouts: 2, briefings: 1 },
    ...(ctx.applyResult ?? {}),
  }));

  const foundation = {
    todayStr: () => TODAY,
    getStateDigest: jest.fn(async () => 'digest-semana'),
    assertPlanEditable: jest.fn(async () => ({ editable: true })),
    loadEditableWorkouts: jest.fn(async () => ctx.editaveis ?? EDITAVEIS),
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

  return { service: module.get(VolumeReliefService), applyMock, foundation };
};

describe('previewWeek — escolhe a semana SEGUINTE', () => {
  it('alveja a semana 2, não a corrente', async () => {
    const { service } = await build();
    const p: any = await service.previewWeek(USER);

    expect(p.available).toBe(true);
    expect(p.weekNumber).toBe(2);
    // 12 + 8 + 7 = 27 km. O treino da semana 1 (w2) fica de fora.
    expect(p.weekTotalKm).toBe(27);
    expect(p.workoutCount).toBe(3);
  });

  it('a semana CORRENTE não entra — nem o treino editável dela', async () => {
    const { service } = await build();
    const p: any = await service.previewWeek(USER);

    const ids = p.options[0].changes.map((c: any) => c.workoutId);
    expect(ids).not.toContain('w2');
    expect(ids.sort()).toEqual(['w3', 'w4', 'w5']);
  });

  it('marca a qualidade como protegida na preview', async () => {
    const { service } = await build();
    const p: any = await service.previewWeek(USER);

    const tempo = p.options[0].changes.find((c: any) => c.workoutId === 'w4');
    expect(tempo.isProtected).toBe(true);
    expect(tempo.changed).toBe(false);
    expect(tempo.beforeKm).toBe(tempo.afterKm);
  });

  it('busca o digest DEPOIS de ler os treinos', async () => {
    const { service, foundation } = await build();
    const ordem: string[] = [];
    (foundation.loadEditableWorkouts as jest.Mock).mockImplementation(async () => {
      ordem.push('janela');
      return EDITAVEIS;
    });
    (foundation.getStateDigest as jest.Mock).mockImplementation(async () => {
      ordem.push('digest');
      return 'digest-semana';
    });

    await service.previewWeek(USER);
    expect(ordem).toEqual(['janela', 'digest']);
  });
});

describe('previewWeek — recusas', () => {
  it('sem plano ativo', async () => {
    const { service } = await build({ plan: null });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('no_active_plan');
  });

  it('não há semana seguinte — o plano acaba na corrente', async () => {
    const { service } = await build({
      todos: [
        { id: 'w1', week_number: 12, scheduled_date: '2026-08-17' },
        { id: 'w2', week_number: 12, scheduled_date: '2026-08-20' },
      ],
    });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('no_next_week');
    expect(p.message).toMatch(/reta final/);
  });

  it('a semana ALVO é de polimento', async () => {
    // Plano de 12 semanas, meta 10k → taper = semana 12. Corrente = 11.
    const { service } = await build({
      todos: [
        { id: 'a', week_number: 11, scheduled_date: '2026-08-17' },
        { id: 'b', week_number: 12, scheduled_date: '2026-08-24' },
      ],
    });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('taper_week');
    expect(p.message).toMatch(/polimento/);
  });

  it('a semana alvo só tem qualidade — nada a reduzir', async () => {
    const { service } = await build({
      editaveis: [
        { ...EDITAVEIS[2], id: 'w3', type: 'tempo' },
        { ...EDITAVEIS[2], id: 'w4', type: 'intervals' },
      ],
    });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('nothing_to_reduce');
  });

  it('semana por TEMPO (walk/run) é recusada', async () => {
    const { service } = await build({
      editaveis: [
        {
          ...EDITAVEIS[1],
          id: 'w3',
          type: 'walk_run',
          instructions_json: [
            { type: 'main', duration_seconds: 1800, pace_min: 480 },
          ],
        },
      ],
    });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(false);
    expect(p.reason).toBe('week_time_based');
  });

  it('já aliviado por este insight — o HISTÓRICO é a fonte de verdade', async () => {
    const { service } = await build({ adaptations: [{ id: 'adapt-anterior' }] });
    const p: any = await service.previewWeek(USER, 'insight-1');
    expect(p.available).toBe(false);
    expect(p.reason).toBe('already_applied');
  });

  it('sem `insightId` não consulta o histórico — a ação avulsa não é travada', async () => {
    const { service } = await build({ adaptations: [{ id: 'adapt-anterior' }] });
    const p: any = await service.previewWeek(USER);
    expect(p.available).toBe(true);
  });
});

describe('applyWeek — o patch multi-item', () => {
  it('manda N itens, cada um com o SEU md5, e nenhum protegido', async () => {
    const { service, applyMock } = await build();
    await service.applyWeek(USER, 'light', 'digest-semana', 'insight-1');

    const params = applyMock.mock.calls[0][0] as any;
    expect(params.kind).toBe('reduzir_volume');
    expect(params.expectedDigest).toBe('digest-semana');

    const ids = params.patch.map((i: any) => i.workout_id).sort();
    expect(ids).toEqual(['w3', 'w5']); // o tempo (w4) não entra
    expect(params.patch).toHaveLength(2);

    // Cada item carrega o md5 daquele treino, não um compartilhado.
    const md5s = params.patch.map((i: any) => i.expected.instructions_md5);
    expect(md5s.sort()).toEqual(['md5-w3', 'md5-w5']);
    for (const item of params.patch) {
      expect(item.expected.status).toBe('pending');
      expect(item.set.distance_km).toBeGreaterThan(0);
      expect(Array.isArray(item.set.instructions_json)).toBe(true);
    }
  });

  it('registra a origem e as métricas no histórico', async () => {
    const { service, applyMock } = await build();
    await service.applyWeek(USER, 'strong', 'digest-semana', 'insight-1');

    const meta = (applyMock.mock.calls[0][0] as any).meta;
    expect(meta.source).toBe('weekly_insight');
    expect(meta.sourceInsightId).toBe('insight-1');
    expect(meta.weekNumber).toBe(2);
    expect(meta.reasonCode).toBe('week_relief_strong');
    // O que torna o padrão "aliviou toda semana" auditável.
    expect(meta.metrics.before_km).toBe(27);
    expect(meta.metrics.workouts_protected).toBe(1);
    expect(meta.metrics.achieved_pct).toBeGreaterThan(0);
  });

  it('sem insight, a origem é manual', async () => {
    const { service, applyMock } = await build();
    await service.applyWeek(USER, 'light', 'digest-semana');
    expect((applyMock.mock.calls[0][0] as any).meta.source).toBe('manual');
  });

  it('devolve o resumo no sucesso', async () => {
    const { service } = await build();
    const r: any = await service.applyWeek(USER, 'light', 'digest-semana');

    expect(r.applied).toBe(true);
    expect(r.weekNumber).toBe(2);
    expect(r.workoutsChanged).toBe(2);
    expect(r.weekTotalKmAfter).toBeLessThan(27);
  });

  it('conflito vira RESULTADO com a preview recalculada', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'revision_conflict' },
    });
    const r: any = await service.applyWeek(USER, 'light', 'digest-velho');

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');
    expect(r.message).toMatch(/plano mudou/);
    expect(r.preview.available).toBe(true);
    expect(r.preview.weekNumber).toBe(2);
  });

  it('conflito de LINHA (um dos N mudou) também recalcula', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'row_conflict' },
    });
    const r: any = await service.applyWeek(USER, 'light', 'digest-semana');
    expect(r.reason).toBe('row_conflict');
    expect(r.preview.available).toBe(true);
  });

  it('NUNCA lança em conflito', async () => {
    const { service } = await build({
      applyResult: { applied: false, reason: 'revision_conflict' },
    });
    await expect(
      service.applyWeek(USER, 'light', 'x'),
    ).resolves.toBeDefined();
  });

  it('recusa não escreve nada', async () => {
    const { service, applyMock } = await build({ plan: null });
    const r: any = await service.applyWeek(USER, 'light', 'digest-semana');
    expect(r.applied).toBe(false);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
