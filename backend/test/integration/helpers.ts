/**
 * Chamada das funções da fundação, do jeito que o backend as chama.
 *
 * Notação nomeada (`p_x => $n`) de propósito: a função tem 11 parâmetros, e
 * posicional seria ilegível e frágil a qualquer reordenação.
 */

import { PoolClient, Client } from 'pg';
import { getPool } from '../db/db';

export interface ApplyResult {
  applied: boolean;
  replayed?: boolean;
  reason?: string;
  adaptation_id?: string;
  digest_after?: string;
  current_digest?: string;
  detail?: string;
  affected?: { workouts: number; briefings: number; onboarding?: number };
  shifted?: number;
  reclaimed?: number;
  delta_days?: number;
}

export interface PatchItem {
  workout_id: string;
  expected: { status: string; instructions_md5?: string };
  set: Record<string, unknown>;
}

const APPLY_SQL = `
  SELECT public.apply_plan_adaptation(
    p_user_id              => $1::uuid,
    p_plan_id              => $2::uuid,
    p_today                => $3::date,
    p_expected_digest      => $4::text,
    p_idempotency_key      => $5::text,
    p_kind                 => $6::text,
    p_patch                => $7::jsonb,
    p_invalidate_briefings => $8::boolean,
    p_meta                 => $9::jsonb,
    p_plan_patch           => $10::jsonb,
    p_vdot_history         => $11::jsonb,
    p_onboarding_patch     => $12::jsonb
  ) AS result
`;

export interface ApplyArgs {
  userId: string;
  planId: string;
  today: string;
  digest: string;
  idempotencyKey: string;
  kind?: string;
  patch: PatchItem[];
  invalidateBriefings?: boolean;
  meta?: Record<string, unknown>;
  planPatch?: Record<string, unknown> | null;
  vdotHistory?: Record<string, unknown> | null;
  /** Troca de Dias T.1 — whitelist `{ available_days }`. */
  onboardingPatch?: Record<string, unknown> | null;
}

function applyParams(a: ApplyArgs): unknown[] {
  return [
    a.userId,
    a.planId,
    a.today,
    a.digest,
    a.idempotencyKey,
    a.kind ?? 'reduzir_frequencia',
    JSON.stringify(a.patch),
    a.invalidateBriefings ?? true,
    JSON.stringify(a.meta ?? { source: 'manual' }),
    a.planPatch ? JSON.stringify(a.planPatch) : null,
    a.vdotHistory ? JSON.stringify(a.vdotHistory) : null,
    a.onboardingPatch ? JSON.stringify(a.onboardingPatch) : null,
  ];
}

export async function applyAdaptation(a: ApplyArgs): Promise<ApplyResult> {
  const { rows } = await getPool().query(APPLY_SQL, applyParams(a));
  return rows[0].result as ApplyResult;
}

/** A mesma chamada, numa conexão específica — para os testes de concorrência. */
export async function applyAdaptationOn(
  client: PoolClient | Client,
  a: ApplyArgs,
): Promise<ApplyResult> {
  const { rows } = await client.query(APPLY_SQL, applyParams(a));
  return rows[0].result as ApplyResult;
}

const SHIFT_SQL = `
  SELECT public.apply_schedule_shift(
    p_user_id         => $1::uuid,
    p_plan_id         => $2::uuid,
    p_workout_ids     => $3::uuid[],
    p_days            => $4::integer,
    p_today           => $5::date,
    p_expected_digest => $6::text,
    p_idempotency_key => $7::text,
    p_insight_id      => $8::uuid,
    p_meta            => $9::jsonb
  ) AS result
`;

export interface ShiftArgs {
  userId: string;
  planId: string;
  workoutIds: string[];
  days: number;
  today: string;
  digest: string;
  idempotencyKey: string;
  insightId?: string | null;
  meta?: Record<string, unknown>;
}

function shiftParams(a: ShiftArgs): unknown[] {
  return [
    a.userId,
    a.planId,
    a.workoutIds,
    a.days,
    a.today,
    a.digest,
    a.idempotencyKey,
    a.insightId ?? null,
    JSON.stringify(a.meta ?? { source: 'reactivation' }),
  ];
}

export async function applyShift(a: ShiftArgs): Promise<ApplyResult> {
  const { rows } = await getPool().query(SHIFT_SQL, shiftParams(a));
  return rows[0].result as ApplyResult;
}

export async function applyShiftOn(
  client: PoolClient | Client,
  a: ShiftArgs,
): Promise<ApplyResult> {
  const { rows } = await client.query(SHIFT_SQL, shiftParams(a));
  return rows[0].result as ApplyResult;
}

export async function stateDigest(
  planId: string,
  today: string,
): Promise<string> {
  const { rows } = await getPool().query(
    `SELECT public.plan_state_digest($1::uuid, $2::date) AS d`,
    [planId, today],
  );
  return rows[0].d as string;
}

export async function editableWorkouts(planId: string, today: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM public.plan_editable_workouts($1::uuid, $2::date)`,
    [planId, today],
  );
  return rows as Array<{
    id: string;
    status: string;
    scheduled_date: Date;
    instructions_md5: string;
    distance_km: number | null;
  }>;
}

export async function countAdaptations(planId: string): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS n FROM public.plan_adaptations WHERE plan_id = $1`,
    [planId],
  );
  return rows[0].n as number;
}

/** Resolve em `true` se a promise NÃO tiver terminado em `ms`. */
export async function isStillPending(
  p: Promise<unknown>,
  ms = 400,
): Promise<boolean> {
  const marker = Symbol('pending');
  const timer = new Promise((r) => setTimeout(() => r(marker), ms));
  return (await Promise.race([p.then(() => null), timer])) === marker;
}
