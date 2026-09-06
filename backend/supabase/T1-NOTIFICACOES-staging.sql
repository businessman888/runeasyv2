-- =============================================================================
-- TAREFA 1 — Notificações duplicadas · roteiro de STAGING
-- =============================================================================
--
-- ⚠️ ORDEM OBRIGATÓRIA: rode ESTE ARQUIVO **ANTES** de o deploy do `develop`
-- subir.
--
-- O código novo grava `notifications.dedupe_key`. Se ele subir antes da coluna
-- existir, todo INSERT de cron falha com 42703 e NENHUMA notificação sai — nem
-- o lembrete de treino, nem o convite de prontidão. O backend loga a dica
-- ("a coluna `dedupe_key` não existe: aplique a migration …"), mas o certo é
-- não chegar lá: a migration é ADITIVA e o código velho ignora a coluna, então
-- aplicá-la antes é seguro em qualquer ordem de deploy.
--
-- Fonte: `supabase/migrations/20260905_add_notification_dedupe_key.sql`.
-- Este arquivo é a mesma migration com as medições de antes e depois em volta.
-- =============================================================================


-- ── BLOCO 0 — a medição ANTES (guarde o resultado) ──────────────────────────
--
-- Em PRODUÇÃO, em 2026-09-05, esta query devolveu:
--   reminder           4038 / 4140  (97,5%)
--   achievement           4 /    7  (57,1%)  ← causa DIFERENTE, fora do escopo
--   weekly_insight        0 /    9  (0%)     ← já protegido por UNIQUE
--   workout_sync          0 /    7  (0%)
--   recovery_analysis     0 /    7  (0%)

WITH pares AS (
  SELECT type, created_at,
         lag(created_at) OVER (PARTITION BY user_id, type, title ORDER BY created_at) AS ant
    FROM notifications
)
SELECT type,
       count(*) FILTER (WHERE ant IS NOT NULL AND created_at - ant < interval '5 seconds') AS duplicadas,
       count(*) AS total,
       round(100.0 * count(*) FILTER (WHERE ant IS NOT NULL AND created_at - ant < interval '5 seconds')
             / nullif(count(*), 0), 1) AS pct
  FROM pares GROUP BY type ORDER BY total DESC;


-- ── BLOCO 1 — a migration ───────────────────────────────────────────────────
-- Idempotente: pode rodar de novo sem efeito.

alter table public.notifications
  add column if not exists dedupe_key text;

comment on column public.notifications.dedupe_key is
  'Chave determinística de idempotência montada pelo produtor '
  '(ex.: reminder:<workout_id>:<YYYY-MM-DD>, daily_readiness:<user_id>:<YYYY-MM-DD>). '
  'NULL em notificações request-driven, que não precisam de guarda. '
  'Ver NotificationService.notifyOnce.';

-- NÃO parcial, de propósito: um índice com `WHERE dedupe_key IS NOT NULL` não
-- pode ser inferido por `ON CONFLICT (dedupe_key) DO NOTHING` e derrubaria todo
-- insert de cron com "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" (verificado contra o Postgres real). NULLs são
-- distintos entre si num UNIQUE comum, então as linhas request-driven convivem.
create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key);

-- O índice que faltava: toda leitura do app é
-- `WHERE user_id = ? ORDER BY created_at DESC` e a tabela só tinha a PK.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);


-- ── BLOCO 2 — verificação estrutural (as 3 linhas devem existir) ────────────

SELECT 'coluna' AS objeto, column_name AS nome, data_type AS detalhe
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='notifications' AND column_name='dedupe_key'
UNION ALL
SELECT 'indice', indexname, indexdef
  FROM pg_indexes
 WHERE schemaname='public' AND tablename='notifications'
   AND indexname IN ('notifications_dedupe_key_uidx','notifications_user_created_idx')
 ORDER BY 1, 2;


-- ── BLOCO 3 — DEPOIS do deploy, no dia seguinte ─────────────────────────────
--
-- 3.1 A medição do BLOCO 0 de novo, restrita ao que entrou depois do deploy.
--     Troque a data pela do deploy. Aceite: `duplicadas = 0` em `reminder`.
--
--     (`achievement` pode continuar duplicando: a causa dele é a atividade
--      processada 2x no webhook/sync, não o cron — tarefa própria.)

-- WITH pares AS (
--   SELECT type, created_at,
--          lag(created_at) OVER (PARTITION BY user_id, type, title ORDER BY created_at) AS ant
--     FROM notifications
--    WHERE created_at >= '2026-09-06'
-- )
-- SELECT type,
--        count(*) FILTER (WHERE ant IS NOT NULL AND created_at - ant < interval '5 seconds') AS duplicadas,
--        count(*) AS total
--   FROM pares GROUP BY type ORDER BY total DESC;

-- 3.2 As chaves estão realmente sendo gravadas? Se `com_chave` for 0 para
--     `reminder`/`system`, o cron não passou por `notifyOnce` — ou o deploy não
--     subiu, ou o job ainda não rodou.

-- SELECT type,
--        count(*) AS total,
--        count(dedupe_key) AS com_chave,
--        min(dedupe_key) AS exemplo
--   FROM notifications
--  WHERE created_at >= '2026-09-06'
--  GROUP BY type ORDER BY total DESC;
