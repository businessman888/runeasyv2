-- Bootstrap do Postgres DESCARTÁVEL de teste (Fase 6.1).
--
-- Roda ANTES de `supabase/schema_producao.sql` e das migrations. Cria só o que
-- o Supabase fornece de graça e o Postgres puro não tem — nada além disso.
--
-- ── O ACOPLAMENTO REAL COM O SUPABASE É RASO ─────────────────────────────────
--
-- O dump de produção referencia o mundo Supabase em exatamente dois pontos:
--   1. três FKs para `auth.users(id)` — users, connected_devices, points_history;
--   2. seis policies de RLS usando `auth.uid()` / `auth.role()`.
-- E as migrations concedem EXECUTE a `service_role` em algumas funções.
--
-- Nada disso exige GoTrue, PostgREST, Realtime ou Storage. Por isso o banco de
-- teste é UM container e não oito.
--
-- ── O QUE ESTES STUBS NÃO SÃO ────────────────────────────────────────────────
--
-- `auth.uid()` e `auth.role()` devolvem NULL aqui. Isso é deliberado e é a
-- verdade do que estamos testando: o backend usa a SERVICE ROLE, que ignora RLS
-- por completo. Os testes da fundação provam o escopo de propriedade pelo
-- `WHERE user_id = p_user_id` DENTRO das funções — que é a única defesa que de
-- fato existe em produção. Um stub que fingisse sessão daria uma sensação falsa
-- de cobertura de RLS.

-- ── 1. Roles que as migrations referenciam em GRANT/REVOKE ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ── 2. Schema `auth` mínimo ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

-- As três FKs apontam só para `id`, mas a migration de paridade
-- (20260608_staging_schema_parity) faz backfill lendo `email` e
-- `raw_user_meta_data` — daí as três colunas, e não uma.
--
-- `seedPlan()` insere aqui antes de inserir em `public.users`, senão a FK
-- recusa.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

-- ── 3. Schema `extensions` (convenção do Supabase) ───────────────────────────
--
-- O dump não declara `CREATE EXTENSION` — ele assume que o Supabase já as
-- instalou no schema `extensions` e só referencia os tipos/funções de lá:
--   `extensions.uuid_generate_v4()`  → uuid-ossp
--   `extensions.geometry(LineString,4326)` + índice GiST → postgis
--
-- `gen_random_uuid()` (usado pelas migrations novas) é nativo desde o PG 13 e
-- não precisa de extensão.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- PostGIS quando disponível; senão o carregador (`db.ts`) substitui as duas
-- colunas de geometria por `text`. Ver o comentário de `buildSchema`: elas
-- ficam em `activities` e `workout_routes`, tabelas que a fundação nunca toca.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[test-db] PostGIS indisponível — geometria será carregada como text';
END $$;
