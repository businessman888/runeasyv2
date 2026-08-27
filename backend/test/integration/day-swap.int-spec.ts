/**
 * Troca de Dias T.1 — contra Postgres de verdade.
 *
 * ── O QUE SÓ EXISTE AQUI ─────────────────────────────────────────────────────
 *
 * O `day-swap.helper.spec` prova a LÓGICA (ordem, colisão, régua) sem banco. O
 * que ele não pode provar é o que só o Postgres faz:
 *
 *   • a escrita de `user_onboarding` acontecer na MESMA transação do
 *     remapeamento — a Mina 4 fechada, não remendada;
 *   • as DUAS cópias dos dias (coluna + `responses_json`) andarem juntas;
 *   • o patch multi-item ser tudo-ou-nada;
 *   • os segmentos de um INTERVALADO sobreviverem à mudança de data.
 *
 *   npm run test:int
 */

import { resetData, getPool, closePool } from '../db/db';
import {
  seedPlan,
  addDays,
  intervalSegments,
  instructionsMd5,
  readWorkout,
  TODAY,
} from '../db/fixtures';
import {
  applyAdaptation,
  stateDigest,
  countAdaptations,
  PatchItem,
} from './helpers';

jest.setTimeout(30000);

beforeEach(() => resetData());
afterAll(() => closePool());

/** O patch que a Troca de Dias monta: só a data, sem md5. */
const movePatch = (pares: Array<[string, string]>): PatchItem[] =>
  pares.map(([id, to]) => ({
    workout_id: id,
    expected: { status: 'pending' },
    set: { scheduled_date: to },
  }));

/** A linha de onboarding que a Mina 4 existe para manter viva. */
async function seedOnboarding(
  userId: string,
  dias: number[],
  opts: { comResponsesJson?: boolean } = {},
): Promise<void> {
  const comRJ = opts.comResponsesJson ?? true;
  await getPool().query(
    `INSERT INTO public.user_onboarding
       (user_id, goal, level, target_weeks, days_per_week,
        available_days, responses_json)
     VALUES ($1, '10k', 'intermediate', 12, $2, $3, $4)`,
    [
      userId,
      dias.length,
      JSON.stringify(dias),
      comRJ ? JSON.stringify({ available_days: dias, goal: '10k' }) : null,
    ],
  );
}

