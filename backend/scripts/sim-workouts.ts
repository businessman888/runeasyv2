/**
 * Simulador de histórico de treinos — RunEasy V2 (ferramenta de QA)
 *
 * Gera histórico de treinos de um tester para validar a retrospectiva de fim de
 * plano (Fase 1A) e, adiante, os insights semanais/mensais (Fases 2/4/7) — sem
 * depender de correr na rua.
 *
 * ── PRINCÍPIO DE FIDELIDADE (não negociável) ─────────────────────────────────
 *
 * Este script NÃO escreve em `workouts`, `activities` nem em qualquer tabela.
 * Ele autentica como o tester e chama os MESMOS endpoints que o app chama.
 *
 * O motivo é concreto. Dois invariantes do produto só existem porque o produtor
 * real os aplica:
 *   • unidade de pace — `activities.average_pace` é gravado em SEGUNDOS/km pelo
 *     `completeWorkout` (Fase 0). Um INSERT na mão gravaria o que o autor achasse.
 *   • idempotência por `external_id` — o UPSERT existe por causa de um incidente
 *     de recursão que gerou milhões de linhas órfãs.
 * Escrevendo no banco na unha, o script validaria ficção: dado que não é o que
 * uma corrida real produz. Dirigindo os endpoints, "o que o script gera == o que
 * uma corrida real geraria" por construção.
 *
 * ── ESCOPO (v1) ───────────────────────────────────────────────────────────────
 *
 * Assume um tester que JÁ existe e JÁ tem plano ativo — signup, onboarding e
 * geração de plano continuam manuais na UI. O script cuida só das CONCLUSÕES.
 *
 * ── USO ───────────────────────────────────────────────────────────────────────
 *
 *   npm run qa:sim-workouts -- --completions 5 --free-runs 1 --rpe --generate-retrospective
 *   npx ts-node scripts/sim-workouts.ts --env staging --completions 8 --completion-ratio 0.9
 *
 * Flags:
 *   --env <name>            local | staging | production   (default: staging)
 *   --completions N         quantos treinos PENDENTES do plano concluir (default 5)
 *   --week N                restringe as conclusões (e as corridas livres) à
 *                           SEMANA N do plano. Sem a flag, pega os pendentes em
 *                           ordem de data, atravessando semanas — o que serve
 *                           para a retrospectiva mas não para o insight semanal.
 *   --completion-ratio R    fração da distância prescrita a cumprir (default 1.0).
 *                           0.8 simula quem corre menos; 1.2, quem corre mais.
 *   --free-runs M           quantas corridas livres registrar (default 0)
 *   --free-run-km K         distância de cada corrida livre (default 8)
 *   --pace S                pace-base em SEGUNDOS/km (default 330 = 5:30/km)
 *   --jitter P              variação aleatória de pace, 0..1 (default 0.05 = ±5%)
 *   --rpe [N]               anexa RPE. Sem valor = aleatório 1–10; com valor = fixo.
 *   --gps                   gera rota GPS sintética (default: sem rota — ver nota)
 *   --seed S                semente do gerador, para runs reprodutíveis
 *   --generate-retrospective  dispara POST /training/retrospective/generate no fim
 *   --generate-weekly-insight dispara POST /training/weekly-insight/generate no fim.
 *                           Gera a ÚLTIMA semana FECHADA e elegível — ou seja, a
 *                           semana escolhida em --week precisa já ter terminado
 *                           (week_end < hoje) e não pode ser a última do plano.
 *   --dry-run               imprime o que faria, sem chamar nada que escreva
 *   --i-know-this-is-production   destrava o alvo de produção (NÃO use)
 *
 * Env vars (em backend/.env):
 *   SIM_TESTER_EMAIL, SIM_TESTER_PASSWORD          credenciais do tester
 *   SUPABASE_URL_STAGING, SUPABASE_ANON_KEY_STAGING  projeto Supabase de staging
 *   (para --env local/production, usa SUPABASE_URL / SUPABASE_ANON_KEY)
 *
 * ── NOTA SOBRE GPS ────────────────────────────────────────────────────────────
 *
 * Por padrão as conclusões vão com `route_points: []`. Isso NÃO é uma
 * simplificação desonesta: é a forma real de uma corrida de esteira e de toda
 * importação de HealthKit/Health Connect sem rota. O backend trata o caso
 * (`total_distance_meters` é autoritativo sobre o cálculo por GPS). Use `--gps`
 * quando precisar exercitar splits/altimetria — mas saiba que isso enfileira o
 * job de enriquecimento de elevação (Mapbox Terrain-DEM), que faz chamada externa.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ── Alvos ────────────────────────────────────────────────────────────────────

export type EnvName = 'local' | 'staging' | 'production';

/** Ref do projeto Supabase de PRODUÇÃO. A trava de segurança compara com isto. */
export const PRODUCTION_SUPABASE_REF = 'ndlsxgsccyjspbhzccyp';

