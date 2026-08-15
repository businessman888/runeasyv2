/**
 * Fase 6.1 — `apply_schedule_shift`, contra Postgres de verdade.
 *
 * ── O TESTE QUE FALTAVA (mina 2) ─────────────────────────────────────────────
 *
 * `reanchorRemainingWorkoutsToToday` calculava um conjunto FINO de "restantes"
 * e depois chamava `shift_pending_workouts`, cujo predicado era
 * `plan_id = ? AND status = 'pending'` — TODOS os pendentes. Um pendente
 * anterior à fronteira de progresso, deliberadamente excluído pelo serviço, era
 * deslocado assim mesmo.
 *
 * Nenhum teste pegou isso porque todos MOCKAVAM a RPC e só conferiam `p_days`.
 * O primeiro teste deste arquivo é exatamente o que teria pego.
 */

import { resetData, getPool, closePool, newClient } from '../db/db';
import { seedPlan, addDays, TODAY } from '../db/fixtures';
import {
  applyShift,
  applyShiftOn,
  stateDigest,
  countAdaptations,
  isStillPending,
} from './helpers';

jest.setTimeout(30000);

beforeEach(() => resetData());
afterAll(() => closePool());

const datesOf = async (ids: string[]) => {
  const { rows } = await getPool().query(
    `SELECT id, scheduled_date::text AS d, status
       FROM public.workouts WHERE id = ANY($1) ORDER BY d`,
    [ids],
  );
  return rows as Array<{ id: string; d: string; status: string }>;
};

describe('apply_schedule_shift — desloca EXATAMENTE os IDs recebidos', () => {
  it('não toca num pendente que ficou de fora da lista (A MINA 2)', async () => {
    const p = await seedPlan({
      workouts: [
        // Pendente ANTERIOR à fronteira de progresso: o serviço o exclui de
        // propósito. A RPC antiga o deslocaria junto.
        { offset: -20, status: 'pending' },
        { offset: -10, status: 'completed' },
        { offset: -2, status: 'pending' },
        { offset: 3, status: 'pending' },
      ],
    });

    const foraDaLista = p.byOffset[-20];
    const dataOriginal = addDays(TODAY, -20);

    const r = await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[-2], p.byOffset[3]], // só estes dois
      days: 7,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-mina2',
    });

    expect(r.applied).toBe(true);
    expect(r.shifted).toBe(2);

    const [intocado] = await datesOf([foraDaLista]);
    expect(intocado.d).toBe(dataOriginal);

    const movidos = await datesOf([p.byOffset[-2], p.byOffset[3]]);
    expect(movidos.map((m) => m.d).sort()).toEqual(
      [addDays(TODAY, 5), addDays(TODAY, 10)].sort(),
    );
  });

  it('reclama os `missed` da lista e os desloca na mesma transação', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: -3, status: 'missed' },
        { offset: 2, status: 'pending' },
      ],
    });

    const r = await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[-3], p.byOffset[2]],
      days: 14,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-reclaim',
    });

    expect(r.applied).toBe(true);
    expect(r.reclaimed).toBe(1);
    expect(r.shifted).toBe(2);

    const rows = await datesOf([p.byOffset[-3], p.byOffset[2]]);
    expect(rows.every((x) => x.status === 'pending')).toBe(true);
    expect(rows.map((x) => x.d).sort()).toEqual(
      [addDays(TODAY, 11), addDays(TODAY, 16)].sort(),
    );
  });

  it('preserva o dia da semana (múltiplos de 7)', async () => {
    const p = await seedPlan({ workouts: [{ offset: 2, status: 'pending' }] });
    const antes = new Date(`${addDays(TODAY, 2)}T12:00:00Z`).getUTCDay();

    await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[2]],
      days: 21,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-dow',
    });

    const [row] = await datesOf([p.byOffset[2]]);
    expect(new Date(`${row.d}T12:00:00Z`).getUTCDay()).toBe(antes);
  });

  it('recusa ID de outro plano — e não desloca nada', async () => {
    const a = await seedPlan();
    const b = await seedPlan();

    const r = await applyShift({
      userId: a.userId,
      planId: a.planId,
      workoutIds: [a.byOffset[3], b.byOffset[3]], // um id intruso
      days: 7,
      today: TODAY,
      digest: await stateDigest(a.planId, TODAY),
      idempotencyKey: 'k-intruso',
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');

    const [meu] = await datesOf([a.byOffset[3]]);
    expect(meu.d).toBe(addDays(TODAY, 3)); // rollback total
    expect(await countAdaptations(a.planId)).toBe(0);
  });

  it('recusa quando um treino da lista foi concluído no meio do caminho', async () => {
    const p = await seedPlan();

    await getPool().query(
      `UPDATE public.workouts SET status = 'completed' WHERE id = $1`,
      [p.byOffset[3]],
    );

    const r = await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[3], p.byOffset[5]],
      days: 7,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-concluido',
    });

    expect(r.applied).toBe(false);
    // Deslocar só metade deixaria o calendário com um buraco silencioso.
    const [outro] = await datesOf([p.byOffset[5]]);
    expect(outro.d).toBe(addDays(TODAY, 5));
  });
});

