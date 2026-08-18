/**
 * Fase 6.2 — o alívio de volume contra Postgres de verdade.
 *
 * ── O QUE SÓ EXISTE AQUI ──────────────────────────────────────────────────────
 *
 * A 6.2 é a primeira feature a reescrever `instructions_json`, e portanto a
 * primeira a exercitar o COMPARE-AND-SWAP POR LINHA de verdade: o md5 é
 * calculado pelo Postgres (que normaliza jsonb), e não há como reproduzi-lo em
 * JavaScript. Um mock aceitaria qualquer string e a corrida F3×F6 — a mina 4 da
 * reauditoria — continuaria aberta sem ninguém notar.
 *
 * Os testes de unidade cobrem a decisão (`computeRelief`) e os guards. Aqui se
 * prova o que só o banco pode provar: CAS, rollback, digest e idempotência.
 */

import { resetData, getPool, closePool } from '../db/db';
import { seedPlan, addDays, segments, TODAY, instructionsMd5, readWorkout } from '../db/fixtures';
import { applyAdaptation, stateDigest, editableWorkouts, countAdaptations } from './helpers';

jest.setTimeout(30000);

beforeEach(() => resetData());
afterAll(() => closePool());

/** 2 + 6 + 2 = 10 km — a forma que o alívio contínuo reduz. */
const longRun = () => [
  { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 459, pace_max: 509 },
  { type: 'main', zone: 'Z2', distance_km: 6, pace_min: 400, pace_max: 430 },
  { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 459, pace_max: 509 },
];

/** O patch que `VolumeReliefService` monta para um alívio de −20%. */
const reliefPatch = (workoutId: string, md5: string) => [
  {
    workout_id: workoutId,
    expected: { status: 'pending', instructions_md5: md5 },
    set: {
      distance_km: 8,
      instructions_json: [
        { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 459, pace_max: 509 },
        { type: 'main', zone: 'Z2', distance_km: 4, pace_min: 400, pace_max: 430 },
        { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 459, pace_max: 509 },
      ],
    },
  },
];

const seedRelief = () =>
  seedPlan({
    workouts: [
      { offset: 0, status: 'pending', instructions: longRun(), distanceKm: 10 },
      { offset: 3, status: 'pending', instructions: longRun(), distanceKm: 10 },
      { offset: 5, status: 'pending', instructions: longRun(), distanceKm: 10 },
    ],
  });

describe('alívio de volume — o caminho feliz', () => {
  it('grava segmentos e distância, e registra a adaptação', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];
    const md5 = await instructionsMd5(target);

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-relief',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, md5),
      meta: { source: 'manual', reason_code: 'relief_light' },
    });

    expect(r.applied).toBe(true);
    expect(r.affected?.workouts).toBe(1);

    const w = await readWorkout(target);
    expect(Number(w.distance_km)).toBe(8);
    expect(w.instructions_json[1].distance_km).toBe(4);
    // A invariante da fase: pace intacto.
    expect(w.instructions_json[1].pace_min).toBe(400);
    expect(w.instructions_json[1].pace_max).toBe(430);

    const { rows } = await getPool().query(
      `SELECT kind, reason_code, workout_ids, changes
         FROM public.plan_adaptations WHERE plan_id = $1`,
      [p.planId],
    );
    expect(rows[0].kind).toBe('reduzir_volume');
    expect(rows[0].reason_code).toBe('relief_light');
    expect(rows[0].workout_ids).toEqual([target]);
    // O `changes` guarda antes E depois — é o que torna o desfazer possível.
    expect(rows[0].changes[0].before.distance_km).toBe(10);
    expect(rows[0].changes[0].after.distance_km).toBe(8);
  });

  it('o digest MUDA depois do alívio', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];
    const antes = await stateDigest(p.planId, TODAY);

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: antes,
      idempotencyKey: 'k-digest',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    expect(await stateDigest(p.planId, TODAY)).not.toBe(antes);
  });

  it('não toca em nenhum outro treino da janela', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-só-um',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    const vizinho = await readWorkout(p.byOffset[5]);
    expect(Number(vizinho.distance_km)).toBe(10);
    expect(vizinho.instructions_json[1].distance_km).toBe(6);
  });
});

