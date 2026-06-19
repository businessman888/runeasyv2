/**
 * AI Full-Flow Cost Audit (REAL, multi-duration) — RunEasy V2
 *
 * Simula o fluxo completo de um usuário real em STAGING, para VÁRIAS durações de
 * plano, e gera um relatório de custo real consolidado lido de `ai_usage_logs`.
 *
 * Por que existe: o `ai-cost-audit.ts` só LÊ os logs; o `ai-audit-stress-test.ts`
 * usa prompts simulados. Este script exercita o caminho de produção de verdade
 * (webhook RevenueCat → geração de plano; endpoints autenticados de readiness,
 * feedback e retrospectiva) e mede o custo real de cada feature E de cada duração
 * de plano separadamente — sem agregar 4 semanas com 24 semanas.
 *
 * ⚠️  STAGING-ONLY. Carrega backend/.env.staging e RECUSA rodar contra o projeto de
 *     produção (ndlsxgsccyjspbhzccyp) salvo `--allow-prod`. NÃO altera código de
 *     backend/src — apenas lê/escreve DADOS de teste no Supabase de staging.
 *
 * Importante sobre a duração do plano (confirmado em diagnóstico):
 *   O backend lê `responses_json.target_weeks` (jsonb) COM PRECEDÊNCIA sobre a
 *   coluna `target_weeks`. Por isso, antes de cada geração, este script grava o
 *   MESMO valor nos DOIS lugares (coluna + chave dentro do jsonb, preservando os
 *   demais campos via read-modify-write).
 *
 * Uso:
 *   npx ts-node scripts/ai-full-flow-audit.ts
 *   npx ts-node scripts/ai-full-flow-audit.ts --durations 4,12,20,24 --users 1000
 *
 * Flags:
 *   --user <uuid>        usuário de teste (default fac0acbd-...-12012ca3)
 *   --durations a,b,c    durações em semanas a testar (default 4,12,20,24)
 *   --users <n>          tamanho da projeção mensal (default 1000)
 *   --readiness-per-user <n>  default 20      --feedbacks-per-user <n>  default 15
 *   --plans-per-user <n>      default 1       --retros-per-user <n>     default 1
 *   --env-file <path>    dotenv (default '.env.staging')
 *   --api <baseUrl>      backend de staging (default runeasyv2-staging.up.railway.app)
 *   --skip-readiness | --skip-feedback | --skip-retrospective
 *   --allow-prod         PERIGO: permite rodar contra produção
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes / guardas
// ─────────────────────────────────────────────────────────────────────────────
const PROD_PROJECT_REF = 'ndlsxgsccyjspbhzccyp';
const DEFAULT_USER = 'fac0acbd-8ec4-449c-827b-094c12012ca3';
const DEFAULT_API = 'https://runeasyv2-staging.up.railway.app';
const DEFAULT_DURATIONS = [4, 12, 20, 24];
const DAY_MS = 86_400_000;

// Feature names (espelham backend/src/common/ai/ai.constants.ts — fonte de verdade lá)
const PLAN_FEATURES = [
  'plan_generation_first_workout',
  'plan_generation_remaining',
  'plan_generation_legacy',
  'plan_generation_full',
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface UsageRow {
  user_id: string | null;
  feature_name: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  success: boolean;
  created_at: string;
}

interface DurationResult {
  weeks: number;
  ok: boolean;
  reason?: string;
  planId?: string;
  weeksInPlan?: number;
  durationCol?: number;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  latencyMs?: number;
}

interface SimpleCall {
  label: string;
  ok: boolean;
  reason?: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  model?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Util
// ─────────────────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
function log(step: string, msg: string): void {
  console.log(`[${nowIso()}] [${step}] ${msg}`);
}
function usd(n: number, dp = 6): string {
  return `$${n.toFixed(dp)}`;
}
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}
function num(v: string | boolean | undefined, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook RevenueCat (replica o evento que sim-revenuecat.ts envia)
// ─────────────────────────────────────────────────────────────────────────────
async function postWebhook(
  apiBase: string,
  secret: string,
  user: string,
  type: 'INITIAL_PURCHASE' | 'EXPIRATION',
  isTrial: boolean,
): Promise<{ ok: boolean; status: number; body: string }> {
  const now = Date.now();
  const event = {
    id: `fullflow_${type}_${now}`,
    type,
    app_user_id: user,
    original_app_user_id: user,
    product_id: 'pro_monthly',
    purchased_at_ms: now,
    expiration_at_ms:
      type === 'EXPIRATION'
        ? now - DAY_MS
        : isTrial
          ? now + 7 * DAY_MS
          : now + 30 * DAY_MS,
    period_type: isTrial ? 'TRIAL' : 'NORMAL',
    environment: 'SANDBOX',
    price: isTrial ? 0 : 29.9,
    currency: 'BRL',
    price_in_purchased_currency: isTrial ? 0 : 29.9,
  };
  const res = await fetch(`${apiBase}/api/webhooks/revenuecat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ event, api_version: '1.0' }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth: mintar access_token do usuário via Admin generate_link → verify
// (não envia e-mail; generate_link apenas DEVOLVE o OTP)
// ─────────────────────────────────────────────────────────────────────────────
async function mintAccessToken(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<string> {
  const adminUser = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  ).then((r) => r.json() as Promise<{ email?: string }>);
  const email = adminUser?.email;
  if (!email) throw new Error(`Usuário ${userId} não tem e-mail em auth.users`);

  const gen = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((r) => r.json() as Promise<{ email_otp?: string }>);
  const otp = gen?.email_otp;
  if (!otp) throw new Error('generate_link não retornou email_otp');

  const ver = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email, token: otp }),
  }).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!ver?.access_token) throw new Error('verify não retornou access_token');
  return ver.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de banco / fluxo
// ─────────────────────────────────────────────────────────────────────────────
async function cancelActivePlans(db: SupabaseClient, user: string): Promise<number> {
  const { data } = await db
    .from('training_plans')
    .update({ status: 'cancelled' })
    .eq('user_id', user)
    .eq('status', 'active')
    .select('id');
  return data?.length ?? 0;
}

/** Grava target_weeks na coluna E dentro do jsonb responses_json (preservando o resto). */
async function setOnboardingDuration(
  db: SupabaseClient,
  user: string,
  weeks: number,
): Promise<{ col: number | null; json: number | null }> {
  const { data: row, error } = await db
    .from('user_onboarding')
    .select('responses_json')
    .eq('user_id', user)
    .single();
  if (error) throw new Error(`Falha lendo onboarding: ${error.message}`);

  const rj =
    row?.responses_json && typeof row.responses_json === 'object'
      ? { ...(row.responses_json as Record<string, unknown>) }
      : {};
  rj.target_weeks = weeks; // só esta chave muda; demais campos preservados

  const { error: upErr } = await db
    .from('user_onboarding')
    .update({ target_weeks: weeks, responses_json: rj })
    .eq('user_id', user);
  if (upErr) throw new Error(`Falha gravando onboarding: ${upErr.message}`);

  // read-back de confirmação
  const { data: back } = await db
    .from('user_onboarding')
    .select('target_weeks, responses_json')
    .eq('user_id', user)
    .single();
  const col = (back?.target_weeks as number) ?? null;
  const json =
    back?.responses_json && typeof back.responses_json === 'object'
      ? ((back.responses_json as Record<string, unknown>).target_weeks as number) ?? null
      : null;
  return { col, json };
}