export const ENVIRONMENTS: Record<
  EnvName,
  { url: string; supabaseUrlVar: string; supabaseKeyVar: string }
> = {
  local: {
    url: 'http://localhost:3000',
    supabaseUrlVar: 'SUPABASE_URL',
    supabaseKeyVar: 'SUPABASE_ANON_KEY',
  },
  staging: {
    url: 'https://runeasyv2-staging.up.railway.app',
    supabaseUrlVar: 'SUPABASE_URL_STAGING',
    supabaseKeyVar: 'SUPABASE_ANON_KEY_STAGING',
  },
  production: {
    url: 'https://app.runeasy.com.br',
    supabaseUrlVar: 'SUPABASE_URL',
    supabaseKeyVar: 'SUPABASE_ANON_KEY',
  },
};

// ── Helpers puros (exportados para teste) ────────────────────────────────────

/**
 * Trava de segurança. O script ESCREVE dado real via endpoints, então apontar
 * para produção por engano sujaria a base de usuários pagantes com corridas
 * fabricadas — e, pior, dispararia XP, badges, streak e feedback de IA neles.
 *
 * Verifica as DUAS pontas (backend e Supabase) porque elas são configuradas
 * separadamente: dá para ter `--env staging` com um SUPABASE_URL de produção no
 * .env, e aí as escritas cairiam na base real.
 */
export interface GuardResult {
  ok: boolean;
  /** Vazio quando `ok`. Forma única (em vez de union discriminada) porque o
   *  repo compila com `strictNullChecks: false`, onde o narrowing por
   *  discriminante não funciona. */
  reason: string;
}

export function assertNotProduction(params: {
  env: EnvName;
  apiBaseUrl: string;
  supabaseUrl: string;
  override: boolean;
}): GuardResult {
  const reasons: string[] = [];

  if (params.env === 'production') {
    reasons.push('--env production');
  }
  if (params.supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    reasons.push(`Supabase de PRODUÇÃO (ref ${PRODUCTION_SUPABASE_REF})`);
  }
  if (params.apiBaseUrl.includes('app.runeasy.com.br')) {
    reasons.push('backend de PRODUÇÃO (app.runeasy.com.br)');
  }

  if (reasons.length === 0) return { ok: true, reason: '' };
  if (params.override) return { ok: true, reason: '' };

  // Quando o alvo JÁ é staging mas o Supabase é o de produção, o problema não é
  // a flag — é o .env. Dizer "use --env staging" aí seria só confundir.
  const fix =
    params.env === 'production'
      ? 'Use --env staging.'
      : `Defina SUPABASE_URL_STAGING e SUPABASE_ANON_KEY_STAGING em backend/.env\n` +
        `   (o .env deste repo aponta para o Supabase de PRODUÇÃO por padrão).`;

  return {
    ok: false,
    reason:
      `Alvo de PRODUÇÃO detectado: ${reasons.join(', ')}.\n` +
      `   Este script escreve corridas reais via endpoints — em produção isso\n` +
      `   sujaria dados de usuários pagantes e dispararia XP, badges e feedback\n` +
      `   de IA neles.\n` +
      `   ${fix}\n` +
      `   Se for MESMO intencional, passe --i-know-this-is-production.`,
  };
}

/** PRNG determinístico (mulberry32) para runs reprodutíveis com `--seed`. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticRun {
  distanceKm: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Só para o resumo impresso — o payload NÃO envia pace. */
  derivedPaceSecondsPerKm: number;
}

/**
 * Gera uma corrida sintética CONSISTENTE: duração = distância × pace.
 *
 * `avg_pace_seconds_per_km` é deliberadamente OMITIDO do payload — o backend o
 * calcula de `duration_seconds / distance`. Mandar o pace pronto pularia
 * justamente o produtor cuja unidade a Fase 0 corrigiu; deixando o backend
 * derivar, o script exercita o caminho real.
 */
export function buildSyntheticRun(params: {
  distanceKm: number;
  basePaceSecondsPerKm: number;
  jitter: number;
  rng: () => number;
}): SyntheticRun {
  const { distanceKm, basePaceSecondsPerKm, jitter, rng } = params;

  // Pace com variação em torno da base: (1 - jitter) .. (1 + jitter).
  const factor = 1 + (rng() * 2 - 1) * jitter;
  const paceSecondsPerKm = Math.round(basePaceSecondsPerKm * factor);
  const durationSeconds = Math.round(distanceKm * paceSecondsPerKm);

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    distanceMeters: Math.round(distanceKm * 1000),
    durationSeconds,
    derivedPaceSecondsPerKm: Math.round(durationSeconds / distanceKm),
  };
}

/**
 * `external_id` estável por treino. Re-rodar o script para o mesmo workout gera
 * a MESMA chave, então o UPSERT em `activities` (onConflict: external_id)
 * sobrescreve em vez de duplicar. O prefixo `sim_` deixa óbvio, no banco, o que
 * é dado fabricado.
 */
