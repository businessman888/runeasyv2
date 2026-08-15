/**
 * Fase 6.1 — A FUNDAÇÃO, contra Postgres de verdade.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
 *
 * Os testes de unidade MOCKAM o `.rpc()` (`mockResolvedValue`). Foi assim que a
 * divergência entre a fronteira calculada pelo serviço e o predicado de
 * `shift_pending_workouts` atravessou 95 testes verdes: o SQL nunca executou.
 *
 * A fundação inteira é sobre lock, transação e concorrência — coisas que não
 * existem em JavaScript. Aqui a função roda de verdade, e os testes de
 * concorrência usam DUAS CONEXÕES, interleavadas na mão.
 *
 *   docker compose --profile test up -d postgres-test
 *   npm run test:int
 */

import { resetData, getPool, closePool, newClient } from '../db/db';
import {
  seedPlan,
  addDays,
  segments,
  instructionsMd5,
  readWorkout,
  TODAY,
} from '../db/fixtures';
import {
  applyAdaptation,
  applyAdaptationOn,
  stateDigest,
  editableWorkouts,
  countAdaptations,
  isStillPending,
  PatchItem,
} from './helpers';

jest.setTimeout(30000);

beforeEach(() => resetData());
afterAll(() => closePool());

/** Patch mínimo: pular um treino. É a operação da 6.2. */
const skipPatch = (workoutId: string): PatchItem[] => [
  {
    workout_id: workoutId,
    expected: { status: 'pending' },
    set: { status: 'skipped' },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
describe('plan_editable_workouts — a fronteira', () => {
  it('devolve só amanhã em diante, pendente, do plano, não-prova', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: -2, status: 'completed' },
        { offset: -1, status: 'pending' }, // passado pendente
        { offset: 0, status: 'pending' }, // HOJE
        { offset: 1, status: 'pending' }, // amanhã ✓
        { offset: 4, status: 'pending' }, // futuro ✓
        { offset: 5, status: 'skipped' }, // futuro terminal
        { offset: 6, status: 'pending', isRaceDay: true }, // prova
        { offset: 7, status: 'pending', orphan: true }, // livre/manual
      ],
    });

    const rows = await editableWorkouts(p.planId, TODAY);

    expect(rows.map((r) => r.id).sort()).toEqual(
      [p.byOffset[1], p.byOffset[4]].sort(),
    );
  });

  it('a fronteira é a MESMA que o helper do TypeScript aplica', async () => {
    // ── TESTE DE PARIDADE ────────────────────────────────────────────────────
    //
    // A fronteira existe em dois lugares: `isEditableWorkout` (TS, para a
    // preview explicar exclusões) e o `WHERE` do SQL (a guarda de verdade).
    // Duas cópias da mesma regra é exatamente como a mina 2 nasceu — aqui elas
    // são comparadas linha a linha.
    const {
      isEditableWorkout,
    } = require('../../src/modules/training/helpers/plan-window.helper');

    const p = await seedPlan({
      workouts: [
        { offset: -3, status: 'completed' },
        { offset: -1, status: 'pending' },
        { offset: 0, status: 'pending' },
        { offset: 1, status: 'pending' },
        { offset: 2, status: 'missed' },
        { offset: 3, status: 'pending', isRaceDay: true },
        { offset: 4, status: 'pending' },
        { offset: 5, status: 'pending', orphan: true },
      ],
    });

    const { rows: all } = await getPool().query(
      `SELECT id, plan_id, status, scheduled_date::text AS scheduled_date, is_race_day
         FROM public.workouts WHERE user_id = $1`,
      [p.userId],
    );

    const tsSays = all
      .filter(
        (w: Record<string, unknown>) =>
          isEditableWorkout(w, { activePlanId: p.planId, todayStr: TODAY })
            .editable,
      )
      .map((w: { id: string }) => w.id)
      .sort();

    const sqlSays = (await editableWorkouts(p.planId, TODAY))
      .map((r) => r.id)
      .sort();

    expect(sqlSays).toEqual(tsSays);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('plan_state_digest — a versão do agregado', () => {
  it('é estável quando nada muda', async () => {
    const p = await seedPlan();
    expect(await stateDigest(p.planId, TODAY)).toBe(
      await stateDigest(p.planId, TODAY),
    );
  });

  it('muda quando um treino FUTURO muda', async () => {
    const p = await seedPlan();
    const before = await stateDigest(p.planId, TODAY);

    await getPool().query(
      `UPDATE public.workouts SET distance_km = 99 WHERE id = $1`,
      [p.byOffset[3]],
    );

    expect(await stateDigest(p.planId, TODAY)).not.toBe(before);
  });

  it('muda quando a F3 reprecifica (o caso da mina 4)', async () => {
    const p = await seedPlan();
    const before = await stateDigest(p.planId, TODAY);

    await getPool().query(
      `UPDATE public.workouts SET instructions_json = $2 WHERE id = $1`,
      [p.byOffset[3], JSON.stringify(segments(300, 320))],
    );

    expect(await stateDigest(p.planId, TODAY)).not.toBe(before);
  });

  it('NÃO muda ao concluir o treino de HOJE', async () => {
    // Escopo deliberado: a edição não alcança hoje, então concluir hoje entre a
    // preview e o apply não pode invalidar a adaptação. Um digest do plano
    // inteiro geraria rejeições que o corredor leria como bug.
    const p = await seedPlan();
    const before = await stateDigest(p.planId, TODAY);

    await getPool().query(
      `UPDATE public.workouts SET status = 'completed', distance_run = 6 WHERE id = $1`,
      [p.byOffset[0]],
    );

    expect(await stateDigest(p.planId, TODAY)).toBe(before);
  });

  it('muda quando o status do plano muda', async () => {
    const p = await seedPlan();
    const before = await stateDigest(p.planId, TODAY);

    await getPool().query(
      `UPDATE public.training_plans SET status = 'cancelled' WHERE id = $1`,
      [p.planId],
    );

    expect(await stateDigest(p.planId, TODAY)).not.toBe(before);
  });

  it('muda na virada do dia — a fronteira andou', async () => {
    // Preview às 23h59, apply às 00h01: o treino que era "amanhã" virou "hoje"
    // e passou a ser intocável. Conflitar aqui é CORRETO.
    const p = await seedPlan();
    expect(await stateDigest(p.planId, TODAY)).not.toBe(
      await stateDigest(p.planId, addDays(TODAY, 1)),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apply_plan_adaptation — caminho feliz', () => {
  it('aplica o patch, invalida briefing e grava o histórico', async () => {
    const p = await seedPlan();
    const target = p.byOffset[3];

    await getPool().query(
      `INSERT INTO public.workout_briefings (workout_id, user_id, content)
       VALUES ($1, $2, 'pace antigo')`,
      [target, p.userId],
    );

    const digest = await stateDigest(p.planId, TODAY);
    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest,
      idempotencyKey: 'k-feliz',
      patch: skipPatch(target),
      meta: { source: 'weekly_insight', reason: 'reduzir frequência' },
    });

    expect(r.applied).toBe(true);
    expect(r.replayed).toBe(false);
    expect(r.affected).toEqual({ workouts: 1, briefings: 1 });

    expect((await readWorkout(target)).status).toBe('skipped');

    const { rows } = await getPool().query(
      `SELECT kind, source, reason, digest_before, digest_after, workout_ids, changes,
              briefings_invalidated, applied_today::text AS applied_today
         FROM public.plan_adaptations WHERE plan_id = $1`,
      [p.planId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].workout_ids).toEqual([target]);
    expect(rows[0].digest_before).toBe(digest);
    expect(rows[0].digest_after).not.toBe(digest);
    expect(rows[0].briefings_invalidated).toBe(1);
    expect(rows[0].applied_today).toBe(TODAY);

    // O antes/depois é o que responde "o que exatamente mudou no meu plano?"
    expect(rows[0].changes[0].before.status).toBe('pending');
    expect(rows[0].changes[0].after.status).toBe('skipped');
  });

  it('escreve `last_adaptation_at` — a coluna morta ganha dono', async () => {
    const p = await seedPlan();
    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-last',
      patch: skipPatch(p.byOffset[3]),
    });

    const { rows } = await getPool().query(
      `SELECT last_adaptation_at FROM public.training_plans WHERE id = $1`,
      [p.planId],
    );
    expect(rows[0].last_adaptation_at).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apply_plan_adaptation — a fronteira no WHERE', () => {
  const cases: Array<[string, number, Record<string, unknown>]> = [
    ['HOJE, mesmo pendente', 0, {}],
    ['passado pendente', -1, {}],
  ];

  it.each(cases)('recusa %s', async (_label, offset) => {
    const p = await seedPlan({
      workouts: [
        { offset: -1, status: 'pending' },
        { offset: 0, status: 'pending' },
        { offset: 2, status: 'pending' },
      ],
    });
    const target = p.byOffset[offset];

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: `k-${offset}`,
      patch: skipPatch(target),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');
    expect((await readWorkout(target)).status).toBe('pending');
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('recusa o dia da prova — invariante', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: 2, status: 'pending' },
        { offset: 3, status: 'pending', isRaceDay: true },
      ],
    });

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-prova',
      patch: skipPatch(p.byOffset[3]),
    });

    expect(r.applied).toBe(false);
    expect((await readWorkout(p.byOffset[3])).status).toBe('pending');
  });

  it('recusa treino de OUTRO usuário — service role ignora RLS', async () => {
    const dono = await seedPlan();
    const intruso = await seedPlan();

    const r = await applyAdaptation({
      userId: intruso.userId, // o intruso, com o plano do dono
      planId: dono.planId,
      today: TODAY,
      digest: await stateDigest(dono.planId, TODAY),
      idempotencyKey: 'k-intruso',
      patch: skipPatch(dono.byOffset[3]),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('plan_not_editable');
    expect((await readWorkout(dono.byOffset[3])).status).toBe('pending');
  });

  it('recusa corrida livre/manual (plan_id nulo)', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: 2, status: 'pending' },
        { offset: 3, status: 'pending', orphan: true },
      ],
    });

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-livre',
      patch: skipPatch(p.byOffset[3]),
    });

    expect(r.applied).toBe(false);
  });

  it.each([
    ['completed', 'plan_not_editable'],
    ['cancelled', 'plan_not_editable'],
  ])('recusa plano %s', async (status, reason) => {
    const p = await seedPlan({ planStatus: status as 'completed' });
    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: 'qualquer',
      idempotencyKey: `k-${status}`,
      patch: skipPatch(p.byOffset[3]),
    });
    expect(r.reason).toBe(reason);
  });

  it('recusa plano ainda em geração — não se sabe qual snapshot é', async () => {
    const p = await seedPlan({ generationStatus: 'generating' });
    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-gerando',
      patch: skipPatch(p.byOffset[3]),
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('plan_generating');
  });

  it('recusa escrever `completed` — só a execução real conclui treino', async () => {
    const p = await seedPlan();
    await expect(
      applyAdaptation({
        userId: p.userId,
        planId: p.planId,
        today: TODAY,
        digest: await stateDigest(p.planId, TODAY),
        idempotencyKey: 'k-completed',
        patch: [
          {
            workout_id: p.byOffset[3],
            expected: { status: 'pending' },
            set: { status: 'completed' },
          },
        ],
      }),
    ).rejects.toThrow(/não é aplicável por adaptação/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apply_plan_adaptation — concorrência otimista', () => {
  it('rejeita quando o digest envelheceu, sem escrever nada', async () => {
    const p = await seedPlan();
    const staleDigest = await stateDigest(p.planId, TODAY);

    // Alguém mexeu no futuro depois da preview.
    await getPool().query(
      `UPDATE public.workouts SET distance_km = 42 WHERE id = $1`,
      [p.byOffset[5]],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: staleDigest,
      idempotencyKey: 'k-stale',
      patch: skipPatch(p.byOffset[3]),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');
    // O conflito já traz o estado real, para recalcular a preview num passo só.
    expect(r.current_digest).toBe(await stateDigest(p.planId, TODAY));
    expect((await readWorkout(p.byOffset[3])).status).toBe('pending');
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('CAS por linha: a F3 reprecificou entre o cálculo e a escrita', async () => {
    // ── A MINA 4, EM MINIATURA ───────────────────────────────────────────────
    //
    // A F6 leu `instructions_json` para calcular o patch; a F3 reescreveu os
    // paces do mesmo treino no meio. Sem o CAS, a F6 gravaria por cima e o
    // trabalho da F3 sumiria — com HTTP 200 nos dois lados.
    const p = await seedPlan();
    const target = p.byOffset[3];
    const md5Antigo = await instructionsMd5(target);

    await getPool().query(
      `UPDATE public.workouts SET instructions_json = $2 WHERE id = $1`,
      [target, JSON.stringify(segments(300, 320))],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      // Digest recalculado (simula quem só confere o agregado)...
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-cas',
      // ...mas o md5 da linha é o ANTIGO: é ele que pega a corrida fina.
      patch: [
        {
          workout_id: target,
          expected: { status: 'pending', instructions_md5: md5Antigo },
          set: { distance_km: 3 },
        },
      ],
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');
    expect(Number((await readWorkout(target)).distance_km)).toBe(6);
  });

  it('duas conexões: a segunda espera o lock e é rejeitada pelo digest', async () => {
    // ── SERIALIZAÇÃO REAL ────────────────────────────────────────────────────
    //
    // O teste que só existe com banco de verdade. A é uma transação aberta que
    // segura o `FOR UPDATE` do plano; B chama a mesma função e BLOQUEIA. Quando
    // A commita, B acorda, recomputa o digest, vê que mudou e recusa.
    const p = await seedPlan();
    const digest = await stateDigest(p.planId, TODAY);

    const a = await newClient();
    const b = await newClient();

    try {
      await a.query('BEGIN');
      const rA = await applyAdaptationOn(a, {
        userId: p.userId,
        planId: p.planId,
        today: TODAY,
        digest,
        idempotencyKey: 'k-A',
        patch: skipPatch(p.byOffset[3]),
      });
      expect(rA.applied).toBe(true);

      // B parte do MESMO digest — como um segundo aparelho faria.
      const pending = applyAdaptationOn(b, {
        userId: p.userId,
        planId: p.planId,
        today: TODAY,
        digest,
        idempotencyKey: 'k-B',
        patch: skipPatch(p.byOffset[5]),
      });

      expect(await isStillPending(pending)).toBe(true); // travado no lock de A

      await a.query('COMMIT');

      const rB = await pending;
      expect(rB.applied).toBe(false);
      expect(rB.reason).toBe('revision_conflict');
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await a.end();
      await b.end();
    }

    expect((await readWorkout(p.byOffset[5])).status).toBe('pending');
    expect(await countAdaptations(p.planId)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apply_plan_adaptation — tudo ou nada', () => {
  it('um item inválido desfaz TODOS os outros', async () => {
    // "Aplicou 6 de 8" não é um estado possível: parcial não é auditável nem
    // reversível, e é indistinguível de sucesso quando a resposta HTTP se perde.
    const p = await seedPlan();
    const ok = p.byOffset[3];
    const hoje = p.byOffset[0]; // fora da fronteira → derruba a transação

    await getPool().query(
      `INSERT INTO public.workout_briefings (workout_id, user_id, content)
       VALUES ($1, $2, 'texto')`,
      [ok, p.userId],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-rollback',
      patch: [...skipPatch(ok), ...skipPatch(hoje)],
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');

    // NADA aconteceu: nem o item válido, nem o briefing, nem o histórico.
    expect((await readWorkout(ok)).status).toBe('pending');
    expect((await readWorkout(hoje)).status).toBe('pending');
    expect(await countAdaptations(p.planId)).toBe(0);

    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM public.workout_briefings WHERE workout_id = $1`,
      [ok],
    );
    expect(rows[0].n).toBe(1);
  });

  it('a linha de VDOT e a reprecificação vivem ou morrem juntas', async () => {
    // Se os paces mudassem e o histórico falhasse, `evidence.workout_ids`
    // sumiria e os mesmos treinos votariam de novo — a montanha-russa que a
    // Fase 3 foi desenhada para impedir.
    const p = await seedPlan({ vdotCurrent: 40 });
    const alvo = p.byOffset[3];

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-vdot',
      kind: 'reprice',
      patch: [
        {
          workout_id: alvo,
          expected: {
            status: 'pending',
            instructions_md5: await instructionsMd5(alvo),
          },
          set: { instructions_json: segments(300, 320) },
        },
      ],
      planPatch: { vdot_current: 41 },
      vdotHistory: {
        vdot_before: 40,
        vdot_after: 41,
        source: 'reestimate',
        reason: '3 treinos de qualidade acima da faixa',
        week_number: 2,
        sample_size: 3,
        avg_delta_seconds: -18,
        evidence: { workout_ids: ['q1', 'q2', 'q3'] },
      },
    });

    expect(r.applied).toBe(true);

    const { rows: plan } = await getPool().query(
      `SELECT vdot_current FROM public.training_plans WHERE id = $1`,
      [p.planId],
    );
    expect(Number(plan[0].vdot_current)).toBe(41);

    const { rows: hist } = await getPool().query(
      `SELECT vdot_before, vdot_after, source, evidence
         FROM public.plan_vdot_history WHERE plan_id = $1`,
      [p.planId],
    );
    expect(hist).toHaveLength(1);
    expect(hist[0].evidence.workout_ids).toEqual(['q1', 'q2', 'q3']);
  });

  it('reprice sem treino futuro ainda grava o histórico', async () => {
    // Plano cujo futuro acabou: nada a reprecificar, mas a linha de histórico
    // TEM que existir, senão os mesmos treinos votam de novo na semana seguinte.
    const p = await seedPlan({
      workouts: [{ offset: -3, status: 'completed' }],
      vdotCurrent: 40,
    });

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-vazio',
      kind: 'reprice',
      patch: [],
      planPatch: { vdot_current: 41 },
      vdotHistory: {
        vdot_before: 40,
        vdot_after: 41,
        source: 'reestimate',
        reason: 'evidência suficiente',
        evidence: { workout_ids: ['q1'] },
      },
    });

    expect(r.applied).toBe(true);
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM public.plan_vdot_history WHERE plan_id = $1`,
      [p.planId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('patch vazio SEM escrita de plano é no-op explícito', async () => {
    const p = await seedPlan();
    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-noop',
      patch: [],
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('empty_patch');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apply_plan_adaptation — idempotência', () => {
  it('o mesmo apply duas vezes aplica UMA vez', async () => {
    const p = await seedPlan();
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-replay',
      patch: skipPatch(p.byOffset[3]),
    };

    const r1 = await applyAdaptation(args);
    const r2 = await applyAdaptation(args); // timeout, retry HTTP, 2º aparelho

    expect(r1.applied).toBe(true);
    expect(r1.replayed).toBe(false);
    expect(r2.applied).toBe(true);
    expect(r2.replayed).toBe(true);
    expect(r2.adaptation_id).toBe(r1.adaptation_id);
    expect(await countAdaptations(p.planId)).toBe(1);
  });

  it('dois dispositivos em paralelo: a UNIQUE decide, e ninguém vê erro', async () => {
    const p = await seedPlan();
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-dois-devices',
      patch: skipPatch(p.byOffset[3]),
    };

    const [r1, r2] = await Promise.all([
      applyAdaptation(args),
      applyAdaptation(args),
    ]);

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    // Um dos dois é replay — qual, não importa.
    expect([r1.replayed, r2.replayed].filter(Boolean)).toHaveLength(1);
    expect(await countAdaptations(p.planId)).toBe(1);
  });

  it('uma segunda adaptação LEGÍTIMA passa — o estado mudou', async () => {
    const p = await seedPlan();

    const d1 = await stateDigest(p.planId, TODAY);
    const r1 = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: d1,
      idempotencyKey: 'k1',
      patch: skipPatch(p.byOffset[3]),
    });
    expect(r1.applied).toBe(true);

    const d2 = await stateDigest(p.planId, TODAY);
    expect(d2).not.toBe(d1); // é isso que gera uma chave diferente

    const r2 = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: d2,
      idempotencyKey: 'k2',
      patch: skipPatch(p.byOffset[5]),
    });

    expect(r2.applied).toBe(true);
    expect(r2.replayed).toBe(false);
    expect(await countAdaptations(p.planId)).toBe(2);
  });
});
