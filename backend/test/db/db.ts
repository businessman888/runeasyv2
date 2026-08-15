/**
 * Acesso ao Postgres DESCARTÁVEL dos testes de integração (Fase 6.1).
 *
 * ── POR QUE `pg` E NÃO `supabase-js` ─────────────────────────────────────────
 *
 * A fundação da Fase 6 existe para garantir atomicidade, lock e concorrência
 * otimista. Provar isso exige segurar DUAS transações abertas ao mesmo tempo e
 * interleavá-las deliberadamente — "A pega o lock, B espera, A commita, B vê o
 * estado novo e é rejeitada". O PostgREST fecha a transação a cada request, e o
 * `supabase-js` é um cliente HTTP: por construção ele não consegue expressar
 * esse teste.
 *
 * O que fica sem cobertura aqui é a serialização de parâmetros do `.rpc()` —
 * casca fina, exercitada pelo harness em staging.
 *
 * ⚠️ `pg` é devDependency. O runtime do backend continua falando SÓ PostgREST.
 */

import { Client, Pool, PoolClient } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DEFAULT_URL =
  'postgres://postgres:postgres@localhost:55432/runeasy_test';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || DEFAULT_URL;

const SUPABASE_DIR = join(__dirname, '..', '..', 'supabase');
const MIGRATIONS_DIR = join(SUPABASE_DIR, 'migrations');

/**
 * Trava de segurança, no mesmo espírito da do `scripts/sim-workouts.ts`.
 *
 * Estes testes fazem TRUNCATE em `workouts`, `training_plans` e `users`. Apontar
 * isso para staging ou produção apagaria dado real de um pagante. A trava é por
 * ALLOWLIST (só localhost na porta do container efêmero), não por blocklist:
 * uma blocklist tem que adivinhar todos os hosts perigosos; a allowlist só
 * precisa conhecer o único host seguro.
 */
