/**
 * Fixtures dos testes de integração da fundação (Fase 6.1).
 *
 * As datas são expressas em DIAS RELATIVOS a um "hoje" explícito, nunca
 * `new Date()`. A fronteira da Fase 6 é "amanhã em diante" no fuso de São
 * Paulo, e um teste que dependesse do relógio da máquina passaria ou falharia
 * conforme a hora em que rodasse — exatamente a classe de bug que a fronteira
 * existe para impedir.
 */

import { getPool } from './db';

export const TODAY = '2026-08-15';

/** Soma dias a YYYY-MM-DD sem envolver fuso (espelha `addDaysStr` do backend). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Segmentos realistas: os mesmos campos que `applyDeterministicPaces` grava. */
export function segments(paceMin = 459, paceMax = 509): unknown[] {
  return [
    { type: 'warmup', zone: 'Z1', distance_km: 1, pace_min: paceMin, pace_max: paceMax },
    { type: 'main', zone: 'Z1', distance_km: 4, pace_min: paceMin, pace_max: paceMax },
    { type: 'cooldown', zone: 'Z1', distance_km: 1, pace_min: paceMin, pace_max: paceMax },
  ];
}

/** Contínuo com `main` parametrizável — para montar semanas com folgas diferentes. */
export function continuousSegments(mainKm: number, paceMin = 400): unknown[] {
  return [
    { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: paceMin, pace_max: paceMin + 40 },
    { type: 'main', zone: 'Z2', distance_km: mainKm, pace_min: paceMin - 40, pace_max: paceMin },
    { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: paceMin, pace_max: paceMin + 40 },
  ];
}

/**
 * INTERVALADO — o formato que a validação da 6.2 no device nunca exercitou.
 *
 * O plano de teste de staging era 100% contínuo, então a regra de reduzir
 * repetições e o piso de 2 tiros nunca rodaram contra dado real. Este fixture
 * existe para fechar esse ponto cego na 6.3.
 *
 * Total = 2 + reps×(work+recovery) + 2.
 */