/** Espera surgir um log de geração de plano criado após `sinceIso`. */
async function waitForPlanLog(
  db: SupabaseClient,
  sinceIso: string,
  timeoutMs = 120_000,
): Promise<UsageRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await db
      .from('ai_usage_logs')
      .select(
        'user_id,feature_name,model_name,input_tokens,output_tokens,estimated_cost_usd,latency_ms,success,created_at',
      )
      .in('feature_name', PLAN_FEATURES)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length) return data[0] as UsageRow;
    await sleep(5000);
  }
  return null;
}

/** Espera N logs de uma feature criados após sinceIso (para readiness/feedback assíncronos). */
async function waitForFeatureLogs(
  db: SupabaseClient,
  feature: string,
  sinceIso: string,
  expected: number,
  timeoutMs = 90_000,
): Promise<UsageRow[]> {
  const deadline = Date.now() + timeoutMs;
  let last: UsageRow[] = [];
  while (Date.now() < deadline) {
    const { data } = await db
      .from('ai_usage_logs')
      .select(
        'user_id,feature_name,model_name,input_tokens,output_tokens,estimated_cost_usd,latency_ms,success,created_at',
      )
      .eq('feature_name', feature)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true });
    last = (data as UsageRow[]) ?? [];
    if (last.length >= expected) return last;
    await sleep(4000);
  }
  return last;
}

