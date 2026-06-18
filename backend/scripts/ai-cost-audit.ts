/**
 * AI Cost Audit (REAL data) — RunEasy V2
 *
 * Reads the REAL token/cost logs the backend writes to `ai_usage_logs`
 * (via AIRouterService → AIUsageService) and produces a per-user / per-feature
 * cost report. Unlike scripts/ai-audit-stress-test.ts — which fires hand-written
 * prompts straight at Anthropic and never touches the DB — this script reports
 * the actual cost of the CURRENT generation path (single-prompt plan generation,
 * feedback, readiness, retrospective) as it ran in production code.
 *
 * STAGING-ONLY BY DESIGN. It loads backend/.env.staging (NOT the prod .env) and
 * hard-refuses to run against the production Supabase project unless you pass
 * --allow-prod explicitly. This guarantees the audit never reads prod data by
 * accident, matching the rule that the prod .env / prod Supabase stay untouched.
 *
 * Usage:
 *   npx ts-node scripts/ai-cost-audit.ts                       # all users, all time
 *   npm run qa:ai-cost-audit -- --user <uuid>                  # focus one user
 *   npm run qa:ai-cost-audit -- --since 2026-06-18T00:00:00Z   # only logs after a time
 *   npm run qa:ai-cost-audit -- --users 1000                   # monthly projection size
 *
 * Flags:
 *   --env-file <path>   dotenv file to load (default '.env.staging')
 *   --user <uuid>       restrict the report to a single user_id
 *   --since <iso>       only count logs created at/after this ISO timestamp
 *   --until <iso>       only count logs created before this ISO timestamp
 *   --users <n>         active-user count for the monthly projection (default 1000)
 *   --plans-per-user <n>      plans/user/month assumption    (default 1)
 *   --readiness-per-user <n>  readiness calls/user/month      (default 20)
 *   --feedbacks-per-user <n>  feedback calls/user/month       (default 15)
 *   --out <path>        report output path (default 'scripts/ai_cost_audit_report.md')
 *   --allow-prod        DANGER: permit running against the production project
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AI_FEATURES } from '../src/common/ai/ai.constants';

// The production Supabase project ref — the one we must NOT audit by default.
const PROD_PROJECT_REF = 'ndlsxgsccyjspbhzccyp';

interface UsageRow {
  user_id: string | null;
  feature_name: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  success: boolean;
  created_at: string;
}

type Category = 'plan' | 'readiness' | 'feedback' | 'retrospective' | 'other';

function categorize(feature: string): Category {
  if (
    feature === AI_FEATURES.PLAN_GENERATION_FIRST ||
    feature === AI_FEATURES.PLAN_GENERATION_REMAINING ||
    feature === AI_FEATURES.PLAN_GENERATION_LEGACY ||
    feature === AI_FEATURES.PLAN_GENERATION_FULL
  ) {
    return 'plan';
  }
  if (feature === AI_FEATURES.READINESS) return 'readiness';
  if (feature === AI_FEATURES.FEEDBACK) return 'feedback';
  if (feature === AI_FEATURES.RETROSPECTIVE) return 'retrospective';
  return 'other';
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

function usd(n: number, dp = 6): string {
  return `$${n.toFixed(dp)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const envFile = typeof args['env-file'] === 'string' ? args['env-file'] : '.env.staging';
  const envPath = path.isAbsolute(envFile)
    ? envFile
    : path.join(__dirname, '..', envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Env file not found: ${envPath}`);
    console.error('   Create backend/.env.staging (see header) or pass --env-file <path>.');
    process.exit(1);
  }
  dotenv.config({ path: envPath });

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!url || !key) {
    console.error(
      `❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in ${envFile}.`,
    );
    process.exit(1);
  }

  // SAFETY: refuse to audit the production project unless explicitly allowed.
  const allowProd = args['allow-prod'] === true;
  if (url.includes(PROD_PROJECT_REF) && !allowProd) {
    console.error(
      `❌ Refusing to run: ${envFile} points at the PRODUCTION project (${PROD_PROJECT_REF}).\n` +
        `   This audit is staging-only. Point SUPABASE_URL at staging, or pass --allow-prod\n` +
        `   if you REALLY mean to read production.`,
    );
    process.exit(1);
  }

  const projectRef = url.replace('https://', '').split('.')[0];
  console.log('💰 RunEasy AI Cost Audit (real ai_usage_logs)');
  console.log('=============================================');
  console.log(`   project : ${projectRef}${allowProd ? ' (PROD — --allow-prod)' : ' (staging)'}`);

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Fetch logs (paged, service_role bypasses RLS) ----
  const userFilter = typeof args.user === 'string' ? args.user : null;
  const since = typeof args.since === 'string' ? args.since : null;
  const until = typeof args.until === 'string' ? args.until : null;
  console.log(
    `   filter  : user=${userFilter ?? 'ALL'} since=${since ?? '-'} until=${until ?? '-'}\n`,
  );

  const rows: UsageRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('ai_usage_logs')
      .select(
        'user_id,feature_name,model_name,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,estimated_cost_usd,latency_ms,success,created_at',
      )
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (userFilter) q = q.eq('user_id', userFilter);
    if (since) q = q.gte('created_at', since);
    if (until) q = q.lt('created_at', until);

    const { data, error } = await q;
    if (error) {
      console.error(`❌ Query failed: ${error.message}`);
      process.exit(1);
    }
    rows.push(...((data as UsageRow[]) ?? []));
    if (!data || data.length < PAGE) break;
  }

  if (rows.length === 0) {
    console.log('⚠️  No ai_usage_logs rows matched the filter. Nothing to report.');
    console.log('    (Generate some AI usage first — e.g. sim-revenuecat --env staging.)');
    return;
  }

  // ---- Aggregations ----
  const byFeature = new Map<
    string,
    { calls: number; input: number; output: number; cost: number; latency: number; fails: number }
  >();
  const byUser = new Map<string, { calls: number; cost: number; byCat: Record<Category, number> }>();
  const byCategory = new Map<Category, { calls: number; cost: number }>();

  for (const r of rows) {
    const f = byFeature.get(r.feature_name) ?? {
      calls: 0, input: 0, output: 0, cost: 0, latency: 0, fails: 0,
    };
    f.calls++;
    f.input += r.input_tokens;
    f.output += r.output_tokens;
    f.cost += Number(r.estimated_cost_usd);
    f.latency += r.latency_ms;
    if (!r.success) f.fails++;
    byFeature.set(r.feature_name, f);

    const cat = categorize(r.feature_name);
    const c = byCategory.get(cat) ?? { calls: 0, cost: 0 };
    c.calls++;
    c.cost += Number(r.estimated_cost_usd);
    byCategory.set(cat, c);

    const uid = r.user_id ?? '(null)';
    const u = byUser.get(uid) ?? {
      calls: 0, cost: 0,
      byCat: { plan: 0, readiness: 0, feedback: 0, retrospective: 0, other: 0 },
    };
    u.calls++;
    u.cost += Number(r.estimated_cost_usd);
    u.byCat[cat] += Number(r.estimated_cost_usd);
    byUser.set(uid, u);
  }

  const totalCost = rows.reduce((s, r) => s + Number(r.estimated_cost_usd), 0);
  const distinctUsers = [...byUser.keys()].filter((k) => k !== '(null)').length;

  // Per-category average cost PER USER who actually used it (for projection).
  const usersWithCat = (cat: Category) =>
    [...byUser.values()].filter((u) => u.byCat[cat] > 0).length;
  const avgCostPerUserForCat = (cat: Category) => {
    const n = usersWithCat(cat);
    if (!n) return 0;
    const sum = [...byUser.values()].reduce((s, u) => s + u.byCat[cat], 0);
    return sum / n;
  };

  // ---- Projection inputs ----
  const projUsers = num(args.users, 1000);
  const plansPerUser = num(args['plans-per-user'], 1);
  const readinessPerUser = num(args['readiness-per-user'], 20);
  const feedbacksPerUser = num(args['feedbacks-per-user'], 15);

  // Per-call average cost by category (used to scale the projection).
  const perCallCost = (cat: Category) => {
    const c = byCategory.get(cat);
    return c && c.calls ? c.cost / c.calls : 0;
  };
  const planCall = perCallCost('plan');
  const readinessCall = perCallCost('readiness');
  const feedbackCall = perCallCost('feedback');

  const projPlan = planCall * plansPerUser * projUsers;
  const projReadiness = readinessCall * readinessPerUser * projUsers;
  const projFeedback = feedbackCall * feedbacksPerUser * projUsers;
  const projTotal = projPlan + projReadiness + projFeedback;

  // ---- Build report ----
  const featureRows = [...byFeature.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, f]) => {
      const avgLat = f.calls ? Math.round(f.latency / f.calls) : 0;
      return `| ${name} | ${f.calls} | ${f.input} | ${f.output} | ${usd(f.cost)} | ${(avgLat / 1000).toFixed(1)}s | ${f.fails} |`;
    })
    .join('\n');

  const userRows = [...byUser.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 50)
    .map(([uid, u]) => {
      return `| ${uid} | ${u.calls} | ${usd(u.byCat.plan)} | ${usd(u.byCat.readiness)} | ${usd(u.byCat.feedback)} | ${usd(u.byCat.retrospective)} | **${usd(u.cost)}** |`;
    })
    .join('\n');

  const windowStart = rows[0].created_at;
  const windowEnd = rows[rows.length - 1].created_at;

  const report = `# RunEasy V2 — AI Cost Audit (dados reais)

**Gerado**: ${new Date().toISOString()}
**Projeto**: ${projectRef} ${allowProd ? '(PRODUÇÃO)' : '(staging)'}
**Fonte**: tabela \`ai_usage_logs\` (custo real registrado pelo backend)
**Janela**: ${windowStart} → ${windowEnd}
**Filtro**: user=${userFilter ?? 'todos'} | linhas analisadas: ${rows.length}

> Diferente de \`ai-audit-stress-test.ts\` (prompts simulados direto na Anthropic),
> este relatório reflete o **custo real da geração atual** (prompt único) por usuário.

---

## Custo por Feature

| Feature | Chamadas | Input Tokens | Output Tokens | Custo USD | Latência média | Falhas |
|---------|----------|--------------|---------------|-----------|----------------|--------|
${featureRows}

**Custo total no período**: ${usd(totalCost, 4)} · **Usuários distintos**: ${distinctUsers}

---

## Custo por Usuário (top 50 por custo)

| user_id | Chamadas | Plano | Readiness | Feedback | Retrospectiva | Total |
|---------|----------|-------|-----------|----------|---------------|-------|
${userRows}

---

## Médias por usuário (entre quem usou cada feature)

| Categoria | Usuários que usaram | Custo médio/usuário |
|-----------|---------------------|---------------------|
| Plano | ${usersWithCat('plan')} | ${usd(avgCostPerUserForCat('plan'), 4)} |
| Readiness | ${usersWithCat('readiness')} | ${usd(avgCostPerUserForCat('readiness'), 4)} |
| Feedback | ${usersWithCat('feedback')} | ${usd(avgCostPerUserForCat('feedback'), 4)} |
| Retrospectiva | ${usersWithCat('retrospective')} | ${usd(avgCostPerUserForCat('retrospective'), 4)} |

---

## Projeção Mensal — ${projUsers} Usuários Ativos

Premissas: ${plansPerUser} plano/usuário, ${readinessPerUser} readiness/usuário, ${feedbacksPerUser} feedback/usuário por mês.
Custo por chamada derivado da média real observada acima.

| Feature | Custo/chamada (real) | Chamadas/usuário/mês | Custo Total/Mês |
|---------|----------------------|----------------------|-----------------|
| Plano de Treino | ${usd(planCall, 4)} | ${plansPerUser} | ${usd(projPlan, 2)} |
| Readiness | ${usd(readinessCall, 6)} | ${readinessPerUser} | ${usd(projReadiness, 2)} |
| Feedback | ${usd(feedbackCall, 6)} | ${feedbacksPerUser} | ${usd(projFeedback, 2)} |
| **TOTAL** | | | **${usd(projTotal, 2)}** |

---

*Gerado por \`scripts/ai-cost-audit.ts\` — fonte: \`ai_usage_logs\` (${projectRef}).*
`;

  const outArg = typeof args.out === 'string' ? args.out : 'scripts/ai_cost_audit_report.md';
  const outPath = path.isAbsolute(outArg) ? outArg : path.join(__dirname, '..', outArg);
  fs.writeFileSync(outPath, report, 'utf-8');

  // ---- Console summary ----
  console.log(`📊 Features: ${byFeature.size} | Linhas: ${rows.length} | Usuários: ${distinctUsers}`);
  for (const [name, f] of [...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`   ${name.padEnd(34)} ${String(f.calls).padStart(4)} calls  ${usd(f.cost, 4).padStart(10)}`);
  }
  console.log(`   ${'TOTAL'.padEnd(34)} ${String(rows.length).padStart(4)} calls  ${usd(totalCost, 4).padStart(10)}`);
  console.log(`\n✅ Report saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
