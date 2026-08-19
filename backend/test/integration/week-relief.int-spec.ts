/**
 * Fase 6.3 — o alívio da SEMANA contra Postgres de verdade.
 *
 * ── O QUE SÓ EXISTE AQUI ──────────────────────────────────────────────────────
 *
 * A 6.2 provou o CAS por linha com UM treino. A 6.3 aplica N numa transação só,
 * e é isso que este arquivo exercita: N md5 independentes, e a garantia de que
 * um único deles fora de lugar desfaz o patch inteiro. "Aliviou 3 de 4" não é um
 * estado possível — e só o banco pode provar isso.
 *
 * ── O PONTO CEGO DA 6.2, FECHADO ─────────────────────────────────────────────
 *
 * O plano de teste do device era 100% contínuo: nenhum bloco `repeat`. A regra
 * de reduzir repetições e o piso de 2 tiros nunca rodaram contra dado real. A
 * semana aqui tem DOIS intervalados de propósito:
 *
 *   `tempo`      intervalado e PROTEGIDO   → prova que sai intacto, reps inclusive
 *   `easy_run`   intervalado e CORTÁVEL    → prova que a redução de reps roda
 *
 * Os dois juntos cobrem o caminho inteiro.
 */

import { resetData, getPool, closePool } from '../db/db';
import {
  seedPlan,
  addDays,
  TODAY,
  continuousSegments,
  intervalSegments,
  instructionsMd5,
  readWorkout,
} from '../db/fixtures';
import { applyAdaptation, stateDigest, countAdaptations } from './helpers';
import {
  computeWeekRelief,
  WeekWorkoutInput,
} from '../../src/modules/training/helpers/week-relief.helper';

jest.setTimeout(30000);

beforeEach(() => resetData());
afterAll(() => closePool());

/**
 * A semana da SEMANA 2, toda no futuro (offsets 5..9 a partir de hoje).
 *
 *   longão      2+8+2 = 12 km   cortável
 *   tempo       2+6×1+2 = 10 km PROTEGIDO (intervalado)
 *   easy        2+3+2 = 7 km    cortável
 *   easy c/ str 2+4×0.6+2 = 6,4 cortável (intervalado — strides)
 */
const seedSemana = () =>
  seedPlan({
    workouts: [
      // Semana 1 — a corrente. Só existe para a semana 2 ser "a seguinte".
      { offset: 1, status: 'pending', weekNumber: 1, type: 'easy_run' },
      // Semana 2 — o alvo.
      {
        offset: 5,
        status: 'pending',
        weekNumber: 2,
        type: 'long_run',
        distanceKm: 12,
        instructions: continuousSegments(8),
      },
      {
        offset: 6,
        status: 'pending',
        weekNumber: 2,
        type: 'tempo',
        distanceKm: 10,
        instructions: intervalSegments(6, 0.8, 0.2),
      },
      {
        offset: 8,
        status: 'pending',
        weekNumber: 2,
        type: 'easy_run',
        distanceKm: 7,
        instructions: continuousSegments(3),
      },
      {
        offset: 9,
        status: 'pending',
        weekNumber: 2,
        type: 'easy_run',
        distanceKm: 6.4,
        instructions: intervalSegments(4, 0.4, 0.2),
      },
    ],
  });

/** Lê a semana 2 do banco no formato que a política consome. */
async function semanaDoBanco(planId: string): Promise<WeekWorkoutInput[]> {
  const { rows } = await getPool().query(
    `SELECT id, type, title, scheduled_date::text AS scheduled_date,
            instructions_json
       FROM public.workouts
      WHERE plan_id = $1 AND week_number = 2
      ORDER BY scheduled_date`,
    [planId],
  );
  return rows as WeekWorkoutInput[];
}

/** Monta o patch multi-item exatamente como `VolumeReliefService.applyWeek`. */
async function patchDaSemana(planId: string, level: 'light' | 'strong') {
  const semana = await semanaDoBanco(planId);
  const out = computeWeekRelief(semana, level);
  if ('reason' in out) throw new Error(`política recusou: ${out.reason}`);

  const patch = [];
  for (const c of out.result.changes.filter((x) => x.changed)) {
    patch.push({
      workout_id: c.workoutId,
      expected: {
        status: 'pending',
        instructions_md5: await instructionsMd5(c.workoutId),
      },
      set: { distance_km: c.afterKm, instructions_json: c.segments },
    });
  }
  return { patch, result: out.result };
}