export function assertDisposableTarget(url = TEST_DATABASE_URL): void {
  const parsed = new URL(url);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(
    parsed.hostname,
  );
  const isTestDb = parsed.pathname.replace(/^\//, '') === 'runeasy_test';

  // A porta NÃO entra na allowlist de propósito: o container usa 55432, um
  // Postgres local usa 5432, e um runner de CI usa o que quiser. O que protege
  // é a combinação host local + banco chamado `runeasy_test` — staging e
  // produção são remotos (`*.supabase.co`) e nunca se chamam assim.
  if (!isLocalHost || !isTestDb) {
    throw new Error(
      `[test-db] RECUSADO: ${parsed.hostname}:${parsed.port}${parsed.pathname}\n` +
        'Os testes de integração fazem TRUNCATE em workouts, training_plans e\n' +
        'users. Só um banco LOCAL chamado `runeasy_test` é aceito.\n' +
        'Suba o descartável com: docker compose --profile test up -d postgres-test',
    );
  }
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    assertDisposableTarget();
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Uma conexão DEDICADA — para os testes que precisam de transação própria. */
export async function newClient(): Promise<Client> {
  assertDisposableTarget();
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return client;
}

export async function withClient<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Atalho de leitura. */
export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Construção do schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monta o schema do zero: bootstrap → dump de produção → migrations.
 *
 * ── POR QUE O DUMP, E NÃO SÓ AS MIGRATIONS ───────────────────────────────────
 *
 * As tabelas CORE (`users`, `training_plans`, `workouts`, `activities`) NÃO
 * estão em migration nenhuma — foram criadas fora do versionamento e só existem
 * em `supabase/schema_producao.sql`. É por isso que `supabase db reset` falharia
 * hoje, e é por isso que o dump é o ponto de partida aqui.
 *
 * As migrations rodam por cima, em ordem alfabética (que é cronológica pelo
 * prefixo YYYYMMDD). As anteriores à data do dump são no-ops: todas usam
 * `IF NOT EXISTS` / `CREATE OR REPLACE`, e as duas de dados (`normalize_
 * activities_pace_unit`, `add_welcome_badge`) rodam contra tabela vazia ou têm
 * `ON CONFLICT DO NOTHING`.
 */
export async function buildSchema(): Promise<void> {
  assertDisposableTarget();
  const client = await newClient();

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');

    await client.query(readFileSync(join(__dirname, 'bootstrap.sql'), 'utf8'));

    // `\restrict` / `\unrestrict` são meta-comandos do psql (pg_dump 17.10+) e
    // não são SQL — o driver os rejeitaria. São as duas ÚNICAS linhas de
    // barra-invertida no dump.
    let dump = readFileSync(join(SUPABASE_DIR, 'schema_producao.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('\\'))
      .join('\n');

    // ── Degradação sem PostGIS ───────────────────────────────────────────────
    //
    // O dump declara `extensions.geometry(LineString,4326)` em
    // `activities.route_geometry` e `workout_routes.route`, mais um índice GiST.
    // A imagem `postgis/postgis` do docker-compose tem tudo isso; um Postgres
    // qualquer (o do dev, um runner de CI) não.
    //
    // Trocar por `text` mantém o schema carregável em qualquer Postgres 17 sem
    // afetar o que está sendo testado: as duas colunas vivem em tabelas que a
    // fundação NUNCA toca — o patch escreve em `workouts` e o digest lê
    // `training_plans` + `workouts`. Se um dia um teste da fundação precisar de
    // geometria, esta degradação tem que sair.
    const hasPostgis = await client
      .query(`SELECT 1 FROM pg_extension WHERE extname = 'postgis'`)
      .then((r) => r.rowCount === 1);

    if (!hasPostgis) {
      dump = dump
        .replace(/extensions\.geometry\([^)]*\)/g, 'text')
        .replace(/^CREATE INDEX .*USING gist .*;$/gm, '');
    }

    await client.query(dump);

    // O dump termina com `search_path` VAZIO (ele qualifica tudo com `public.`).
    // As migrations usam nomes soltos (`ALTER TABLE workouts`), então o
    // search_path precisa voltar antes delas.
    await client.query('SET search_path = public');

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const skipped: string[] = [];

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        const code = (err as { code?: string }).code ?? '';
        const msg = err instanceof Error ? err.message : String(err);

        // ── SOBREPOSIÇÃO COM O DUMP ─────────────────────────────────────────
        //
        // O dump é a produção de 2026-06-11: ele JÁ CONTÉM o efeito de toda
        // migration anterior a essa data. Replayá-las bate em "already
        // exists", e isso é o sinal esperado da sobreposição — não um defeito.
        //
        // A tolerância é estreita de propósito: só a família de erros de
        // objeto duplicado. Sintaxe inválida, coluna inexistente ou tipo
        // errado continuam abortando o setup — que é o que precisa acontecer
        // quando uma migration NOVA está quebrada.
        const DUPLICATE = new Set([
          '42P07', // duplicate_table (inclui índice)
          '42710', // duplicate_object
          '42701', // duplicate_column
          '42P06', // duplicate_schema
          '42723', // duplicate_function
          '42P16', // invalid_table_definition (constraint já existente)
        ]);

        if (DUPLICATE.has(code)) {
          skipped.push(file);
          continue;
        }
        throw new Error(`[test-db] migration ${file} falhou (${code}): ${msg}`);
      }
    }

    // Rede de segurança: uma migration NOVA nunca deveria colidir com o dump.
    // Se colidir, é sinal de que ela recria algo que já existe — e aí o
    // silêncio seria perigoso.
    const novasPuladas = skipped.filter((f) => f >= '20260815');
    if (novasPuladas.length > 0) {
      throw new Error(
        `[test-db] migrations NOVAS foram puladas por objeto duplicado: ${novasPuladas.join(', ')}`,
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Zera os DADOS entre testes, preservando o schema.
 *
 * TRUNCATE em vez de reconstruir: o schema leva segundos, o truncate leva
 * milissegundos, e cada teste da fundação precisa de estado limpo.
 * `auth.users` entra na lista porque `public.users` tem FK para ela.
 */
export async function resetData(): Promise<void> {
  await getPool().query(`
    TRUNCATE TABLE
      public.plan_adaptations,
      public.plan_vdot_history,
      public.plan_week_insights,
      public.plan_meso_insights,
      public.plan_retrospectives,
      public.workout_briefings,
      public.ai_feedbacks,
      public.workout_routes,
      public.activities,
      public.workouts,
      public.training_plans,
      public.notifications,
      public.users,
      auth.users
    RESTART IDENTITY CASCADE
  `);
}