export function makeExternalId(kind: 'plan' | 'free', key: string): string {
  return `sim_${kind}_${key}`;
}

/** Combina uma data YYYY-MM-DD com um horário plausível, em São Paulo (UTC-3). */
export function toStartedAt(dateStr: string, hour = 7): string {
  const hh = String(hour).padStart(2, '0');
  return `${dateStr}T${hh}:00:00-03:00`;
}

/**
 * Rota GPS sintética: uma linha reta partindo de um ponto, com espaçamento
 * temporal coerente com a duração. Só é usada com `--gps`.
 */
export function buildSyntheticRoute(params: {
  distanceMeters: number;
  durationSeconds: number;
  startedAtMs: number;
  points?: number;
}): Array<{
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
  speed: number;
  accuracy: number;
}> {
  const n = params.points ?? 60;
  // ~ -23.55, -46.63 (São Paulo). 1 grau de latitude ≈ 111_320 m.
  const startLat = -23.55;
  const startLng = -46.63;
  const totalDegLat = params.distanceMeters / 111_320;
  const speed = params.distanceMeters / Math.max(params.durationSeconds, 1);

  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    return {
      latitude: startLat + totalDegLat * f,
      longitude: startLng,
      altitude: 760,
      timestamp: params.startedAtMs + Math.round(params.durationSeconds * f * 1000),
      speed,
      accuracy: 5,
    };
  });
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function resolveEnv(raw: string | boolean | undefined): EnvName {
  const v = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (v === 'local' || v === 'staging' || v === 'production') return v;
  if (v) {
    console.error(
      `❌ --env inválido: "${String(raw)}". Use: local | staging | production.`,
    );
    process.exit(1);
  }
  // Staging é o default DE PROPÓSITO — é o único alvo pretendido.
  return 'staging';
}