async function readOnboarding(userId: string) {
  const { rows } = await getPool().query<{
    coluna: number[] | null;
    no_json: number[] | null;
    outras_respostas: string | null;
  }>(
    `SELECT available_days AS coluna,
            responses_json->'available_days' AS no_json,
            responses_json->>'goal' AS outras_respostas
       FROM public.user_onboarding WHERE user_id = $1`,
    [userId],
  );
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Troca de Dias — o remapeamento pela primitiva', () => {
  it('move N treinos num patch só, atômico', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: 5, status: 'pending', weekNumber: 2 },
        { offset: 6, status: 'pending', weekNumber: 2 },
        { offset: 7, status: 'pending', weekNumber: 2, type: 'long_run' },
      ],
    });

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-swap-multi',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([
        [p.byOffset[5], addDays(TODAY, 9)],
        [p.byOffset[6], addDays(TODAY, 11)],
        [p.byOffset[7], addDays(TODAY, 13)],
      ]),
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.workouts).toBe(3);
    expect((await readWorkout(p.byOffset[5])).scheduled_date).toBe(
      addDays(TODAY, 9),
    );
    expect((await readWorkout(p.byOffset[7])).scheduled_date).toBe(
      addDays(TODAY, 13),
    );

    const { rows } = await getPool().query<{ kind: string }>(
      `SELECT kind FROM public.plan_adaptations WHERE plan_id = $1`,
      [p.planId],
    );
    expect(rows[0].kind).toBe('swap_days');
  });

  it('UM item ruim desfaz o patch inteiro', async () => {
    const p = await seedPlan();
    const bom = p.byOffset[5];
    const antes = (await readWorkout(bom)).scheduled_date;

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-swap-parcial',
      kind: 'swap_days',
      patch: movePatch([
        [bom, addDays(TODAY, 9)],
        [p.byOffset[0], addDays(TODAY, 10)], // HOJE: fora da fronteira
      ]),
    });

    expect(r.applied).toBe(false);
    expect((await readWorkout(bom)).scheduled_date).toBe(antes);
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('o briefing SOBREVIVE — a data mudou, o conteúdo não', async () => {
    // O prompt do briefing não contém data nem dia da semana (só tipo,
    // distância, zona, esforço, objetivo, blocos e nível). Invalidar aqui
    // torraria geração de IA cobrada para reescrever o mesmo texto.
    const p = await seedPlan();
    const alvo = p.byOffset[5];

    await getPool().query(
      `INSERT INTO public.workout_briefings (workout_id, user_id, content)
       VALUES ($1, $2, 'o texto do treinador')`,
      [alvo, p.userId],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-swap-briefing',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[alvo, addDays(TODAY, 9)]]),
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.briefings).toBe(0);

    const { rows } = await getPool().query<{ content: string }>(
      `SELECT content FROM public.workout_briefings WHERE workout_id = $1`,
      [alvo],
    );
    expect(rows[0]?.content).toBe('o texto do treinador');
  });

  it('digest velho é rejeitado, sem escrever nada', async () => {
    const p = await seedPlan();
    const velho = await stateDigest(p.planId, TODAY);

    await getPool().query(
      `UPDATE public.workouts SET distance_km = 42 WHERE id = $1`,
      [p.byOffset[7]],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: velho,
      idempotencyKey: 'k-swap-stale',
      kind: 'swap_days',
      patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');
    expect(await countAdaptations(p.planId)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O PONTO CEGO DO INTERVALADO', () => {
  // ── Por que este bloco existe ────────────────────────────────────────────
  //
  // O plano de teste de staging da 6.2/6.3 era 100% contínuo, então a regra de
  // `repeat` nunca rodou contra dado real — o buraco ficou anotado e não foi
  // fechado. A Troca de Dias é outra chance: aqui um treino com `repeat` MUDA
  // DE DATA, e o que precisa ser provado é que nada além da data muda.

  it('os segmentos e o pace sobrevivem à mudança de data', async () => {
    const p = await seedPlan({
      workouts: [
        {
          offset: 5,
          status: 'pending',
          weekNumber: 2,
          type: 'intervals',
          instructions: intervalSegments(6, 0.8, 0.4),
        },
      ],
    });
    const alvo = p.byOffset[5];

    const md5Antes = await instructionsMd5(alvo);
    const antes = await readWorkout(alvo);

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-swap-repeat',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[alvo, addDays(TODAY, 8)]]),
    });

    expect(r.applied).toBe(true);

    const depois = await readWorkout(alvo);
    expect(depois.scheduled_date).toBe(addDays(TODAY, 8));

    // O md5 é calculado PELO POSTGRES sobre o jsonb normalizado — se um único
    // byte dos segmentos tivesse mudado, ele mudaria.
    expect(await instructionsMd5(alvo)).toBe(md5Antes);
    expect(depois.instructions_json).toEqual(antes.instructions_json);

    // E explicitamente: reps, distâncias e paces do bloco `repeat`.
    const segs = depois.instructions_json as Array<Record<string, unknown>>;
    const repeat = segs.find((s) => s.type === 'repeat') as {
      reps: number;
      work: { distance_km: number; pace_min: number };
      recovery: { distance_km: number };
    };
    expect(repeat.reps).toBe(6);
    expect(repeat.work.distance_km).toBe(0.8);
    expect(repeat.work.pace_min).toBe(240);
    expect(repeat.recovery.distance_km).toBe(0.4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A MINA 4 — os dias escolhidos, na mesma transação', () => {
  it('grava as DUAS cópias: a coluna E `responses_json`', async () => {
    // `responses_json.available_days` tem PRECEDÊNCIA na leitura
    // (`const dto = onboarding.responses_json || onboarding`), então escrever
    // só a coluna seria um no-op silencioso: a geração continuaria usando os
    // dias antigos e a troca seria desfeita sozinha.
    const p = await seedPlan();
    await seedOnboarding(p.userId, [0, 1, 2]);

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-mina4',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
      onboardingPatch: { available_days: [2, 4, 6] },
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.onboarding).toBe(1);

    const onb = await readOnboarding(p.userId);
    expect(onb.coluna).toEqual([2, 4, 6]);
    expect(onb.no_json).toEqual([2, 4, 6]);
    // E o resto do blob de respostas fica intacto — `jsonb_set` numa chave só.
    expect(onb.outras_respostas).toBe('10k');
  });

  it('as datas e os dias vivem ou morrem JUNTOS', async () => {
    // Se o remapeamento falha, os dias NÃO podem ter sido gravados — senão o
    // app mostraria dias que o calendário não tem.
    const p = await seedPlan();
    await seedOnboarding(p.userId, [0, 1, 2]);

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-mina4-rollback',
      kind: 'swap_days',
      patch: movePatch([
        [p.byOffset[5], addDays(TODAY, 9)],
        [p.byOffset[0], addDays(TODAY, 10)], // HOJE: derruba o bloco
      ]),
      onboardingPatch: { available_days: [2, 4, 6] },
    });

    expect(r.applied).toBe(false);

    const onb = await readOnboarding(p.userId);
    expect(onb.coluna).toEqual([0, 1, 2]);
    expect(onb.no_json).toEqual([0, 1, 2]);
  });

  it('sem `onboardingPatch`, `user_onboarding` não é tocada (o Modo 2)', async () => {
    // Uma troca pontual não redefine a rotina do corredor.
    const p = await seedPlan();
    await seedOnboarding(p.userId, [0, 1, 2]);

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-modo2',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
    });

    expect(r.applied).toBe(true);
    // Sem pedido, sem campo: a forma da resposta é a MESMA que F3/6.2/6.3
    // recebem. Um campo a mais seria mudança de contrato para quem não usa o
    // recurso — e a suíte da fundação compara o objeto `affected` inteiro.
    expect(r.affected).toEqual({ workouts: 1, briefings: 0 });

    const onb = await readOnboarding(p.userId);
    expect(onb.coluna).toEqual([0, 1, 2]);
    expect(onb.no_json).toEqual([0, 1, 2]);
  });

  it('`responses_json` NULO não vira NULL — o blob não é apagado', async () => {
    // `jsonb_set(NULL, …)` devolve NULL. Sem o CASE, uma linha antiga sem
    // `responses_json` perderia a coluna inteira — e ela guarda TODAS as
    // respostas do onboarding, não só os dias.
    const p = await seedPlan();
    await seedOnboarding(p.userId, [0, 1, 2], { comResponsesJson: false });

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-rj-nulo',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
      onboardingPatch: { available_days: [3, 5] },
    });

    expect(r.applied).toBe(true);
    const onb = await readOnboarding(p.userId);
    expect(onb.coluna).toEqual([3, 5]);
    expect(onb.no_json).toBeNull();
  });

  it('usuário SEM linha de onboarding não quebra a troca', async () => {
    // Plano criado por rota administrativa. O contador vai a zero e o
    // remapeamento segue — a ausência fica auditável no histórico.
    const p = await seedPlan();

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-sem-onb',
      kind: 'swap_days',
      invalidateBriefings: false,
      patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
      onboardingPatch: { available_days: [1, 3] },
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.onboarding).toBe(0);

    const { rows } = await getPool().query<{
      metrics: Record<string, unknown>;
    }>(`SELECT metrics FROM public.plan_adaptations WHERE plan_id = $1`, [
      p.planId,
    ]);
    expect(rows[0].metrics.onboarding_rows).toBe(0);
  });

  it('recusa `available_days` que não é array', async () => {
    const p = await seedPlan();
    await seedOnboarding(p.userId, [0, 1, 2]);

    await expect(
      applyAdaptation({
        userId: p.userId,
        planId: p.planId,
        today: TODAY,
        digest: await stateDigest(p.planId, TODAY),
        idempotencyKey: 'k-dias-invalidos',
        kind: 'swap_days',
        patch: movePatch([[p.byOffset[5], addDays(TODAY, 9)]]),
        onboardingPatch: { available_days: 'seg,qua,sex' },
      }),
    ).rejects.toThrow(/available_days precisa ser array/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('T.1 — a assinatura nova não quebrou a fundação', () => {
  it('existe UMA função, e ela tem 12 parâmetros', async () => {
    // `DROP` + `CREATE` em vez de `CREATE OR REPLACE`: parâmetro novo muda a
    // assinatura, e um REPLACE criaria uma SEGUNDA função — com o PostgREST
    // livre para resolver a antiga, sem a escrita de `user_onboarding`.
    const { rows } = await getPool().query<{ n: number; nargs: number }>(
      `SELECT count(*)::int AS n, max(p.pronargs)::int AS nargs
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation'`,
    );
    expect(rows[0].n).toBe(1);
    expect(rows[0].nargs).toBe(12);
  });

  it('a guarda da T.0 continua de pé com a assinatura nova', async () => {
    const p = await seedPlan();
    const antes = (await readWorkout(p.byOffset[5])).scheduled_date;

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-t0-ainda-vale',
      kind: 'swap_days',
      patch: movePatch([[p.byOffset[5], addDays(TODAY, -1)]]),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('new_date_in_past');
    expect(r.current_digest).toBeUndefined();
    expect((await readWorkout(p.byOffset[5])).scheduled_date).toBe(antes);
  });

  it('a função nova continua server-only', async () => {
    const { rows } = await getPool().query<{
      anon: boolean;
      auth: boolean;
      svc: boolean;
    }>(
      `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
              has_function_privilege('service_role', $1, 'EXECUTE') AS svc`,
      [
        'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb,jsonb)',
      ],
    );
    // `DROP` + `CREATE` cria função NOVA, que herda os DEFAULT PRIVILEGES do
    // Supabase — os REVOKEs precisam ser repetidos na migration, e é isso que
    // este teste trava.
    expect(rows[0].anon).toBe(false);
    expect(rows[0].auth).toBe(false);
    expect(rows[0].svc).toBe(true);
  });
});
