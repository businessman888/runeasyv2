/**
 * Gate da exclusão de conta. Cria um usuário DESCARTÁVEL no staging, popula as
 * tabelas que importam, apaga pela ROTA REAL e confere o que sobrou.
 *
 *   npm run deletion:gate -- --env staging
 *
 * ── POR QUE ESTE SCRIPT EXISTE ───────────────────────────────────────────────
 *
 * A suíte de testes prova a ORDEM e as decisões do código. Ela não prova nada
 * sobre o mundo externo: que `public.users` realmente cascateia a partir de
 * `auth.users`, que `connected_devices` some junto, que o grant no Google cai,
 * que o worker é acordado pela fila. Isso é premissa sobre banco e rede, e
 * premissa sobre o mundo externo só se confirma medindo.
 *
 * O bug que este trabalho conserta passou despercebido exatamente assim: a
 * rota respondia 200, o app dizia "conta excluída", e a linha de `auth.users`
 * com os tokens OAuth de saúde continuava lá.
 *
 * ── POR QUE SÓ STAGING, SEM EXCEÇÃO ──────────────────────────────────────────
 *
 * Este script CRIA e APAGA usuário. Não existe flag para produção, nem
 * `--yes-production`: o pior resultado possível de um bug aqui é apagar conta
 * de gente de verdade. O `.env` local aponta para produção, então o alvo é
 * forçado explicitamente e conferido antes de qualquer escrita.
 *
 * ── LIMPEZA ──────────────────────────────────────────────────────────────────
 *
 * Se o gate falhar no meio, o usuário descartável fica. O id aparece no log e
 * `--cleanup <id>` remove.
 */

import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'crypto';

loadEnv();

const STAGING_API = 'https://runeasyv2-staging.up.railway.app';
const SENHA = `gate-${randomUUID()}`;

/** Tabelas conferidas depois da exclusão. Nenhuma pode sobrar com linha. */
const TABELAS = [
  'activities',
  'ai_feedbacks',
  'ai_usage_logs',
  'connected_devices',
  'notifications',
  'oauth_states',
  'plan_adaptations',
  'plan_meso_insights',
  'plan_retrospectives',
  'plan_vdot_history',
  'plan_week_insights',
  'points_history',
  'readiness_history',
  'training_plan_generation_requests',
  'training_plans',
  'user_badges',
  'user_levels',
  'user_onboarding',
  'users',
  'workout_briefings',
  'workouts',
];

interface Alvo {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  apiUrl: string;
}

