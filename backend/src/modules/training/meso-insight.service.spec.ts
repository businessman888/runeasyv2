import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../database';
import { NotificationService } from '../notifications/notification.service';
import { AIRouterService } from '../../common/ai';
import { VolumePlannerService } from '../../common/volume-planner';
import { VdotService } from './vdot.service';
import { MesoInsightService } from './meso-insight.service';
import { derivePlanWeeks } from './helpers/plan-window.helper';

/**
 * Fase 4 — o insight de mesociclo.
 *
 * O que estes testes protegem, em ordem de importância:
 *   1. o roll-up sai dos WORKOUTS, e o percentual vem das SOMAS — não da média
 *      dos percentuais semanais (que difere quando as semanas têm tamanhos
 *      diferentes, e elas têm: o deload corta 25%);
 *   2. o ÚLTIMO bloco não gera nada;
 *   3. "VDOT parado" tem conteúdo próprio e não é tratado como vazio;
 *   4. dedupe por linha, falha vira `status='failed'`.
 */

interface Row {
  [key: string]: unknown;
}

/**
 * Mock de Supabase com estado. `in`, `gte` e `lte` FILTRAM de verdade — são eles
 * que implementam a janela do bloco, e como passthrough os testes de fronteira
 * passariam validando o mock em vez do código.
 */