describe('apply_schedule_shift — o carimbo do insight é atômico', () => {
  const seedInsight = async (p: { userId: string; planId: string }) => {
    const { rows } = await getPool().query(
      `INSERT INTO public.plan_week_insights
         (user_id, plan_id, week_number, week_start, week_end, status)
       VALUES ($1, $2, 2, $3, $4, 'completed')
       RETURNING id`,
      [p.userId, p.planId, addDays(TODAY, -7), addDays(TODAY, -1)],
    );
    return rows[0].id as string;
  };

  it('carimba `adjustment_applied_at` na mesma transação do shift', async () => {
    const p = await seedPlan();
    const insightId = await seedInsight(p);

    const r = await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[3]],
      days: 7,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-carimbo',
      insightId,
      meta: { source: 'weekly_insight', reason: 'adiar a semana' },
    });

    expect(r.applied).toBe(true);
    const { rows } = await getPool().query(
      `SELECT adjustment_applied_at FROM public.plan_week_insights WHERE id = $1`,
      [insightId],
    );
    expect(rows[0].adjustment_applied_at).not.toBeNull();
  });

  it('NÃO carimba quando o shift falha (era o D2)', async () => {
    // Antes: shift confirmava e o carimbo era um UPDATE separado. Se o carimbo
    // falhasse, um retry reaplicava o deslocamento; e duas requisições
    // concorrentes liam `null` e empurravam o plano duas semanas.
    const p = await seedPlan();
    const insightId = await seedInsight(p);

    const r = await applyShift({
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[0]], // HOJE está pendente, mas não é o problema:
      days: 7,
      today: TODAY,
      digest: 'digest-velho', // digest errado → rejeita antes de escrever
      idempotencyKey: 'k-sem-carimbo',
      insightId,
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');

    const { rows } = await getPool().query(
      `SELECT adjustment_applied_at FROM public.plan_week_insights WHERE id = $1`,
      [insightId],
    );
    expect(rows[0].adjustment_applied_at).toBeNull();
  });

  it('dois toques concorrentes NÃO empurram o plano duas semanas', async () => {
    // O cenário exato do D2, agora impossível: a `UNIQUE (idempotency_key)`
    // decide, e o perdedor recebe "replay" em vez de erro.
    const p = await seedPlan();
    const args = {
      userId: p.userId,
      planId: p.planId,
      workoutIds: [p.byOffset[3]],
      days: 7,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-duplo-toque',
    };

    const [r1, r2] = await Promise.all([applyShift(args), applyShift(args)]);

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    expect([r1.replayed, r2.replayed].filter(Boolean)).toHaveLength(1);

    const [row] = await datesOf([p.byOffset[3]]);
    expect(row.d).toBe(addDays(TODAY, 10)); // +7 UMA vez, não +14
    expect(await countAdaptations(p.planId)).toBe(1);
  });

  it('duas conexões: a segunda espera o lock do plano', async () => {
    const p = await seedPlan();
    const digest = await stateDigest(p.planId, TODAY);

    const a = await newClient();
    const b = await newClient();

    try {
      await a.query('BEGIN');
      await applyShiftOn(a, {
        userId: p.userId,
        planId: p.planId,
        workoutIds: [p.byOffset[3]],
        days: 7,
        today: TODAY,
        digest,
        idempotencyKey: 'k-lockA',
      });

      const pending = applyShiftOn(b, {
        userId: p.userId,
        planId: p.planId,
        workoutIds: [p.byOffset[5]],
        days: 7,
        today: TODAY,
        digest,
        idempotencyKey: 'k-lockB',
      });

      expect(await isStillPending(pending)).toBe(true);

      await a.query('COMMIT');
      const rB = await pending;
      expect(rB.applied).toBe(false);
      expect(rB.reason).toBe('revision_conflict');
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await a.end();
      await b.end();
    }
  });
});

describe('shift_pending_workouts — a função antiga não existe mais', () => {
  it('foi dropada pela migration', async () => {
    const { rows } = await getPool().query(
      `SELECT to_regprocedure('public.shift_pending_workouts(uuid, integer)') AS fn`,
    );
    expect(rows[0].fn).toBeNull();
  });
});