describe('alívio da semana — o patch multi-item', () => {
  it('aplica N treinos numa transação só', async () => {
    const p = await seedSemana();
    const { patch, result } = await patchDaSemana(p.planId, 'light');

    expect(patch.length).toBeGreaterThan(1); // é multi-item de verdade

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-semana',
      kind: 'reduzir_volume',
      patch,
      meta: { source: 'weekly_insight', reason_code: 'week_relief_light' },
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.workouts).toBe(patch.length);

    // Uma linha de histórico para a semana inteira, com todos os ids.
    const { rows } = await getPool().query(
      `SELECT kind, reason_code, workout_ids, jsonb_array_length(changes) AS n
         FROM public.plan_adaptations WHERE plan_id = $1`,
      [p.planId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('reduzir_volume');
    expect(rows[0].workout_ids).toHaveLength(patch.length);
    expect(Number(rows[0].n)).toBe(patch.length);

    // O total da semana no banco bate com o que a política prometeu.
    const { rows: soma } = await getPool().query(
      `SELECT coalesce(sum(distance_km), 0)::float AS km
         FROM public.workouts WHERE plan_id = $1 AND week_number = 2`,
      [p.planId],
    );
    expect(soma[0].km).toBeCloseTo(result.weekTotalKmAfter, 1);
  });

  it('a QUALIDADE sai intacta — reps do intervalado protegido inclusive', async () => {
    const p = await seedSemana();
    const tempoId = p.byOffset[6];
    const antes = await readWorkout(tempoId);

    const { patch } = await patchDaSemana(p.planId, 'strong');
    // O tempo nem chega a entrar no patch.
    expect(patch.map((x) => x.workout_id)).not.toContain(tempoId);

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-qualidade',
      kind: 'reduzir_volume',
      patch,
    });

    const depois = await readWorkout(tempoId);
    expect(Number(depois.distance_km)).toBe(Number(antes.distance_km));
    expect(depois.instructions_json[1].reps).toBe(6); // reps intactas
    expect(depois.instructions_json).toEqual(antes.instructions_json);
  });

  it('o INTERVALADO CORTÁVEL perde repetições — o ponto cego da 6.2', async () => {
    // Este é o caminho que a validação no device nunca exercitou: um bloco
    // `repeat` que PODE ceder. Aqui ele roda contra dado real, ida e volta pelo
    // Postgres (que normaliza jsonb — o md5 do CAS depende disso).
    const p = await seedSemana();
    const stridesId = p.byOffset[9];
    const antes = await readWorkout(stridesId);
    expect(antes.instructions_json[1].reps).toBe(4);

    const { patch } = await patchDaSemana(p.planId, 'strong');

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-strides',
      kind: 'reduzir_volume',
      patch,
    });
    expect(r.applied).toBe(true);

    const depois = await readWorkout(stridesId);
    const rep = depois.instructions_json[1];

    expect(rep.reps).toBeLessThan(4);
    expect(rep.reps).toBeGreaterThanOrEqual(2); // o piso vale
    // Cada tiro mantém a distância: 4×400m vira 3×400m, nunca 4×300m.
    expect(rep.work.distance_km).toBe(antes.instructions_json[1].work.distance_km);
    // E o pace do tiro não foi tocado.
    expect(rep.work.pace_min).toBe(antes.instructions_json[1].work.pace_min);
    expect(rep.work.pace_max).toBe(antes.instructions_json[1].work.pace_max);
  });

  it('o pace de TODOS os treinos alterados é idêntico antes e depois', async () => {
    const p = await seedSemana();
    const { patch } = await patchDaSemana(p.planId, 'strong');

    const antes = new Map<string, unknown>();
    for (const item of patch) {
      const w = await readWorkout(item.workout_id);
      antes.set(item.workout_id, JSON.stringify(pacesOf(w.instructions_json)));
    }

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-pace',
      kind: 'reduzir_volume',
      patch,
    });

    for (const item of patch) {
      const w = await readWorkout(item.workout_id);
      expect(JSON.stringify(pacesOf(w.instructions_json))).toBe(
        antes.get(item.workout_id),
      );
    }
  });
});