export function intervalSegments(
  reps = 6,
  workKm = 0.8,
  recoveryKm = 0.4,
): unknown[] {
  return [
    { type: 'warmup', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
    {
      type: 'repeat',
      reps,
      work: { distance_km: workKm, pace_min: 240, pace_max: 250, zone: 'Z4' },
      recovery: { distance_km: recoveryKm, pace_min: 420, pace_max: 460, zone: 'Z1' },
    },
    { type: 'cooldown', zone: 'Z1', distance_km: 2, pace_min: 400, pace_max: 440 },
  ];
}

export interface SeedWorkout {
  /** Deslocamento em dias a partir de `today`. Negativo = passado. */
  offset: number;
  status?: 'pending' | 'completed' | 'missed' | 'skipped';
  weekNumber?: number;
  distanceKm?: number;
  isRaceDay?: boolean;
  source?: 'plan' | 'manual' | 'free';
  /** `true` desliga o `plan_id` — simula corrida manual/livre. */
  orphan?: boolean;
  instructions?: unknown[];
  /**
   * `long_run` · `tempo` · `intervals` · `race_simulation` · `easy_run`…
   *
   * Só passa a importar na Fase 6.3: é o `type` que decide quem cede volume e
   * quem é qualidade protegida.
   */
  type?: string;
}

export interface SeedPlanOptions {
  today?: string;
  planStatus?: 'active' | 'completed' | 'cancelled';
  generationStatus?: 'generating' | 'complete' | 'failed' | 'partial';
  durationWeeks?: number;
  goal?: string;
  vdotCurrent?: number | null;
  workouts?: SeedWorkout[];
}

export interface SeededPlan {
  userId: string;
  planId: string;
  today: string;
  /** id do workout, indexado pelo `offset` usado no seed. */
  byOffset: Record<number, string>;
  workoutIds: string[];
}

const DEFAULT_WORKOUTS: SeedWorkout[] = [
  { offset: -2, status: 'completed', weekNumber: 1 },
  { offset: -1, status: 'missed', weekNumber: 1 },
  { offset: 0, status: 'pending', weekNumber: 1 }, // HOJE — congelado
  { offset: 1, status: 'pending', weekNumber: 1 }, // amanhã — editável
  { offset: 3, status: 'pending', weekNumber: 1 },
  { offset: 5, status: 'pending', weekNumber: 2 },
  { offset: 7, status: 'pending', weekNumber: 2 },
];

export async function seedPlan(
  opts: SeedPlanOptions = {},
): Promise<SeededPlan> {
  const pool = getPool();
  const today = opts.today ?? TODAY;
  const rows = opts.workouts ?? DEFAULT_WORKOUTS;

  const { rows: userRows } = await pool.query<{ id: string }>(
    `INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`,
  );
  const userId = userRows[0].id;

  // UPSERT e não INSERT: o trigger `on_auth_user_created` (migration de
  // paridade 20260608) JÁ cria a linha em `public.users` quando `auth.users`
  // recebe o insert — exatamente como em produção. Insistir num INSERT puro
  // colidiria com a PK e, pior, esconderia o fato de que o trigger roda.
  await pool.query(
    `INSERT INTO public.users (id, email, subscription_plan, subscription_status)
     VALUES ($1, $2, 'pro', 'active')
     ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            subscription_plan = EXCLUDED.subscription_plan,
            subscription_status = EXCLUDED.subscription_status`,
    [userId, `tester-${userId.slice(0, 8)}@example.test`],
  );

  const { rows: planRows } = await pool.query<{ id: string }>(
    `INSERT INTO public.training_plans
       (user_id, goal, goal_type, duration_weeks, frequency_per_week,
        plan_json, status, generation_status, vdot_current, created_at)
     VALUES ($1, $2, 'distance', $3, 4, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      opts.goal ?? '10k',
      opts.durationWeeks ?? 12,
      JSON.stringify({ weeks: [], duration_weeks: opts.durationWeeks ?? 12 }),
      opts.planStatus ?? 'active',
      opts.generationStatus ?? 'complete',
      opts.vdotCurrent === undefined ? 40 : opts.vdotCurrent,
      `${addDays(today, -14)}T09:00:00Z`,
    ],
  );
  const planId = planRows[0].id;

  const byOffset: Record<number, string> = {};
  const workoutIds: string[] = [];

  for (const w of rows) {
    const { rows: wr } = await pool.query<{ id: string }>(
      `INSERT INTO public.workouts
         (plan_id, user_id, type, week_number, scheduled_date, distance_km,
          instructions_json, status, source, is_race_day, metadata)
       VALUES ($1, $2, $11, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        w.orphan ? null : planId,
        userId,
        w.weekNumber ?? 1,
        addDays(today, w.offset),
        w.distanceKm ?? 6,
        JSON.stringify(w.instructions ?? segments()),
        w.status ?? 'pending',
        w.source ?? (w.orphan ? 'free' : 'plan'),
        w.isRaceDay ?? false,
        JSON.stringify({ zone: 'Z1', week_phase: 'base' }),
        w.type ?? 'easy_run',
      ],
    );
    byOffset[w.offset] = wr[0].id;
    workoutIds.push(wr[0].id);
  }

  return { userId, planId, today, byOffset, workoutIds };
}

/** O md5 que a função SQL compara — o mesmo cálculo, para o teste montar o patch. */
export async function instructionsMd5(workoutId: string): Promise<string> {
  const { rows } = await getPool().query<{ md5: string }>(
    `SELECT md5(instructions_json::text) AS md5
       FROM public.workouts WHERE id = $1`,
    [workoutId],
  );
  return rows[0].md5;
}

export async function readWorkout(workoutId: string) {
  const { rows } = await getPool().query(
    `SELECT id, status, scheduled_date::text AS scheduled_date, distance_km,
            instructions_json, plan_id
       FROM public.workouts WHERE id = $1`,
    [workoutId],
  );
  return rows[0];
}