async function newestActivePlan(
  db: SupabaseClient,
  user: string,
): Promise<{ id: string; weeksLen: number; durationCol: number } | null> {
  const { data } = await db
    .from('training_plans')
    .select('id, duration_weeks, generation_status, plan_json, created_at')
    .eq('user_id', user)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data || !data.length) return null;
  const p = data[0];
  const weeks = (p.plan_json as { weeks?: unknown[] })?.weeks;
  return {
    id: p.id as string,
    weeksLen: Array.isArray(weeks) ? weeks.length : 0,
    durationCol: (p.duration_weeks as number) ?? 0,
  };
}

async function waitPlanComplete(
  db: SupabaseClient,
  user: string,
  timeoutMs = 120_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await db
      .from('training_plans')
      .select('generation_status')
      .eq('user_id', user)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    const st = data?.[0]?.generation_status as string | undefined;
    if (st === 'complete' || st === 'failed') return st;
    await sleep(5000);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const scriptStart = nowIso();
  const args = parseArgs(process.argv.slice(2));

  // env
  const envFile = typeof args['env-file'] === 'string' ? args['env-file'] : '.env.staging';
  const envPath = path.isAbsolute(envFile) ? envFile : path.join(__dirname, '..', envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Env file não encontrado: ${envPath}`);
    process.exit(1);
  }
  dotenv.config({ path: envPath });

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  const webhookSecret =
    process.env.REVENUECAT_WEBHOOK_SECRET_STAGING ||
    process.env.REVENUECAT_WEBHOOK_SECRET ||
    '';

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no env.');
    process.exit(1);
  }
  const allowProd = args['allow-prod'] === true;
  if (supabaseUrl.includes(PROD_PROJECT_REF) && !allowProd) {
    console.error(
      `❌ Recusando: ${envFile} aponta para PRODUÇÃO (${PROD_PROJECT_REF}).\n` +
        '   Este audit é staging-only. Use staging ou passe --allow-prod.',
    );
    process.exit(1);
  }
  if (!webhookSecret) {
    console.error(
      '❌ REVENUECAT_WEBHOOK_SECRET_STAGING ausente — necessário para disparar a geração.',
    );
    process.exit(1);
  }

  const user = typeof args.user === 'string' ? args.user : DEFAULT_USER;
  const apiBase = (typeof args.api === 'string' ? args.api : DEFAULT_API).replace(/\/$/, '');
  const durations =
    typeof args.durations === 'string'
      ? args.durations.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)
      : DEFAULT_DURATIONS;
  const projUsers = num(args.users, 1000);
  const plansPerUser = num(args['plans-per-user'], 1);
  const readinessPerUser = num(args['readiness-per-user'], 20);
  const feedbacksPerUser = num(args['feedbacks-per-user'], 15);
  const retrosPerUser = num(args['retros-per-user'], 1);
  const planTimeoutMs = num(args['plan-timeout'], 300) * 1000; // segundos → ms

  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  log('init', `projeto=${projectRef}${allowProd ? ' (PROD)' : ' (staging)'} user=${user}`);
  log('init', `durações=${durations.join(',')} | api=${apiBase}`);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const failures: string[] = [];
  const successes: string[] = [];
  const durationResults: DurationResult[] = [];
  const readinessCalls: SimpleCall[] = [];
  const feedbackCalls: SimpleCall[] = [];
  let retroCall: SimpleCall | null = null;

  // Snapshot do target_weeks original para restaurar no fim (cleanup trivial)
  let originalWeeks: number | null = null;
  try {
    const { data } = await db
      .from('user_onboarding')
      .select('target_weeks')
      .eq('user_id', user)
      .single();
    originalWeeks = (data?.target_weeks as number) ?? null;
    log('init', `target_weeks original = ${originalWeeks}`);
  } catch {
    log('init', 'não foi possível ler target_weeks original (seguindo)');
  }

  // ── Token (readiness/feedback/retrospectiva) ───────────────────────────────
  let token = '';
  try {
    token = await mintAccessToken(supabaseUrl, serviceKey, user);
    log('auth', `access_token emitido (len=${token.length})`);
  } catch (e) {
    log('auth', `❌ falha ao emitir token: ${(e as Error).message}`);
    failures.push('auth/token (readiness, feedback e retrospectiva serão pulados)');
  }

  // ── LOOP por duração: reset → onboarding → INITIAL_PURCHASE → validar ──────
  for (const weeks of durations) {
    const tag = `plan/${weeks}w`;
    const iterStart = nowIso();
    try {
      log(tag, `--- iniciando duração de ${weeks} semanas ---`);

      // 1. reset: cancelar plano ativo + EXPIRATION (vira free)
      const cancelled = await cancelActivePlans(db, user);
      log(tag, `planos ativos cancelados: ${cancelled}`);
      const exp = await postWebhook(apiBase, webhookSecret, user, 'EXPIRATION', false);
      log(tag, `EXPIRATION → HTTP ${exp.status}`);

      // 2. onboarding: gravar coluna + jsonb com a MESMA duração
      const wrote = await setOnboardingDuration(db, user, weeks);
      log(tag, `onboarding gravado: coluna=${wrote.col} jsonb=${wrote.json}`);
      if (wrote.col !== weeks || wrote.json !== weeks) {
        throw new Error(
          `read-back divergente (coluna=${wrote.col}, jsonb=${wrote.json}, esperado=${weeks})`,
        );
      }

      // 3. disparar geração via INITIAL_PURCHASE (trial)
      const purchaseStart = nowIso();
      const buy = await postWebhook(apiBase, webhookSecret, user, 'INITIAL_PURCHASE', true);
      log(tag, `INITIAL_PURCHASE → HTTP ${buy.status} ${buy.body.slice(0, 80)}`);
      if (!buy.ok) throw new Error(`webhook INITIAL_PURCHASE falhou: HTTP ${buy.status}`);

      // 4. aguardar a geração DESTE plano COMPLETAR (status) antes de ler nada.
      //    Geração em staging pode levar >2min para planos longos → timeout 300s.
      //    Serializar aqui (esperar 'complete') evita gerações concorrentes que
      //    competem pela mesma instância Railway e se atrasam em cascata.
      const finalStatus = await waitPlanComplete(db, user, planTimeoutMs);
      if (finalStatus !== 'complete') {
        throw new Error(
          `geração não concluiu (status=${finalStatus ?? `timeout ${planTimeoutMs / 1000}s`})`,
        );
      }

      // 5. anti-falso-positivo: conferir Nº de semanas (já com plan_json salvo)
      const plan = await newestActivePlan(db, user);
      const weeksInPlan = plan?.weeksLen ?? 0;
      const ok = weeksInPlan === weeks;
      log(
        tag,
        ok
          ? `✅ ${weeksInPlan} semanas geradas (bate com o pedido)`
          : `⚠️  esperado ${weeks} semanas, gerado ${weeksInPlan} (duration_col=${plan?.durationCol})`,
      );

      // custo real desta geração (o log surge junto/à frente do save do plan_json)
      const planLog = await waitForPlanLog(db, purchaseStart, 30_000);
      if (!planLog) throw new Error('plano completo, mas sem log de custo correspondente');
      log(tag, `custo: ${usd(Number(planLog.estimated_cost_usd), 6)} | out=${planLog.output_tokens}`);

      durationResults.push({
        weeks,
        ok,
        reason: ok ? undefined : `weeks_in_plan=${weeksInPlan} ≠ ${weeks}`,
        planId: plan?.id,
        weeksInPlan,
        durationCol: plan?.durationCol,
        cost: Number(planLog.estimated_cost_usd),
        inputTokens: planLog.input_tokens,
        outputTokens: planLog.output_tokens,
        model: planLog.model_name,
        latencyMs: planLog.latency_ms,
      });
      (ok ? successes : failures).push(`${tag} (${ok ? 'ok' : durationResults[durationResults.length - 1].reason})`);
    } catch (e) {
      const reason = (e as Error).message;
      log(tag, `❌ ${reason}`);
      durationResults.push({ weeks, ok: false, reason });
      failures.push(`${tag}: ${reason}`);
      // não aborta — segue para a próxima duração
      void iterStart;
    }
  }

  // Neste ponto o usuário está Pro (trial) com o ÚLTIMO plano ativo.
  // ── READINESS x3 (bem / cansado / lesionado) ───────────────────────────────
  if (!args['skip-readiness'] && token) {
    const scenarios = [
      { label: 'bem', answers: { sleep: 5, legs: 5, mood: 5, stress: 1, motivation: 5 } },
      { label: 'cansado', answers: { sleep: 2, legs: 2, mood: 3, stress: 4, motivation: 2 } },
      { label: 'lesionado', answers: { sleep: 3, legs: 1, mood: 2, stress: 4, motivation: 2 } },
    ];
    for (const sc of scenarios) {
      const lbl = `readiness/${sc.label}`;
      const since = nowIso();
      try {
        // limpar o check-in do dia para forçar uma chamada REAL (hasCheckedInToday)
        await db.from('readiness_history').delete().eq('user_id', user);
        const res = await fetch(`${apiBase}/api/readiness/analyze`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user, answers: sc.answers }),
        });
        log(lbl, `HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await waitForFeatureLogs(db, 'readiness', since, 1, 30_000);
        const row = rows[rows.length - 1];
        if (!row) throw new Error('sem log de readiness');
        readinessCalls.push({
          label: sc.label, ok: true,
          cost: Number(row.estimated_cost_usd), inputTokens: row.input_tokens,
          outputTokens: row.output_tokens, latencyMs: row.latency_ms, model: row.model_name,
        });
        successes.push(lbl);
      } catch (e) {
        const reason = (e as Error).message;
        log(lbl, `❌ ${reason}`);
        readinessCalls.push({ label: sc.label, ok: false, reason });
        failures.push(`${lbl}: ${reason}`);
      }
    }
  } else if (!token) {
    log('readiness', 'pulado (sem token)');
  }

  // ── FEEDBACK x3 (completar treinos de tipos variados) ──────────────────────
  if (!args['skip-feedback'] && token) {
    // pega até 3 treinos pendentes de tipos diferentes do plano ativo
    const { data: plans } = await db
      .from('training_plans')
      .select('id')
      .eq('user_id', user)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    const planId = plans?.[0]?.id as string | undefined;
    const { data: workouts } = planId
      ? await db
          .from('workouts')
          .select('id, type, distance_km, status')
          .eq('plan_id', planId)
          .eq('status', 'pending')
          .order('scheduled_date', { ascending: true })
          .limit(20)
      : { data: [] as Array<{ id: string; type: string; distance_km: number }> };

    // diversifica por tipo
    const picked: Array<{ id: string; type: string; distance_km: number }> = [];
    const seen = new Set<string>();
    for (const w of (workouts as Array<{ id: string; type: string; distance_km: number }>) || []) {
      if (!seen.has(w.type)) {
        seen.add(w.type);
        picked.push(w);
      }
      if (picked.length >= 3) break;
    }
    while (picked.length < 3 && (workouts as unknown[])?.length > picked.length) {
      picked.push((workouts as Array<{ id: string; type: string; distance_km: number }>)[picked.length]);
    }

    const fbSince = nowIso();
    for (const w of picked) {
      const lbl = `feedback/${w.type}`;
      try {
        const now = Date.now();
        const meters = Math.round((w.distance_km || 5) * 1000 * 0.95);
        const body = {
          route_points: [
            { latitude: -23.55, longitude: -46.63, timestamp: now },
            { latitude: -23.551, longitude: -46.631, timestamp: now + 600_000 },
            { latitude: -23.552, longitude: -46.632, timestamp: now + 1_200_000 },
          ],
          total_distance_meters: meters,
          duration_seconds: Math.round((w.distance_km || 5) * 330),
          average_heartrate: 150,
          max_heartrate: 170,
          calories: 600,
          source: 'phone',
          environment: 'outdoor',
        };
        const res = await fetch(`${apiBase}/api/training/workouts/${w.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        log(lbl, `complete HTTP ${res.status}`);
        if (!res.ok) throw new Error(`complete HTTP ${res.status}`);
      } catch (e) {
        const reason = (e as Error).message;
        log(lbl, `❌ ${reason}`);
        feedbackCalls.push({ label: w.type, ok: false, reason });
        failures.push(`${lbl}: ${reason}`);
      }
    }
    // feedback é assíncrono (BullMQ) — colhe os logs gerados após fbSince
    const expected = picked.length;
    const rows = await waitForFeatureLogs(db, 'feedback', fbSince, expected, 90_000);
    log('feedback', `logs de feedback colhidos: ${rows.length}/${expected}`);
    rows.forEach((row, i) => {
      feedbackCalls.push({
        label: picked[i]?.type ?? `#${i + 1}`, ok: true,
        cost: Number(row.estimated_cost_usd), inputTokens: row.input_tokens,
        outputTokens: row.output_tokens, latencyMs: row.latency_ms, model: row.model_name,
      });
      successes.push(`feedback/${picked[i]?.type ?? i}`);
    });
    if (rows.length < expected) failures.push(`feedback: só ${rows.length}/${expected} logs em 90s`);
  } else if (!token) {
    log('feedback', 'pulado (sem token)');
  }

  // ── RETROSPECTIVA x1 ───────────────────────────────────────────────────────
  if (!args['skip-retrospective'] && token) {
    const since = nowIso();
    try {
      const res = await fetch(`${apiBase}/api/training/retrospective/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const body = await res.text();
      log('retrospective', `HTTP ${res.status} ${body.slice(0, 100)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await waitForFeatureLogs(db, 'retrospective', since, 1, 60_000);
      const row = rows[rows.length - 1];
      if (!row) throw new Error('sem log de retrospectiva (pode já existir p/ o plano)');
      retroCall = {
        label: 'retrospectiva', ok: true,
        cost: Number(row.estimated_cost_usd), inputTokens: row.input_tokens,
        outputTokens: row.output_tokens, latencyMs: row.latency_ms, model: row.model_name,
      };
      successes.push('retrospective');
    } catch (e) {
      const reason = (e as Error).message;
      log('retrospective', `❌ ${reason}`);
      retroCall = { label: 'retrospectiva', ok: false, reason };
      failures.push(`retrospective: ${reason}`);
    }
  } else if (!token) {
    log('retrospective', 'pulado (sem token)');
  }

  // ── CLEANUP (trivial): restaurar target_weeks original ─────────────────────
  let cleanupNote = '';
  if (originalWeeks != null) {
    try {
      await setOnboardingDuration(db, user, originalWeeks);
      cleanupNote = `target_weeks restaurado para ${originalWeeks}.`;
      log('cleanup', cleanupNote);
    } catch (e) {
      cleanupNote = `falha ao restaurar target_weeks: ${(e as Error).message}`;
      log('cleanup', cleanupNote);
    }
  }
  cleanupNote +=
    ' Assinatura (Pro/trial) e os planos de teste gerados NÃO são revertidos —' +
    ' o usuário de teste fica Pro/trial com o último plano ativo (estado de teste em staging).';

  // ── RELATÓRIO ──────────────────────────────────────────────────────────────
  const okDurations = durationResults.filter((d) => d.ok && typeof d.cost === 'number');
  const planCosts = okDurations.map((d) => d.cost as number);
  const planMin = planCosts.length ? Math.min(...planCosts) : 0;
  const planMax = planCosts.length ? Math.max(...planCosts) : 0;

  const okReadiness = readinessCalls.filter((c) => c.ok && typeof c.cost === 'number');
  const rAvg = okReadiness.length
    ? okReadiness.reduce((s, c) => s + (c.cost as number), 0) / okReadiness.length
    : 0;
  const okFeedback = feedbackCalls.filter((c) => c.ok && typeof c.cost === 'number');
  const fAvg = okFeedback.length
    ? okFeedback.reduce((s, c) => s + (c.cost as number), 0) / okFeedback.length
    : 0;
  const retroCost = retroCall?.ok ? (retroCall.cost as number) : 0;

  const monthlyMin =
    planMin * plansPerUser + rAvg * readinessPerUser + fAvg * feedbacksPerUser + retroCost * retrosPerUser;
  const monthlyMax =
    planMax * plansPerUser + rAvg * readinessPerUser + fAvg * feedbacksPerUser + retroCost * retrosPerUser;

  const durRows = durationResults
    .map((d) =>
      d.ok || d.cost != null
        ? `| ${d.weeks} sem | ${d.ok ? '✅' : '⚠️'} ${d.weeksInPlan ?? '-'} | ${d.inputTokens ?? '-'} | ${d.outputTokens ?? '-'} | ${d.cost != null ? usd(d.cost, 6) : '-'} | ${d.latencyMs != null ? (d.latencyMs / 1000).toFixed(1) + 's' : '-'} |`
        : `| ${d.weeks} sem | ❌ falhou | - | - | - | - |  ${d.reason ?? ''}`,
    )
    .join('\n');

  const rRows = readinessCalls
    .map((c) => `| ${c.label} | ${c.ok ? '✅' : '❌'} | ${c.inputTokens ?? '-'} | ${c.outputTokens ?? '-'} | ${c.cost != null ? usd(c.cost, 6) : (c.reason ?? '-')} |`)
    .join('\n');
  const fRows = feedbackCalls
    .map((c) => `| ${c.label} | ${c.ok ? '✅' : '❌'} | ${c.inputTokens ?? '-'} | ${c.outputTokens ?? '-'} | ${c.cost != null ? usd(c.cost, 6) : (c.reason ?? '-')} |`)
    .join('\n');

  const dateStr = new Date().toISOString().split('T')[0];
  const report = `# Auditoria de Custos de IA — Fluxo Completo (multi-duração)

**Gerado:** ${nowIso()}  ·  **Início do script:** ${scriptStart}
**Ambiente:** STAGING (\`${projectRef}\`)  ·  **Usuário de teste:** \`${user}\`
**Fonte:** \`ai_usage_logs\` (custo real, fluxo de produção exercitado de verdade)

> Cada duração de plano foi gerada gravando \`target_weeks\` **na coluna E em
> \`responses_json\`** (o backend lê o jsonb com precedência) e disparada pelo
> webhook RevenueCat (INITIAL_PURCHASE). Readiness/feedback/retrospectiva foram
> chamados pelos endpoints autenticados reais.

---

## 1. Geração de plano — por duração (não agregado)

| Duração | Semanas geradas | Input tok | Output tok | Custo real | Latência |
|---|---|---|---|---|---|
${durRows || '| (nenhuma) | - | - | - | - | - |'}

Validação anti-falso-positivo: ✅ = nº de semanas em \`plan_json.weeks\` bate com o pedido.

## 2. Readiness (Haiku) — 3 cenários

| Cenário | OK | Input tok | Output tok | Custo |
|---|---|---|---|---|
${rRows || '| (pulado) | - | - | - | - |'}
**Média/chamada:** ${usd(rAvg, 6)}

## 3. Feedback do treinador (Haiku) — treinos variados

| Tipo de treino | OK | Input tok | Output tok | Custo |
|---|---|---|---|---|
${fRows || '| (pulado) | - | - | - | - |'}
**Média/chamada:** ${usd(fAvg, 6)}

## 4. Retrospectiva

${retroCall ? `| ${retroCall.label} | ${retroCall.ok ? '✅' : '❌'} | ${retroCall.inputTokens ?? '-'} in / ${retroCall.outputTokens ?? '-'} out | ${retroCall.ok ? usd(retroCost, 6) : (retroCall.reason ?? '-')} |` : '(pulado)'}

---

## 5. Projeção mensal — ${projUsers} usuários ativos (faixa por duração de plano)

Premissas: ${plansPerUser} plano + ${readinessPerUser} readiness + ${feedbacksPerUser} feedback + ${retrosPerUser} retrospectiva por usuário/mês.
A faixa min↔max vem do custo do plano (${usd(planMin, 6)} em ${okDurations.find((d) => d.cost === planMin)?.weeks ?? '?'} sem ↔ ${usd(planMax, 6)} em ${okDurations.find((d) => d.cost === planMax)?.weeks ?? '?'} sem).

| Componente | Custo/chamada | Chamadas/usuário/mês | Mínimo/mês | Máximo/mês |
|---|---|---|---|---|
| Plano | ${usd(planMin, 4)} ↔ ${usd(planMax, 4)} | ${plansPerUser} | ${usd(planMin * plansPerUser * projUsers, 2)} | ${usd(planMax * plansPerUser * projUsers, 2)} |
| Readiness | ${usd(rAvg, 6)} | ${readinessPerUser} | ${usd(rAvg * readinessPerUser * projUsers, 2)} | ${usd(rAvg * readinessPerUser * projUsers, 2)} |
| Feedback | ${usd(fAvg, 6)} | ${feedbacksPerUser} | ${usd(fAvg * feedbacksPerUser * projUsers, 2)} | ${usd(fAvg * feedbacksPerUser * projUsers, 2)} |
| Retrospectiva | ${usd(retroCost, 6)} | ${retrosPerUser} | ${usd(retroCost * retrosPerUser * projUsers, 2)} | ${usd(retroCost * retrosPerUser * projUsers, 2)} |
| **TOTAL** | | | **${usd(monthlyMin * projUsers, 2)}** | **${usd(monthlyMax * projUsers, 2)}** |

> Por usuário/mês: **${usd(monthlyMin, 4)} ↔ ${usd(monthlyMax, 4)}** dependendo da duração do plano.

---

## 6. Execução — sucessos e falhas

- ✅ Sucessos (${successes.length}): ${successes.join(', ') || '—'}
- ❌ Falhas (${failures.length}): ${failures.join(' | ') || 'nenhuma'}

**Cleanup:** ${cleanupNote}

---

*Gerado por \`scripts/ai-full-flow-audit.ts\` — fonte \`ai_usage_logs\` (${projectRef}).*
`;

  const outDir = path.join(__dirname, '..', '..', '..', 'auditorias');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outArg = typeof args.out === 'string' ? args.out : '';
  const outPath = outArg
    ? path.isAbsolute(outArg)
      ? outArg
      : path.join(__dirname, '..', outArg)
    : path.join(outDir, `auditoria-custos-ia-${dateStr}.md`);
  fs.writeFileSync(outPath, report, 'utf-8');

  console.log('\n──────────── RESUMO ────────────');
  console.log(`Durações OK: ${okDurations.map((d) => `${d.weeks}w=${usd(d.cost as number, 4)}`).join('  ')}`);
  console.log(`Readiness média: ${usd(rAvg, 6)} | Feedback média: ${usd(fAvg, 6)} | Retro: ${usd(retroCost, 6)}`);
  console.log(`Projeção/${projUsers}: ${usd(monthlyMin * projUsers, 2)} ↔ ${usd(monthlyMax * projUsers, 2)} /mês`);
  console.log(`Falhas: ${failures.length}`);
  console.log(`\n✅ Relatório salvo em: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