describe('alívio da semana — tudo ou nada com N itens', () => {
  it('UM item em conflito rejeita o patch INTEIRO, não N−1', async () => {
    const p = await seedSemana();
    const { patch } = await patchDaSemana(p.planId, 'light');
    expect(patch.length).toBeGreaterThanOrEqual(2);

    const antes = await Promise.all(
      patch.map(async (i) => Number((await readWorkout(i.workout_id)).distance_km)),
    );

    // Um único md5 errado — como se a F3 tivesse reprecificado só aquele treino.
    const sabotado = patch.map((item, i) =>
      i === 1 ? { ...item, expected: { ...item.expected, instructions_md5: 'md5-velho' } } : item,
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-parcial',
      kind: 'reduzir_volume',
      patch: sabotado,
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');

    // NENHUM dos N mudou — nem os que estavam corretos.
    const depois = await Promise.all(
      patch.map(async (i) => Number((await readWorkout(i.workout_id)).distance_km)),
    );
    expect(depois).toEqual(antes);
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('digest velho rejeita antes de escrever qualquer um dos N', async () => {
    const p = await seedSemana();
    const { patch } = await patchDaSemana(p.planId, 'light');

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: 'digest-de-outro-mundo',
      idempotencyKey: 'k-digest-velho',
      kind: 'reduzir_volume',
      patch,
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('revision_conflict');
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('replay da semana devolve o gravado, sem cortar de novo', async () => {
    const p = await seedSemana();
    const { patch, result } = await patchDaSemana(p.planId, 'light');
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-replay-semana',
      kind: 'reduzir_volume',
      patch,
    };

    const r1 = await applyAdaptation(args);
    const r2 = await applyAdaptation(args);

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    expect(r2.replayed).toBe(true);
    expect(await countAdaptations(p.planId)).toBe(1);

    const { rows } = await getPool().query(
      `SELECT coalesce(sum(distance_km), 0)::float AS km
         FROM public.workouts WHERE plan_id = $1 AND week_number = 2`,
      [p.planId],
    );
    expect(rows[0].km).toBeCloseTo(result.weekTotalKmAfter, 1);
  });

  it('dois aparelhos em paralelo → uma linha só', async () => {
    const p = await seedSemana();
    const { patch } = await patchDaSemana(p.planId, 'light');
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-dois-aparelhos-semana',
      kind: 'reduzir_volume',
      patch,
    };

    const [a, b] = await Promise.all([
      applyAdaptation(args),
      applyAdaptation(args),
    ]);

    expect(a.applied).toBe(true);
    expect(b.applied).toBe(true);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(await countAdaptations(p.planId)).toBe(1);
  });
});

describe('alívio da semana — briefings e coerência', () => {
  it('invalida o briefing de TODOS os treinos alterados', async () => {
    const p = await seedSemana();
    const { patch } = await patchDaSemana(p.planId, 'light');

    for (const item of patch) {
      await getPool().query(
        `INSERT INTO public.workout_briefings (workout_id, user_id, content)
         VALUES ($1, $2, 'texto do coach')`,
        [item.workout_id, p.userId],
      );
    }

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-briefings-semana',
      kind: 'reduzir_volume',
      patch,
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.briefings).toBe(patch.length);
  });

  it('o denominador da aderência da semana usa os valores NOVOS', async () => {
    // A regra permanente: o corredor não pode aliviar com o coach e ser
    // penalizado por isso. `plannedDistanceKm` soma `distance_km` ao vivo — este
    // teste trava esse acoplamento no nível da semana.
    const p = await seedSemana();
    const { patch, result } = await patchDaSemana(p.planId, 'light');

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-aderencia-semana',
      kind: 'reduzir_volume',
      patch,
    });

    const { rows } = await getPool().query(
      `SELECT coalesce(sum(distance_km), 0)::float AS prescrito
         FROM public.workouts WHERE plan_id = $1 AND week_number = 2`,
      [p.planId],
    );
    expect(rows[0].prescrito).toBeCloseTo(result.weekTotalKmAfter, 1);
    expect(rows[0].prescrito).toBeLessThan(result.weekTotalKmBefore);
  });

  it('a semana 1 (corrente) NÃO é tocada', async () => {
    const p = await seedSemana();
    const antes = await readWorkout(p.byOffset[1]);

    const { patch } = await patchDaSemana(p.planId, 'strong');
    expect(patch.map((x) => x.workout_id)).not.toContain(p.byOffset[1]);

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-semana-1',
      kind: 'reduzir_volume',
      patch,
    });

    const depois = await readWorkout(p.byOffset[1]);
    expect(Number(depois.distance_km)).toBe(Number(antes.distance_km));
  });
});

function pacesOf(segments: any): unknown[] {
  const out: unknown[] = [];
  const walk = (s: any) => {
    if (!s || typeof s !== 'object') return;
    if (s.type === 'repeat') {
      walk(s.work);
      walk(s.recovery);
      return;
    }
    out.push([s.pace_min, s.pace_max, s.zone]);
  };
  (segments as any[]).forEach(walk);
  return out;
}