function num(v: string | boolean | undefined, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** RPE 1–10 a partir da flag: ausente → null; booleana → aleatório; número → fixo. */
export function resolveRpe(
  flag: string | boolean | undefined,
  rng: () => number,
): number | null {
  if (flag === undefined || flag === false) return null;
  if (flag === true) return 1 + Math.floor(rng() * 10);
  const n = Number(flag);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

// ── Tipos dos contratos consumidos (espelham os DTOs do backend) ─────────────

interface PlanWorkout {
  id: string;
  scheduled_date: string;
  distance_km: number;
  status: 'pending' | 'completed' | 'skipped' | 'missed';
  type: string;
  title: string;
  /** Preenchido pelo script a partir do bloco `weeks[]` do overview. */
  week_number?: number;
}

interface PlanOverview {
  overview: { plan_id: string; end_date: string; total_weeks: number };
  weeks: Array<{ week_number: number; workouts: PlanWorkout[] }>;
}

export interface WeekContext {
  /** Primeiro `scheduled_date` da semana (a fronteira que o backend deriva). */
  startStr: string;
  /** Último `scheduled_date` da semana. */
  endStr: string;
  /** Σ distance_km prescrito — o denominador de `distance_vs_goal_percent`. */
  plannedKm: number;
  plannedCount: number;
}

/**
 * Fronteiras e totais prescritos da semana N — espelha o que `derivePlanWeeks`
 * faz no backend (MIN/MAX de `scheduled_date` por `week_number`), para o oráculo
 * poder prever a linha de `plan_week_insights` sem consultar o banco.
 *
 * Falha ALTO quando a semana não existe: rodar `--week 9` num plano de 4 semanas
 * concluiria zero treinos e imprimiria um oráculo de zeros — parecendo bug do
 * backend em vez de erro de invocação.
 */
export function buildWeekContext(
  workouts: PlanWorkout[],
  targetWeek: number,
): WeekContext {
  const inWeek = workouts
    .filter((w) => w.week_number === targetWeek)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  if (inWeek.length === 0) {
    const disponiveis = Array.from(
      new Set(workouts.map((w) => w.week_number)),
    )
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);
    throw new Error(
      `--week ${targetWeek} não existe neste plano. Semanas disponíveis: ${disponiveis.join(', ') || '(nenhuma)'}`,
    );
  }

  return {
    startStr: inWeek[0].scheduled_date,
    endStr: inWeek[inWeek.length - 1].scheduled_date,
    plannedKm: inWeek.reduce((s, w) => s + (w.distance_km || 0), 0),
    plannedCount: inWeek.length,
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function httpJson<T>(
  url: string,
  init: RequestInit & { label: string },
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${init.label} falhou: HTTP ${res.status} ${res.statusText}\n   ${text.slice(0, 400)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Autentica pelo password grant do Supabase — o MESMO fluxo do app. O
 * `access_token` retornado é o que o `SupabaseAuthGuard` valida via
 * `auth.getUser(token)`.
 */
async function signIn(params: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}): Promise<{ accessToken: string; userId: string }> {
  const data = await httpJson<{
    access_token: string;
    user: { id: string };
  }>(`${params.supabaseUrl}/auth/v1/token?grant_type=password`, {
    label: 'Login do tester',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: params.anonKey,
    },
    body: JSON.stringify({ email: params.email, password: params.password }),
  });

  return { accessToken: data.access_token, userId: data.user.id };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = resolveEnv(args.env);
  const target = ENVIRONMENTS[env];

  const apiBaseUrl =
    typeof args.api === 'string' ? args.api : target.url;

  // SEM fallback para SUPABASE_URL quando o alvo é staging. O `.env` deste repo
  // aponta para o Supabase de PRODUÇÃO, então um fallback silencioso faria
  // `--env staging` autenticar e escrever na base real — exatamente o acidente
  // que a trava existe para evitar. Faltando a var, o script diz qual definir.
  const supabaseUrl = process.env[target.supabaseUrlVar] || '';
  const anonKey = process.env[target.supabaseKeyVar] || '';

  // ── Trava de segurança ────────────────────────────────────────────────────
  const guard = assertNotProduction({
    env,
    apiBaseUrl,
    supabaseUrl,
    override: args['i-know-this-is-production'] === true,
  });
  if (!guard.ok) {
    console.error(`\n🛑 ${guard.reason}\n`);
    process.exit(1);
  }

  if (!supabaseUrl || !anonKey) {
    console.error(
      `❌ Faltam credenciais do Supabase para --env ${env}.\n` +
        `   Defina ${target.supabaseUrlVar} e ${target.supabaseKeyVar} em backend/.env`,
    );
    process.exit(1);
  }

  const email = process.env.SIM_TESTER_EMAIL || '';
  const password = process.env.SIM_TESTER_PASSWORD || '';
  if (!email || !password) {
    console.error(
      '❌ Faltam SIM_TESTER_EMAIL e SIM_TESTER_PASSWORD em backend/.env\n' +
        '   São as credenciais do tester criado manualmente na UI.',
    );
    process.exit(1);
  }

  const completions = num(args.completions, 5);
  // `null` = sem escopo de semana (comportamento original: pendentes em ordem
  // de data, atravessando semanas).
  const targetWeek =
    typeof args.week === 'string' ? num(args.week, NaN) : null;
  if (targetWeek != null && !Number.isFinite(targetWeek)) {
    throw new Error('--week precisa de um número (ex.: --week 2)');
  }
  const completionRatio = num(args['completion-ratio'], 1.0);
  const freeRuns = num(args['free-runs'], 0);
  const freeRunKm = num(args['free-run-km'], 8);
  const basePace = num(args.pace, 330);
  const jitter = num(args.jitter, 0.05);
  const seed = num(args.seed, Date.now() % 2147483647);
  const withGps = args.gps === true;
  const dryRun = args['dry-run'] === true;
  const rng = makeRng(seed);

  console.log(`\n🏃 Simulador de treinos — RunEasy`);
  console.log(`   env=${env}  api=${apiBaseUrl}`);
  console.log(`   seed=${seed}${dryRun ? '  [DRY RUN]' : ''}\n`);

  // ── 1. Login ──────────────────────────────────────────────────────────────
  const { accessToken, userId } = await signIn({
    supabaseUrl,
    anonKey,
    email,
    password,
  });
  console.log(`✅ Autenticado como ${email} (${userId})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'x-user-id': userId,
  };

  // ── 2. Pré-check de Pro (CRÍTICO) ─────────────────────────────────────────
  // `completeWorkout` DEGRADA silenciosamente para corrida livre quando o
  // usuário não é Pro (defesa em profundidade contra payload manipulado). Sem
  // este check, um tester Free produziria só corridas livres, `plan_id` ficaria
  // null em tudo, e a validação da aderência mediria zero sem explicar por quê.
  const sub = await httpJson<{ isPro: boolean; plan: string; status: string }>(
    `${apiBaseUrl}/api/users/me/subscription`,
    { label: 'Consulta de assinatura', headers: authHeaders },
  );
  if (!sub.isPro) {
    console.error(
      `\n🛑 O tester NÃO é Pro (plan=${sub.plan}, status=${sub.status}).\n` +
        `   completeWorkout degradaria toda conclusão de plano para corrida livre,\n` +
        `   e a aderência da retrospectiva mediria 0% sem motivo aparente.\n` +
        `   Torne o tester Pro antes:\n` +
        `     npm run qa:sim-revenuecat -- --user ${userId} --env ${env} --type INITIAL_PURCHASE\n`,
    );
    process.exit(1);
  }
  console.log(`✅ Tester é Pro (plan=${sub.plan}, status=${sub.status})`);

  // ── 3. Plano ativo + treinos ──────────────────────────────────────────────
  //
  // Só busca o plano quando há o que fazer com ele. A geração da retrospectiva
  // marca `training_plans.status = 'completed'`, e aí `/plan/overview` passa a
  // devolver 404 — buscar incondicionalmente fazia
  // `--completions 0 --generate-retrospective` (o caso de "só gera a retro,
  // os treinos já estão lá") morrer num 404 que nada tinha a ver com a
  // retrospectiva.
  const needsPlan = completions > 0 || freeRuns > 0;

  let planId = '(sem plano carregado)';
  let allWorkouts: PlanWorkout[] = [];
  let pending: PlanWorkout[] = [];

  // Contexto da semana alvo (--week), usado para escopar as corridas livres e
  // para o oráculo saber o denominador da aderência da semana.
  let weekStartStr: string | null = null;
  let weekEndStr: string | null = null;
  let weekPlannedKm = 0;
  let weekPlannedCount = 0;

  if (needsPlan) {
    const overview = await httpJson<PlanOverview>(
      `${apiBaseUrl}/api/training/plan/overview`,
      { label: 'Busca do plano ativo', headers: authHeaders },
    );
    planId = overview.overview.plan_id;
    // Carrega `week_number` do bloco pai — o DTO de treino não o traz, e é o
    // que `--week` precisa para escopar por semana do plano.
    allWorkouts = overview.weeks
      .flatMap((wk) =>
        wk.workouts.map((w) => ({ ...w, week_number: wk.week_number })),
      )
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    pending = allWorkouts.filter((w) => w.status === 'pending');

    console.log(
      `✅ Plano ${planId} — ${allWorkouts.length} treinos, ${pending.length} pendentes\n`,
    );

    if (targetWeek != null) {
      const ctx = buildWeekContext(allWorkouts, targetWeek);
      pending = pending.filter((w) => w.week_number === targetWeek);
      weekStartStr = ctx.startStr;
      weekEndStr = ctx.endStr;
      weekPlannedKm = ctx.plannedKm;
      weekPlannedCount = ctx.plannedCount;

      console.log(
        `🎯 Semana ${targetWeek}: ${weekStartStr} a ${weekEndStr} — ` +
          `${weekPlannedCount} treinos (${round1(weekPlannedKm)} km), ` +
          `${pending.length} pendentes\n`,
      );
    }
  } else {
    console.log(
      `ℹ️  Nada a concluir (--completions 0, --free-runs 0) — pulando a busca do plano.\n`,
    );
  }

  if (pending.length < completions) {
    console.warn(
      `⚠️  Pedidos ${completions} treinos, mas só há ${pending.length} pendentes. Concluindo ${pending.length}.`,
    );
  }
  const toComplete = pending.slice(0, Math.min(completions, pending.length));

  // ── 4. Conclui treinos do plano ───────────────────────────────────────────
  const completed: Array<{
    id: string;
    date: string;
    run: SyntheticRun;
    externalId: string;
    rpe: number | null;
  }> = [];

  for (const w of toComplete) {
    const run = buildSyntheticRun({
      distanceKm: (w.distance_km || 5) * completionRatio,
      basePaceSecondsPerKm: basePace,
      jitter,
      rng,
    });
    const externalId = makeExternalId('plan', w.id);
    const startedAt = toStartedAt(w.scheduled_date);
    const rpe = resolveRpe(args.rpe, rng);

    const payload: Record<string, unknown> = {
      // Sem GPS por padrão — `total_distance_meters` é autoritativo no backend.
      route_points: withGps
        ? buildSyntheticRoute({
            distanceMeters: run.distanceMeters,
            durationSeconds: run.durationSeconds,
            startedAtMs: new Date(startedAt).getTime(),
          })
        : [],
      total_distance_meters: run.distanceMeters,
      duration_seconds: run.durationSeconds,
      started_at: startedAt,
      external_id: externalId,
      source: 'phone',
      environment: 'outdoor',
      // `avg_pace_seconds_per_km` OMITIDO de propósito: o backend deriva de
      // duration/distance, exercitando o produtor real da unidade canônica.
      ...(rpe != null ? { rpe } : {}),
    };

    if (dryRun) {
      console.log(
        `   [dry] ${w.scheduled_date} ${w.title} → ${run.distanceKm}km em ${run.durationSeconds}s (${fmtPace(run.derivedPaceSecondsPerKm)}/km)${rpe ? ` RPE ${rpe}` : ''}`,
      );
    } else {
      await httpJson(`${apiBaseUrl}/api/training/workouts/${w.id}/complete`, {
        label: `Conclusão do treino ${w.id}`,
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      console.log(
        `   ✔ ${w.scheduled_date} ${w.title} → ${run.distanceKm}km ${fmtPace(run.derivedPaceSecondsPerKm)}/km${rpe ? ` RPE ${rpe}` : ''}`,
      );
    }
    completed.push({
      id: w.id,
      date: w.scheduled_date,
      run,
      externalId,
      rpe,
    });
  }

  // ── 5. Corridas livres ────────────────────────────────────────────────────
  // Datadas DENTRO da janela do plano: a retrospectiva filtra `activities` por
  // `start_date` entre as fronteiras do plano. Fora da janela, elas não entram
  // no "total corrido" e o D1 fica sem contraste.
  const freeRunList: Array<{
    date: string;
    run: SyntheticRun;
    externalId: string;
    rpe: number | null;
  }> = [];

  // Com --week, as livres têm que cair DENTRO da semana alvo: o insight filtra
  // `activities` pelas fronteiras daquela semana, e uma livre fora dela não
  // apareceria no "total corrido" — o contraste com a aderência sumiria.
  const windowDates = (
    targetWeek != null
      ? allWorkouts.filter((w) => w.week_number === targetWeek)
      : allWorkouts
  ).map((w) => w.scheduled_date);
  for (let i = 0; i < freeRuns; i++) {
    // Espalha as corridas livres pela janela em vez de empilhar no mesmo dia.
    const date =
      windowDates[Math.floor(((i + 1) / (freeRuns + 1)) * windowDates.length)] ??
      windowDates[0];
    const run = buildSyntheticRun({
      distanceKm: freeRunKm,
      basePaceSecondsPerKm: basePace,
      jitter,
      rng,
    });
    const externalId = makeExternalId('free', `${userId.slice(0, 8)}_${date}_${i}`);
    const startedAt = toStartedAt(date, 18); // fim de tarde
    const rpe = resolveRpe(args.rpe, rng);

    const payload: Record<string, unknown> = {
      route_points: withGps
        ? buildSyntheticRoute({
            distanceMeters: run.distanceMeters,
            durationSeconds: run.durationSeconds,
            startedAtMs: new Date(startedAt).getTime(),
          })
        : [],
      total_distance_meters: run.distanceMeters,
      duration_seconds: run.durationSeconds,
      started_at: startedAt,
      external_id: externalId,
      source: 'phone',
      environment: 'outdoor',
      ...(rpe != null ? { rpe } : {}),
    };

    if (dryRun) {
      console.log(
        `   [dry] LIVRE ${date} → ${run.distanceKm}km em ${run.durationSeconds}s`,
      );
    } else {
      await httpJson(`${apiBaseUrl}/api/training/workouts/free/complete`, {
        label: `Corrida livre ${i + 1}`,
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      console.log(
        `   ✔ LIVRE ${date} → ${run.distanceKm}km ${fmtPace(run.derivedPaceSecondsPerKm)}/km`,
      );
    }
    freeRunList.push({ date, run, externalId, rpe });
  }

  // ── 6. Retrospectiva (opcional) ───────────────────────────────────────────
  let retroId: string | null = null;
  if (args['generate-retrospective'] === true && !dryRun) {
    const retro = await httpJson<{
      retrospective_id?: string;
      already_existed?: boolean;
    }>(`${apiBaseUrl}/api/training/retrospective/generate`, {
      label: 'Geração da retrospectiva',
      method: 'POST',
      headers: authHeaders,
    });
    retroId = retro.retrospective_id ?? null;
    console.log(
      `\n✅ Retrospectiva ${retroId}${retro.already_existed ? ' (já existia)' : ''}`,
    );
  }

  // ── 7. Insight semanal (opcional) ─────────────────────────────────────────
  let weeklyInsight: {
    generated: boolean;
    weekNumber: number | null;
    insightId: string | null;
    reason?: string;
  } | null = null;

  if (args['generate-weekly-insight'] === true && !dryRun) {
    weeklyInsight = await httpJson<NonNullable<typeof weeklyInsight>>(
      `${apiBaseUrl}/api/training/weekly-insight/generate`,
      {
        label: 'Geração do insight semanal',
        method: 'POST',
        headers: authHeaders,
      },
    );

    if (weeklyInsight.generated) {
      console.log(
        `\n✅ Insight da semana ${weeklyInsight.weekNumber}: ${weeklyInsight.insightId}`,
      );
    } else {
      console.warn(
        `\n⚠️  Nenhum insight gerado (motivo: ${weeklyInsight.reason}).\n` +
          reasonHint(weeklyInsight.reason),
      );
    }
  }

  printOracle({
    completed,
    freeRunList,
    retroId,
    planId,
    targetWeek,
    weekStartStr,
    weekEndStr,
    weekPlannedKm,
    weekPlannedCount,
    weeklyInsight,
  });
}

function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * O ORÁCULO. Imprime os valores que a retrospectiva DEVE produzir, para
 * conferência direta contra a linha de `plan_retrospectives`.
 */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Por que o backend recusou gerar o insight — e o que fazer a respeito. */
function reasonHint(reason: string | undefined): string {
  switch (reason) {
    case 'no_eligible_week':
      return (
        '      A semana precisa (a) já ter FECHADO — o último treino dela tem que\n' +
        '      ser anterior a hoje; (b) NÃO ser a última do plano, que é coberta\n' +
        '      pela retrospectiva; (c) fechar em data >= WEEKLY_INSIGHT_START_DATE;\n' +
        '      e (d) ainda não ter linha em plan_week_insights.'
      );
    case 'no_active_plan':
      return '      O tester não tem plano ativo — a retrospectiva pode tê-lo concluído.';
    case 'no_workouts':
      return '      O plano ativo não tem treinos com scheduled_date.';
    case 'generation_failed':
      return '      A linha ficou com status=failed. Confira os logs do backend.';
    default:
      return '';
  }
}

/**
 * O ORÁCULO SEMANAL. Só é impresso com --week, porque sem escopo de semana os
 * números do plano inteiro não dizem nada sobre uma linha de plan_week_insights.
 */
function printWeeklyOracle(params: {
  targetWeek: number;
  weekStartStr: string | null;
  weekEndStr: string | null;
  weekPlannedKm: number;
  weekPlannedCount: number;
  completed: Array<{ date: string; run: SyntheticRun }>;
  freeRunList: Array<{ date: string; run: SyntheticRun }>;
  weeklyInsight: { generated: boolean; weekNumber: number | null } | null;
  planId: string;
}) {
  const planKm = params.completed.reduce((s, c) => s + c.run.distanceKm, 0);
  const freeKm = params.freeRunList.reduce((s, f) => s + f.run.distanceKm, 0);

  // Denominador do executionRatio: o PRESCRITO só dos treinos concluídos.
  // Como o harness aplica --completion-ratio uniformemente, o ratio esperado é
  // o próprio completion-ratio (×100).
  const completedCount = params.completed.length;
  const completionRate = params.weekPlannedCount
    ? Math.round((completedCount / params.weekPlannedCount) * 100)
    : 0;
  const distanceVsGoal = params.weekPlannedKm
    ? Math.round((planKm / params.weekPlannedKm) * 100)
    : 0;
  const distinctDays = new Set(params.completed.map((c) => c.date)).size;

  console.log('\n' + '═'.repeat(72));
  console.log(`  SEMANA ${params.targetWeek} — confira contra plan_week_insights`);
  console.log('═'.repeat(72));
  console.log(`
  week_start / week_end        esperado:  ${params.weekStartStr} .. ${params.weekEndStr}
  planned_workouts             esperado:  ${params.weekPlannedCount}
  completed_workouts           esperado:  ${completedCount}
  completion_rate              esperado:  ${completionRate}%
  planned_distance_km          esperado:  ${round1(params.weekPlannedKm)}
  completed_distance_km        esperado:  ${round1(planKm)}   ← SEM os livres
  distance_vs_goal_percent     esperado:  ${distanceVsGoal}%
  frequency_actual_days        esperado:  ${distinctDays}   ← dias, não treinos
  total_distance_km            esperado:  ${round1(planKm + freeKm)}   ← COM os livres
  free_run_distance_km         esperado:  ${round1(freeKm)}
  total_runs_in_period         esperado:  ${completedCount + params.freeRunList.length}`);

  console.log(`
  ⚠️  completed_distance_km NÃO pode incluir os ${round1(freeKm)} km livres.
      Somar os dois é contar a mesma corrida duas vezes.

  SQL de conferência:

    SELECT week_number, week_start, week_end,
           planned_workouts, completed_workouts, completion_rate,
           execution_ratio_percent, planned_distance_km, completed_distance_km,
           distance_vs_goal_percent, frequency_actual_days, frequency_target_days,
           total_distance_km, free_run_distance_km, total_runs_in_period,
           suggested_adjustment, zone_distribution, intensity_adherence,
           status, processed_at, notified_at, left(ai_narrative, 200) AS narrativa
      FROM plan_week_insights
     WHERE plan_id = '${params.planId}' AND week_number = ${params.targetWeek};

    -- Exatamente 1 notificação:
    SELECT type, title, metadata->>'weekNumber' AS semana, created_at
      FROM notifications
     WHERE type = 'weekly_insight' AND created_at > now() - interval '15 minutes';
`);

  if (params.weeklyInsight?.generated) {
    console.log(
      `  ℹ️  O backend gerou a semana ${params.weeklyInsight.weekNumber}. Se não for ${params.targetWeek},\n` +
        `      ele escolheu outra semana elegível — o gatilho manual pega a ÚLTIMA\n` +
        `      fechada sem insight, que pode não ser a que você acabou de preencher.\n`,
    );
  }
}

function printOracle(params: {
  completed: Array<{ id: string; date: string; run: SyntheticRun; externalId: string; rpe: number | null }>;
  freeRunList: Array<{ date: string; run: SyntheticRun; externalId: string; rpe: number | null }>;
  retroId: string | null;
  planId: string;
  targetWeek?: number | null;
  weekStartStr?: string | null;
  weekEndStr?: string | null;
  weekPlannedKm?: number;
  weekPlannedCount?: number;
  weeklyInsight?: {
    generated: boolean;
    weekNumber: number | null;
    insightId: string | null;
    reason?: string;
  } | null;
}) {
  if (params.targetWeek != null) {
    printWeeklyOracle({
      targetWeek: params.targetWeek,
      weekStartStr: params.weekStartStr ?? null,
      weekEndStr: params.weekEndStr ?? null,
      weekPlannedKm: params.weekPlannedKm ?? 0,
      weekPlannedCount: params.weekPlannedCount ?? 0,
      completed: params.completed,
      freeRunList: params.freeRunList,
      weeklyInsight: params.weeklyInsight ?? null,
      planId: params.planId,
    });
  }

  const planKm = params.completed.reduce((s, c) => s + c.run.distanceKm, 0);
  const freeKm = params.freeRunList.reduce((s, f) => s + f.run.distanceKm, 0);

  // Recorde esperado: a maior corrida ÚNICA entre TODAS as geradas (plano E
  // livre). O escopo é de propósito diferente do de aderência — se a corrida
  // livre for a maior, é ela que tem que aparecer em longest_run_km.
  const allRuns = [
    ...params.completed.map((c) => ({ km: c.run.distanceKm, date: c.date })),
    ...params.freeRunList.map((f) => ({ km: f.run.distanceKm, date: f.date })),
  ];
  const longest = allRuns.reduce<{ km: number; date: string } | null>(
    (best, r) => (best === null || r.km > best.km ? r : best),
    null,
  );
  const longestFromFreeRun =
    longest !== null &&
    params.freeRunList.some(
      (f) => f.run.distanceKm === longest.km && f.date === longest.date,
    );

  console.log('\n' + '═'.repeat(72));
  console.log('  VALORES ESPERADOS — confira contra plan_retrospectives');
  console.log('═'.repeat(72));

  console.log(`\n  Treinos do plano concluídos: ${params.completed.length}`);
  for (const c of params.completed) {
    console.log(
      `    ${c.date}  ${String(c.run.distanceKm).padStart(6)} km  ${c.externalId}${c.rpe ? `  RPE ${c.rpe}` : ''}`,
    );
  }

  if (params.freeRunList.length > 0) {
    console.log(`\n  Corridas livres: ${params.freeRunList.length}`);
    for (const f of params.freeRunList) {
      console.log(
        `    ${f.date}  ${String(f.run.distanceKm).padStart(6)} km  ${f.externalId}`,
      );
    }
  }

  console.log('\n  ' + '─'.repeat(68));
  console.log(`  plan_distance_completed_km  esperado:  ${round1(planKm)}`);
  console.log(`  free_run_distance_km        esperado:  ${round1(freeKm)}`);
  console.log(`  total_distance_km           esperado:  ${round1(planKm + freeKm)}`);
  console.log(`  total_runs_in_period        esperado:  ${params.completed.length + params.freeRunList.length}`);
  console.log(`  total_workouts_completed    esperado:  ${params.completed.length}`);
  if (longest) {
    console.log(`  longest_run_km              esperado:  ${longest.km}`);
    console.log(`  longest_run_date            esperado:  ${longest.date}`);
  }
  console.log('  ' + '─'.repeat(68));

  console.log(`
  ⚠️  plan_distance_completed_km NÃO pode incluir os ${round1(freeKm)} km livres.
      Se incluir, o defeito D1 da Fase 1A voltou.
`);

  if (longest) {
    console.log(
      longestFromFreeRun
        ? `  ✅ O recorde (${longest.km} km) veio de uma CORRIDA LIVRE — é o caso que\n` +
            `      importa: longest_run_km conta plano E livre, ao contrário de\n` +
            `      plan_distance_completed_km. Se vier ${round1(
              Math.max(...params.completed.map((c) => c.run.distanceKm), 0),
            )} km (o maior do plano),\n` +
            `      o escopo do recorde foi estreitado por engano.\n`
        : `  ℹ️  O recorde (${longest.km} km) veio de um treino do plano. Para exercitar\n` +
            `      o escopo do recorde, rode com --free-run-km MAIOR que o maior\n` +
            `      treino do plano — aí o recorde tem que vir da corrida livre.\n`,
    );
  }

  console.log(`  SQL de conferência:

    SELECT plan_distance_completed_km, free_run_distance_km, total_distance_km,
           total_runs_in_period, total_workouts_completed, total_distance_planned_km,
           longest_run_km, longest_run_date,
           distance_vs_goal_percent, completion_rate, frequency_vs_goal_percent,
           plan_window_start, plan_window_end
      FROM plan_retrospectives
     WHERE plan_id = '${params.planId}';
`);

  if (params.retroId) {
    console.log(`  Retrospectiva gerada: ${params.retroId}\n`);
  }
}

// Só executa quando chamado como CLI — permite importar os helpers no teste.
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