function buildMock(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let autoId = 0;

  const from = jest.fn((table: string) => {
    if (!tables[table]) tables[table] = [];
    const preds: Array<(row: Row) => boolean> = [];
    let pending: 'select' | 'insert' | 'update' = 'select';
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
    chain.is = jest.fn((c: string, v: unknown) => {
      preds.push((r) => (r[c] ?? null) === v);
      return chain;
    });
    chain.in = jest.fn((c: string, vals: unknown[]) => {
      preds.push((r) => vals.includes(r[c]));
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

// ── Cenário: plano de 12 semanas, 4x/semana, começando em 2026-06-01 ─────────

const PLAN = {
  id: 'plan-1',
  user_id: 'user-1',
  goal: '10k',
  goal_type: 'distance',
  race_distance: null,
  duration_weeks: 12,
  frequency_per_week: 4,
  status: 'active',
};

/** Dia da semana N, treino i (0-based), do plano que começa numa segunda. */
function dateOf(week: number, i: number): string {
  const start = Date.UTC(2026, 5, 1); // 2026-06-01
  const d = new Date(start + ((week - 1) * 7 + i * 2) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

interface WorkoutOpts {
  planned: number;
  /** Quantos dos `planned` foram concluídos. */
  done: number;
  /** Km prescrito de cada treino. */
  km: number;
  /** Km executado (default = km). */
  ran?: number;
}

function weekWorkouts(week: number, o: WorkoutOpts): Row[] {
  return Array.from({ length: o.planned }, (_, i) => {
    const completed = i < o.done;
    return {
      id: `w${week}-${i}`,
      plan_id: PLAN.id,
      user_id: PLAN.user_id,
      week_number: week,
      scheduled_date: dateOf(week, i),
      status: completed ? 'completed' : 'pending',
      distance_km: o.km,
      distance_run: completed ? (o.ran ?? o.km) : null,
      time_run_seconds: completed ? Math.round((o.ran ?? o.km) * 400) : null,
      pace_seconds_per_km: completed ? 400 : null,
      instructions_json: [
        { type: 'main', distance_km: o.km, pace_min: 393, pace_max: 434 },
      ],
      metadata: { zone: 'Z1' },
    };
  });
}

/**
 * Bloco 2 (S5-8) com volume DESIGUAL de propósito: a semana 8 é o deload, e é
 * essa diferença de tamanho que faz a média dos percentuais divergir do
 * percentual das somas.
 */
function blocoDoisDesigual(): Row[] {
  return [
    ...weekWorkouts(5, { planned: 4, done: 4, km: 8 }), // 32 km, 100%
    ...weekWorkouts(6, { planned: 4, done: 4, km: 9 }), // 36 km, 100%
    ...weekWorkouts(7, { planned: 4, done: 4, km: 10 }), // 40 km, 100%
    ...weekWorkouts(8, { planned: 4, done: 1, km: 3 }), // 12 km, 25%
  ];
}

/** Todas as 12 semanas, para o gatilho enxergar o fim do plano. */
function planoCompleto(bloco2 = blocoDoisDesigual()): Row[] {
  const outras = [1, 2, 3, 4, 9, 10, 11, 12].flatMap((w) =>
    weekWorkouts(w, { planned: 4, done: 4, km: 5 }),
  );
  return [...outras, ...bloco2];
}

describe('MesoInsightService', () => {
  let service: MesoInsightService;
  let tables: Record<string, Row[]>;
  let aiRouter: { isAvailable: boolean; call: jest.Mock };
  let vdotService: { describeQualityEfforts: jest.Mock };
  let notificationService: {
    createNotification: jest.Mock;
    sendPushNotification: jest.Mock;
  };

  const build = async (
    workouts: Row[] = planoCompleto(),
    extra: Row[] = [],
  ) => {
    const built = buildMock({
      training_plans: [PLAN],
      workouts,
      activities: [],
      plan_vdot_history: extra,
      plan_meso_insights: [],
    });
    tables = built.tables;

    aiRouter = { isAvailable: false, call: jest.fn() };
    vdotService = { describeQualityEfforts: jest.fn().mockResolvedValue([]) };
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MesoInsightService,
        { provide: SupabaseService, useValue: built.mock },
        { provide: NotificationService, useValue: notificationService },
        { provide: AIRouterService, useValue: aiRouter },
        VolumePlannerService,
        { provide: VdotService, useValue: vdotService },
      ],
    }).compile();

    service = module.get(MesoInsightService);
    return workouts;
  };

  /** Dispara o gatilho como o cron faria, no fecho da semana N. */
  const fecharSemana = async (weekNumber: number, workouts: Row[]) => {
    const weeks = derivePlanWeeks(
      workouts as Array<{ week_number: number; scheduled_date: string }>,
    ).filter((w) => w.source === 'workouts');

    return service.maybeGenerateForClosedWeek({
      userId: PLAN.user_id,
      planId: PLAN.id,
      weekNumber,
      weeks,
      workouts: workouts as never,
      planFrequency: PLAN.frequency_per_week,
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  describe('gatilho', () => {
    it('gera no fecho da semana 8 — o bloco 2 de um plano de 12 semanas', async () => {
      const workouts = await build();

      const insight = await fecharSemana(8, workouts);

      expect(insight).not.toBeNull();
      expect(tables.plan_meso_insights).toHaveLength(1);
      const row = tables.plan_meso_insights[0];
      expect(row.block_index).toBe(2);
      expect(row.week_start).toBe(5);
      expect(row.week_end).toBe(8);
      expect(row.status).toBe('completed');
    });

    it('não gera em semana que não fecha bloco', async () => {
      const workouts = await build();

      for (const week of [5, 6, 7]) {
        expect(await fecharSemana(week, workouts)).toBeNull();
      }
      expect(tables.plan_meso_insights).toHaveLength(0);
    });

    it('o ÚLTIMO bloco não gera — a retrospectiva é o fecho', async () => {
      const workouts = await build();

      expect(await fecharSemana(12, workouts)).toBeNull();
      expect(tables.plan_meso_insights).toHaveLength(0);
    });

    it('um bloco gera UMA vez — dedupe por linha', async () => {
      const workouts = await build();

      expect(await fecharSemana(8, workouts)).not.toBeNull();
      expect(await fecharSemana(8, workouts)).toBeNull();
      expect(tables.plan_meso_insights).toHaveLength(1);
    });

    it('notifica: na madrugada de fecho de bloco, é o meso que dá a voz', async () => {
      const workouts = await build();

      await fecharSemana(8, workouts);

      expect(notificationService.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(tables.plan_meso_insights[0].notified_at).toEqual(
        expect.any(String),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('roll-up', () => {
    it('o percentual vem das SOMAS, não da média das semanas', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);
      const row = tables.plan_meso_insights[0];

      // 13 de 16 treinos concluídos → 81%.
      expect(row.planned_workouts).toBe(16);
      expect(row.completed_workouts).toBe(13);
      expect(row.completion_rate).toBe(81);

      // A distância é onde a diferença aparece de verdade. Executado por
      // semana: 32 + 36 + 40 + 3 = 111 de 120 prescritos.
      //   percentual das SOMAS  → 111/120 = 92,5% → 93
      //   média das razões      → (100+100+100+25)/4 = 81
      // São 12 pontos de diferença, e a média mentiria para baixo porque a
      // semana fraca é justamente a mais curta (o deload).
      expect(row.planned_distance_km).toBe(120);
      expect(row.completed_distance_km).toBe(111);
      expect(row.distance_vs_goal_percent).toBe(93);
      expect(row.distance_vs_goal_percent).not.toBe(81);
    });

    it('mede só as semanas DO BLOCO, ignorando o resto do plano', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);

      // As outras 8 semanas têm 4×5 km cada; se vazassem, o planejado seria 280.
      expect(tables.plan_meso_insights[0].planned_distance_km).toBe(120);
    });

    it('o ARCO tem uma entrada por semana — o dado que o semanal não produz', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);

      expect(tables.plan_meso_insights[0].volume_trend).toEqual([
        { weekNumber: 5, plannedKm: 32, completedKm: 32 },
        { weekNumber: 6, plannedKm: 36, completedKm: 36 },
        { weekNumber: 7, plannedKm: 40, completedKm: 40 },
        { weekNumber: 8, plannedKm: 12, completedKm: 3 },
      ]);
    });

    it('rotula pela fase dominante, recomputada de calculatePhases', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);

      // 12 semanas / 10 km → base S1-6, build S7-9. O bloco 2 (S5-8) é
      // base·base·build·build: empate resolvido pela última semana.
      expect(tables.plan_meso_insights[0].dominant_phase).toBe('build');
    });

    it('aderência e total corrido são blocos separados que nunca se somam', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);
      const row = tables.plan_meso_insights[0];

      // Sem activities no cenário: o total é 0 e o "livre" tem piso em 0 —
      // nunca negativo por o plano ter mais km que o registrado.
      expect(row.total_distance_km).toBe(0);
      expect(row.free_run_distance_km).toBe(0);
      expect(row.completed_distance_km).toBe(111);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('VDOT como destaque ocasional', () => {
    it('sem movimento no bloco, vdot_highlight é null — e isso é o normal', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);

      expect(tables.plan_meso_insights[0].vdot_highlight).toBeNull();
      // E o insight existe do mesmo jeito: o eixo é o arco, não o VDOT.
      expect(tables.plan_meso_insights[0].status).toBe('completed');
      expect(tables.plan_meso_insights[0].ai_narrative).toEqual(
        expect.any(String),
      );
    });

    it('com movimento DENTRO do bloco, vira destaque', async () => {
      const workouts = await build(planoCompleto(), [
        {
          id: 'h1',
          plan_id: PLAN.id,
          source: 'reestimate',
          week_number: 7,
          vdot_before: 40,
          vdot_after: 41,
          reason: '3 treinos de qualidade acima do prescrito',
          sample_size: 3,
        },
      ]);

      await fecharSemana(8, workouts);

      expect(tables.plan_meso_insights[0].vdot_highlight).toMatchObject({
        vdotBefore: 40,
        vdotAfter: 41,
        direction: 'up',
        weekNumber: 7,
      });
    });

    it('movimento FORA do bloco não entra', async () => {
      const workouts = await build(planoCompleto(), [
        {
          id: 'h1',
          plan_id: PLAN.id,
          source: 'reestimate',
          week_number: 9, // bloco 3
          vdot_before: 40,
          vdot_after: 41,
        },
      ]);

      await fecharSemana(8, workouts);

      expect(tables.plan_meso_insights[0].vdot_highlight).toBeNull();
    });

    it('a linha de semeadura (week_number NULL) nunca vira destaque', async () => {
      const workouts = await build(planoCompleto(), [
        {
          id: 'h0',
          plan_id: PLAN.id,
          source: 'seed',
          week_number: null,
          vdot_before: null,
          vdot_after: 40,
        },
      ]);

      await fecharSemana(8, workouts);

      expect(tables.plan_meso_insights[0].vdot_highlight).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('narrativa', () => {
    it('sem IA, o fallback determinístico cita os números do bloco', async () => {
      const workouts = await build();
      await fecharSemana(8, workouts);

      const texto = String(tables.plan_meso_insights[0].ai_narrative);
      expect(texto).toContain('bloco 2');
      expect(texto).toContain('13 de 16');
      // O arco aparece no fallback: é o que distingue esta altitude.
      expect(texto).toContain('32 km na semana 5');
    });

    it('o prompt declara em voz alta que não houve tiro nem mudança de nível', async () => {
      const workouts = await build();
      aiRouter.isAvailable = true;
      aiRouter.call.mockResolvedValue({ data: { narrative: 'ok' } });

      await fecharSemana(8, workouts);

      const prompt = aiRouter.call.mock.calls.at(-1)?.[0]?.userMessage ?? '';
      // Calado, o modelo busca um substituto e inventa — a lição da Fase 3.
      expect(prompt).toContain('TIROS DO BLOCO: nenhum treino de qualidade');
      expect(prompt).toContain('NÍVEL ESTIMADO: não mudou neste bloco');
      expect(prompt).toContain('Isso é o NORMAL');

      const system = aiRouter.call.mock.calls.at(-1)?.[0]?.systemPrompt?.[0]
        ?.text as string;
      // Reflexão pura: a narrativa não pode sugerir ajuste.
      expect(system).toContain('NÃO existe recomendação nem ajuste');
      // Tendência é onde a causalidade inventada mais aparece.
      expect(system).toContain('volume, frequência e regularidade NÃO alteram');
    });

    it('IA que falha não derruba o insight — cai no fallback', async () => {
      const workouts = await build();
      aiRouter.isAvailable = true;
      aiRouter.call.mockRejectedValue(new Error('haiku down'));

      const insight = await fecharSemana(8, workouts);

      expect(insight).not.toBeNull();
      expect(tables.plan_meso_insights[0].status).toBe('completed');
      expect(tables.plan_meso_insights[0].ai_narrative).toEqual(
        expect.any(String),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('falha', () => {
    it('erro na geração deixa a linha em failed — não apaga', async () => {
      const workouts = await build();
      // A medição dos tiros é best-effort e NÃO derruba; quem derruba é a
      // montagem das métricas. Forçamos pelo caminho do VDOT.
      jest
        .spyOn(
          service as unknown as { buildMesoMetrics: () => Promise<never> },
          'buildMesoMetrics',
        )
        .mockRejectedValue(new Error('boom'));

      const insight = await fecharSemana(8, workouts);

      expect(insight).toBeNull();
      expect(tables.plan_meso_insights).toHaveLength(1);
      expect(tables.plan_meso_insights[0].status).toBe('failed');
      // Persistir a falha (em vez de apagar) é o que habilita "tentar de novo",
      // e é seguro porque a UNIQUE já garante unicidade.
      expect(tables.plan_meso_insights[0].block_index).toBe(2);
    });

    it('medição dos tiros que falha NÃO derruba o insight', async () => {
      const workouts = await build();
      vdotService.describeQualityEfforts.mockRejectedValue(
        new Error('replay down'),
      );

      const insight = await fecharSemana(8, workouts);

      expect(insight).not.toBeNull();
      expect(tables.plan_meso_insights[0].status).toBe('completed');
      expect(tables.plan_meso_insights[0].quality_efforts).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('leitura', () => {
    it('markSeen é idempotente — o segundo carimbo não casa', async () => {
      const workouts = await build();
      const insight = await fecharSemana(8, workouts);

      expect(await service.markSeen(PLAN.user_id, insight!.id)).toBe(true);
      expect(await service.markSeen(PLAN.user_id, insight!.id)).toBe(false);
    });

    it('markSeen de outro usuário não carimba', async () => {
      const workouts = await build();
      const insight = await fecharSemana(8, workouts);

      expect(await service.markSeen('outro-user', insight!.id)).toBe(false);
      expect(tables.plan_meso_insights[0].seen_at).toBeUndefined();
    });
  });
});