describe('alívio de volume — concorrência', () => {
  it('segundo apply com o digest VELHO é rejeitado (o corredor viu outro plano)', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];
    const digestDaPreview = await stateDigest(p.planId, TODAY);

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: digestDaPreview,
      idempotencyKey: 'k-primeiro',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    // Agora o alvo mudou. Um segundo apply carregando o digest da MESMA preview
    // descreve um mundo que não existe mais.
    const r2 = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: digestDaPreview,
      idempotencyKey: 'k-segundo',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, 'md5-do-estado-velho'),
    });

    expect(r2.applied).toBe(false);
    expect(r2.reason).toBe('revision_conflict');
    // O digest atual volta junto, para o serviço recalcular a preview.
    expect(r2.current_digest).toBeTruthy();

    // Nada foi reescrito por cima: continua o resultado do PRIMEIRO alívio.
    const w = await readWorkout(target);
    expect(Number(w.distance_km)).toBe(8);
    expect(await countAdaptations(p.planId)).toBe(1);
  });

  it('A FASE 3 REPRECIFICOU no meio → row_conflict pelo md5 (a mina 4)', async () => {
    // O digest do agregado NÃO pega este caso: `plan_state_digest` inclui o md5
    // dos segmentos, mas o cenário abaixo é o que acontece quando duas escritas
    // partem do mesmo digest e disputam o mesmo array. O CAS por linha é a
    // segunda camada, e é ela que decide.
    const p = await seedRelief();
    const target = p.byOffset[3];

    const md5DaPreview = await instructionsMd5(target);

    // A F3 troca os paces — mesmo treino, array diferente.
    await getPool().query(
      `UPDATE public.workouts SET instructions_json = $2 WHERE id = $1`,
      [target, JSON.stringify(segments(380, 410))],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      // Digest recalculado: o agregado "confere". Só o md5 da linha discorda.
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-f3',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, md5DaPreview),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');

    // Os paces da F3 sobreviveram — o alívio não os apagou.
    const w = await readWorkout(target);
    expect(w.instructions_json[1].pace_min).toBe(380);
    expect(await countAdaptations(p.planId)).toBe(0);
  });

  it('replay da mesma preview devolve o gravado, sem reduzir de novo', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-replay',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    };

    const r1 = await applyAdaptation(args);
    const r2 = await applyAdaptation(args);

    expect(r1.applied).toBe(true);
    expect(r2.applied).toBe(true);
    expect(r2.replayed).toBe(true);

    // 8 km, não 6,4 — o alívio não foi aplicado duas vezes.
    const w = await readWorkout(target);
    expect(Number(w.distance_km)).toBe(8);
    expect(await countAdaptations(p.planId)).toBe(1);
  });

  it('dois aparelhos em paralelo: a UNIQUE decide, uma linha só', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];
    const args = {
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-dois-aparelhos',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    };

    const [a, b] = await Promise.all([
      applyAdaptation(args),
      applyAdaptation(args),
    ]);

    expect(a.applied).toBe(true);
    expect(b.applied).toBe(true);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
    expect(await countAdaptations(p.planId)).toBe(1);
    expect(Number((await readWorkout(target)).distance_km)).toBe(8);
  });
});

describe('alívio de volume — a fronteira, no SQL', () => {
  it('recusa o treino de HOJE mesmo com digest e md5 corretos', async () => {
    const p = await seedRelief();
    const hoje = p.byOffset[0];

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-hoje',
      kind: 'reduzir_volume',
      patch: reliefPatch(hoje, await instructionsMd5(hoje)),
    });

    expect(r.applied).toBe(false);
    expect(r.reason).toBe('row_conflict');
    expect(Number((await readWorkout(hoje)).distance_km)).toBe(10);
  });

  it('recusa dia de prova — invariante do contrato', async () => {
    const p = await seedPlan({
      workouts: [
        { offset: 3, status: 'pending', isRaceDay: true, instructions: longRun(), distanceKm: 10 },
      ],
    });
    const prova = p.byOffset[3];

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-prova',
      kind: 'reduzir_volume',
      patch: reliefPatch(prova, await instructionsMd5(prova)),
    });

    expect(r.applied).toBe(false);
    expect(Number((await readWorkout(prova)).distance_km)).toBe(10);
  });

  it('o treino de hoje NEM APARECE na janela que a preview lê', async () => {
    const p = await seedRelief();
    const janela = await editableWorkouts(p.planId, TODAY);
    expect(janela.map((w) => w.id).sort()).toEqual(
      [p.byOffset[3], p.byOffset[5]].sort(),
    );
  });
});

describe('alívio de volume — briefing (o ponto cego da 6.1)', () => {
  it('invalida o briefing do treino aliviado', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];

    await getPool().query(
      `INSERT INTO public.workout_briefings (workout_id, user_id, content)
       VALUES ($1, $2, 'Hoje é dia de longão: 10 km em ritmo confortável.')`,
      [target, p.userId],
    );

    const r = await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-briefing',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    expect(r.applied).toBe(true);
    // Sem apagar, a voz do treinador continuaria descrevendo os 10 km ao lado
    // de um card que agora mostra 8. O texto regenera na próxima abertura.
    expect(r.affected?.briefings).toBe(1);

    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM public.workout_briefings WHERE workout_id = $1`,
      [target],
    );
    expect(rows[0].n).toBe(0);
  });

  it('NÃO apaga o briefing quando o alívio é rejeitado', async () => {
    const p = await seedRelief();
    const target = p.byOffset[3];

    await getPool().query(
      `INSERT INTO public.workout_briefings (workout_id, user_id, content)
       VALUES ($1, $2, 'texto original')`,
      [target, p.userId],
    );

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: 'digest-velho',
      idempotencyKey: 'k-briefing-rejeitado',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM public.workout_briefings WHERE workout_id = $1`,
      [target],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe('alívio de volume — coerência com a aderência', () => {
  it('o volume reduzido vira o NOVO alvo do denominador', async () => {
    // A regra permanente: o corredor não pode aliviar com o coach e ser
    // penalizado por isso na semana seguinte. `plannedDistanceKm` e
    // `executionRatioPercent` leem `workouts.distance_km` AO VIVO — este teste
    // trava esse acoplamento, que hoje está correto por construção.
    const p = await seedRelief();
    const target = p.byOffset[3];

    await applyAdaptation({
      userId: p.userId,
      planId: p.planId,
      today: TODAY,
      digest: await stateDigest(p.planId, TODAY),
      idempotencyKey: 'k-aderencia',
      kind: 'reduzir_volume',
      patch: reliefPatch(target, await instructionsMd5(target)),
    });

    const { rows } = await getPool().query(
      `SELECT coalesce(sum(distance_km), 0)::float AS prescrito
         FROM public.workouts
        WHERE plan_id = $1 AND scheduled_date >= $2`,
      [p.planId, addDays(TODAY, 1)],
    );
    // 8 + 10, não 10 + 10: quem mede a semana vê o alvo novo.
    expect(rows[0].prescrito).toBe(18);
  });
});