function resolverAlvo(argv: string[]): Alvo {
  const i = argv.indexOf('--env');
  const env = i >= 0 ? argv[i + 1] : undefined;

  if (env !== 'staging') {
    throw new Error(
      'este gate só roda com --env staging.\n' +
        '  Ele cria e apaga usuário: não existe versão de produção, de propósito.',
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL_STAGING;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
  const anonKey = process.env.SUPABASE_ANON_KEY_STAGING;

  if (!supabaseUrl || !serviceKey || !anonKey) {
    throw new Error(
      'faltam SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING / ' +
        'SUPABASE_ANON_KEY_STAGING no .env local.',
    );
  }

  // SEM fallback para SUPABASE_URL: ele aponta para produção neste repo, e um
  // fallback silencioso aqui criaria e apagaria usuário no banco errado.
  const producao = process.env.SUPABASE_URL;
  if (producao && new URL(producao).host === new URL(supabaseUrl).host) {
    throw new Error(
      'RECUSADO: SUPABASE_URL_STAGING aponta para o MESMO host de SUPABASE_URL ' +
        '(que é produção). Confira o .env antes de rodar.',
    );
  }

  const j = argv.indexOf('--api');
  return {
    supabaseUrl,
    serviceKey,
    anonKey,
    apiUrl: j >= 0 ? argv[j + 1] : STAGING_API,
  };
}

async function rest<T>(
  alvo: Alvo,
  path: string,
  init: RequestInit & { label: string },
): Promise<T> {
  const res = await fetch(`${alvo.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: alvo.serviceKey,
      Authorization: `Bearer ${alvo.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(
      `${init.label}: HTTP ${res.status} — ${texto.slice(0, 300)}`,
    );
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

async function contar(
  alvo: Alvo,
  tabela: string,
  userId: string,
): Promise<number> {
  // `users` é a única cuja chave é `id`; o resto usa `user_id`.
  const coluna = tabela === 'users' ? 'id' : 'user_id';
  const res = await fetch(
    `${alvo.supabaseUrl}/rest/v1/${tabela}?${coluna}=eq.${userId}&select=${coluna}`,
    {
      headers: {
        apikey: alvo.serviceKey,
        Authorization: `Bearer ${alvo.serviceKey}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    },
  );
  if (!res.ok) return -1; // tabela inexistente neste ambiente: informa, não trava
  const range = res.headers.get('content-range') ?? '0/0';
  return Number(range.split('/')[1] ?? 0);
}

async function limpar(alvo: Alvo, userId: string): Promise<void> {
  const res = await fetch(`${alvo.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: alvo.serviceKey,
      Authorization: `Bearer ${alvo.serviceKey}`,
    },
  });
  console.log(
    res.ok
      ? `🧹 usuário ${userId} removido`
      : `⚠️  não consegui remover ${userId}: HTTP ${res.status}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const alvo = resolverAlvo(argv);

  console.log('');
  console.log('  Supabase : %s', new URL(alvo.supabaseUrl).host);
  console.log('  API      : %s', alvo.apiUrl);
  console.log('');

  const c = argv.indexOf('--cleanup');
  if (c >= 0) {
    await limpar(alvo, argv[c + 1]);
    return;
  }

  // ── 0. Pré-voo: a migration está aplicada? ────────────────────────────────
  //
  // Sem a coluna, a rota falha no UPDATE e o gate reportaria "nada foi
  // excluído" sem dizer por quê. Falhar aqui é falhar no lugar certo.
  const preflight = await fetch(
    `${alvo.supabaseUrl}/rest/v1/users?select=deletion_requested_at&limit=1`,
    {
      headers: {
        apikey: alvo.serviceKey,
        Authorization: `Bearer ${alvo.serviceKey}`,
      },
    },
  );
  if (!preflight.ok) {
    throw new Error(
      'a coluna `users.deletion_requested_at` não existe no staging.\n' +
        '  Aplique a migration 20260918194246_add_user_deletion_state.sql antes do gate.',
    );
  }
  console.log('✅ migration aplicada (coluna deletion_requested_at existe)');

  // ── 1. Usuário descartável ────────────────────────────────────────────────
  const email = `delete-gate-${Date.now()}@example.com`;
  const criado = await rest<{ id: string }>(alvo, '/auth/v1/admin/users', {
    label: 'criar usuário descartável',
    method: 'POST',
    body: JSON.stringify({ email, password: SENHA, email_confirm: true }),
  });
  const userId = criado.id;
  console.log(`✅ usuário descartável ${userId} (${email})`);

  try {
    // ── 2. Popular ──────────────────────────────────────────────────────────
    //
    // Escolhidas a dedo: as três que penduram em `auth.users` e sobreviviam à
    // exclusão antiga, mais a que não tem FK nenhuma.
    await rest(alvo, '/rest/v1/connected_devices', {
      label: 'popular connected_devices',
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        provider: 'google_health',
        provider_user_id: 'gate-health-user',
        access_token: 'token-falso-do-gate',
        refresh_token: 'refresh-falso-do-gate',
        scope: 'activity.readonly',
      }),
    });
    await rest(alvo, '/rest/v1/oauth_states', {
      label: 'popular oauth_states',
      method: 'POST',
      body: JSON.stringify({
        state: `gate-${randomUUID()}`,
        user_id: userId,
        provider: 'google_health',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      }),
    });
    await rest(alvo, '/rest/v1/points_history', {
      label: 'popular points_history',
      method: 'POST',
      body: JSON.stringify({ user_id: userId, points: 10, reason: 'gate' }),
    });
    await rest(alvo, '/rest/v1/ai_usage_logs', {
      label: 'popular ai_usage_logs',
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        feature_name: 'deletion-gate',
        model_name: 'nenhum',
      }),
    });
    console.log(
      '✅ populado: connected_devices, oauth_states, points_history, ai_usage_logs',
    );

    const antes: Record<string, number> = {};
    for (const t of TABELAS) antes[t] = await contar(alvo, t, userId);
    const povoadas = Object.entries(antes).filter(([, n]) => n > 0);
    console.log(
      `   linhas antes: ${povoadas.map(([t, n]) => `${t}=${n}`).join(', ')}`,
    );

    // ── 3. Exclusão pela ROTA REAL ──────────────────────────────────────────
    //
    // Chamar o service direto provaria o service. Só a rota prova o guard, o
    // 202, a fila e o worker — que é a cadeia que o usuário aciona.
    const login = await fetch(
      `${alvo.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: alvo.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: SENHA }),
      },
    );
    const sessao = (await login.json()) as { access_token?: string };
    if (!sessao.access_token) {
      throw new Error('login do usuário descartável falhou');
    }

    const del = await fetch(`${alvo.apiUrl}/api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessao.access_token}`,
        'x-user-id': userId,
        'Content-Type': 'application/json',
      },
    });
    const corpo = await del.text();
    console.log(
      `   DELETE /api/users/${userId} → HTTP ${del.status} ${corpo.slice(0, 200)}`,
    );
    if (del.status !== 202) {
      throw new Error(`esperado 202 (aceito), veio ${del.status}`);
    }
    console.log('✅ rota respondeu 202');

    // ── 4. Esperar o worker ─────────────────────────────────────────────────
    let sumiu = false;
    for (let tentativa = 1; tentativa <= 30 && !sumiu; tentativa += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(
        `${alvo.supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          headers: {
            apikey: alvo.serviceKey,
            Authorization: `Bearer ${alvo.serviceKey}`,
          },
        },
      );
      sumiu = res.status === 404;
      if (!sumiu) process.stdout.write('.');
    }
    console.log('');

    // ── 5. Verdito ──────────────────────────────────────────────────────────
    const depois: Record<string, number> = {};
    for (const t of TABELAS) depois[t] = await contar(alvo, t, userId);

    console.log('');
    console.log('  tabela                              antes  depois');
    console.log('  ' + '-'.repeat(52));
    for (const t of TABELAS) {
      const marca = depois[t] > 0 ? ' ❌' : '';
      if (antes[t] !== 0 || depois[t] !== 0) {
        console.log(
          `  ${t.padEnd(36)}${String(antes[t]).padStart(5)}${String(depois[t]).padStart(8)}${marca}`,
        );
      }
    }
    console.log(
      `  ${'auth.users'.padEnd(36)}${'1'.padStart(5)}${(sumiu ? '0' : '1').padStart(8)}${sumiu ? '' : ' ❌'}`,
    );
    console.log('');

    const sobrou = TABELAS.filter((t) => depois[t] > 0);
    if (!sumiu || sobrou.length > 0) {
      console.error('❌ GATE REPROVADO');
      if (!sumiu)
        console.error('   `auth.users` sobreviveu — era exatamente o bug.');
      if (sobrou.length)
        console.error(`   sobraram linhas em: ${sobrou.join(', ')}`);
      console.error(
        `   limpe com: npm run deletion:gate -- --env staging --cleanup ${userId}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      '✅ GATE APROVADO — nada sobrou em nenhuma tabela, `auth.users` incluída.',
    );
    console.log('');
    console.log('   Falta conferir À MÃO, porque são estados fora do banco:');
    console.log(
      '   • myaccount.google.com/permissions — o RunEasy sumiu da conta de teste?',
    );
    console.log(
      '   • a subscription do usuário sumiu do Google (gh:backfill-subscriptions reconcilia)',
    );
    console.log(
      '   • o log do staging: procure `[account-deletion]` e confira o resumo',
    );
  } catch (erro) {
    console.error('');
    console.error(`❌ ${erro instanceof Error ? erro.message : String(erro)}`);
    console.error(
      `   usuário descartável ${userId} pode ter ficado. Limpe com:`,
    );
    console.error(
      `   npm run deletion:gate -- --env staging --cleanup ${userId}`,
    );
    process.exitCode = 1;
  }
}

void main();
