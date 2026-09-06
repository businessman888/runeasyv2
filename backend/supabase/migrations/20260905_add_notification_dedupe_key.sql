-- Idempotência de notificação, no banco.
--
-- ── O QUE ISTO CONSERTA ──────────────────────────────────────────────────────
--
-- 97,5% dos lembretes de treino em produção são duplicados (4.038 de 4.140,
-- medido em 2026-09-05): cada corredor recebia "🏃 Hora do Treino!" duas vezes,
-- todo dia, desde 20/06/2026. A causa imediata era `ScheduleModule.forRoot()`
-- chamado duas vezes (dois exploradores registrando os mesmos @Cron), e isso foi
-- corrigido no código. Esta migration é a defesa que SOBREVIVE à causa: uma
-- segunda réplica no Railway — dois cliques — reintroduziria o sintoma sem
-- nenhum sinal no boot.
--
-- `weekly_insight` e `retrospective` escaparam do bug inteiro, e não por sorte:
-- os dois deduplicam no banco (SELECT + UNIQUE). Medição: 0 de 9 e 0 de 7.
-- Esta coluna generaliza a mesma defesa para quem não tem uma tabela própria
-- onde ancorá-la.
--
-- ── POR QUE O ÍNDICE NÃO É PARCIAL ───────────────────────────────────────────
--
-- O caminho natural seria `... WHERE dedupe_key IS NOT NULL`, já que
-- notificações request-driven ficam com a chave nula. Mas um índice PARCIAL não
-- pode ser inferido por `ON CONFLICT (dedupe_key) DO NOTHING` — o Postgres exige
-- que o predicado do índice seja dedutível da cláusula WHERE do INSERT, e o
-- PostgREST não emite WHERE nenhum no upsert. O resultado seria
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" em TODO insert com chave, ou seja: nenhuma notificação de cron
-- gravada.
--
-- Um índice UNIQUE comum resolve os dois lados: no Postgres, NULLs são distintos
-- entre si por padrão, então quantas linhas request-driven quiser convivem com
-- `dedupe_key = NULL`, e a inferência do ON CONFLICT funciona.

alter table public.notifications
  add column if not exists dedupe_key text;

comment on column public.notifications.dedupe_key is
  'Chave determinística de idempotência montada pelo produtor '
  '(ex.: reminder:<workout_id>:<YYYY-MM-DD>, daily_readiness:<user_id>:<YYYY-MM-DD>). '
  'NULL em notificações request-driven, que não precisam de guarda. '
  'Ver NotificationService.notifyOnce.';

create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key);

-- ── O ÍNDICE QUE FALTAVA ─────────────────────────────────────────────────────
--
-- `notifications` é a tabela que mais cresce (4.140 linhas hoje, e era esse o
-- caminho da duplicação) e tinha SÓ o índice de PK. Toda leitura do app é
-- `WHERE user_id = ? ORDER BY created_at DESC` (getUserNotifications) — sem este
-- índice, é seq scan + sort a cada abertura da tela de notificações.

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
