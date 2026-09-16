-- Estado da subscription do Google Health — sem isto a notificação do webhook
-- não tem como voltar a ser um usuário.
--
-- ── O QUE ISTO HABILITA ──────────────────────────────────────────────────────
--
-- A Fase 3 conectou o usuário ao Google (OAuth), mas ninguém avisa o RunEasy
-- quando aparece um treino novo. Quem avisa é uma *subscription*, criada com a
-- credencial de service account, uma por usuário, sob o subscriber do projeto.
--
-- O `subscriptionId` é ESCOLHIDO POR NÓS, e nós escolhemos o `user_id` do
-- RunEasy. É por isso que ele importa: a notificação do webhook devolve esse
-- valor em `clientProvidedSubscriptionName`, e é o único caminho de volta da
-- notificação até o usuário — sem ele seria preciso descobrir o `healthUserId`
-- do Google (uma chamada a mais, e um id que não queremos guardar espalhado).
-- Por isso o subscriber é `MANUAL` e não `AUTOMATIC`: em `AUTOMATIC` o Google
-- gera um nome opaco (`auto-<projeto>-<subscriber>-<TOKEN>`) que não carrega
-- nada nosso.
--
-- ── SEMÂNTICA ────────────────────────────────────────────────────────────────
--
-- `subscription_id` NULL = usuário conectado SEM subscription. Não é um erro:
-- é o estado de todo mundo que conectou na Fase 3, e é exatamente o que o
-- script retroativo (`gh:backfill-subscriptions`) procura para consertar
-- (`provider = 'google_health' AND subscription_id IS NULL`). Também é o estado
-- de quem conectou e a criação da subscription falhou — a conexão nunca cai por
-- causa disso, o retroativo recupera. Volta a NULL quando o usuário desconecta
-- e a subscription é removida no Google.
--
-- `subscription_created_at` = quando a subscription passou a existir no lado do
-- Google. Serve para reconciliar órfãs nos dois sentidos e para saber a partir
-- de quando era legítimo esperar notificação.
--
-- `last_sync_at` = cursor do backfill de dados (até onde já buscamos treinos
-- deste usuário). **Ainda não tem leitor**: entra agora porque esta migration é
-- aplicada à mão, e não vale uma segunda rodada de SQL Editor só por ela.
-- Coluna sem leitor é inerte.
--
-- ── ÍNDICE: DECIDIDO QUE NÃO ────────────────────────────────────────────────
--
-- O único acesso novo é o do retroativo:
--   WHERE provider = 'google_health' AND subscription_id IS NULL
-- `connected_devices` tem 4 linhas em produção e 0 em staging, e já existe
-- `idx_connected_devices_provider`. Nessa escala o planner faz seq scan de
-- qualquer jeito e um índice parcial seria só custo de escrita e de manutenção.
-- Se a tabela crescer uma ordem de grandeza, o índice certo é o PARCIAL
-- (deixado aqui como registro da decisão, NÃO criado agora):
--   create index concurrently if not exists idx_connected_devices_gh_pending_sub
--     on public.connected_devices (user_id)
--     where provider = 'google_health' and subscription_id is null;
--
-- Aditiva, tudo nullable. As RLS existentes de `connected_devices` são por
-- linha (`auth.uid() = user_id`), então já cobrem as colunas novas; o backend
-- usa service-role e passa pela policy `Service role full access`. O mobile
-- (anon key) enxerga as colunas novas na própria linha e não precisa delas.
-- Nenhum dado existente é tocado, nenhum lock longo: `ADD COLUMN` nullable sem
-- default é troca de catálogo, não reescreve a tabela.

ALTER TABLE public.connected_devices
  ADD COLUMN IF NOT EXISTS subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN public.connected_devices.subscription_id IS
  'ID da subscription no provedor, escolhido por nós — para o Google Health é o user_id do RunEasy, e volta em clientProvidedSubscriptionName na notificação do webhook (é o mapeamento de volta ao usuário). NULL = conectado sem subscription: estado de quem conectou na Fase 3 e alvo do script retroativo gh:backfill-subscriptions.';

COMMENT ON COLUMN public.connected_devices.subscription_created_at IS
  'Quando a subscription passou a existir no provedor. Usado para reconciliar subscriptions órfãs (existe no Google sem linha local, e vice-versa). NULL enquanto subscription_id for NULL.';

COMMENT ON COLUMN public.connected_devices.last_sync_at IS
  'Cursor do backfill: até quando já buscamos atividades deste dispositivo. Sem leitor no Commit C — entra junto para não exigir uma segunda aplicação manual de migration.';

-- ── VERIFICAÇÃO PÓS-APLICAÇÃO ───────────────────────────────────────────────
--
-- Deve devolver exatamente 3 linhas, todas com is_nullable = YES:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'connected_devices'
--      and column_name in ('subscription_id',
--                          'subscription_created_at',
--                          'last_sync_at')
--    order by column_name;
--
--   last_sync_at             | timestamp with time zone | YES
--   subscription_created_at  | timestamp with time zone | YES
--   subscription_id          | text                     | YES
--
-- E o estado inicial esperado (toda linha de google_health com subscription
-- pendente, que é o que o retroativo vai buscar):
--
--   select count(*) filter (where subscription_id is null) as pendentes,
--          count(*)                                        as total
--     from public.connected_devices
--    where provider = 'google_health';
--
-- ── REVERT ───────────────────────────────────────────────────────────────────
--
-- **Não existe revert por DROP, de propósito.** Regra do projeto: coluna sem
-- leitor é inerte e não custa nada; derrubar coluna com código antigo ainda no
-- ar é incidente (o backend deployado passaria a fazer SELECT de coluna
-- inexistente e toda leitura de `connected_devices` quebraria de uma vez).
-- Se o Commit C for revertido, esta migration FICA aplicada.
--
-- O que se desfaz, se for preciso desfazer, é o DADO — e só depois de remover
-- as subscriptions do lado do Google (`gh:backfill-subscriptions` no modo de
-- reconciliação, ou o DELETE da API). Zerar a coluna sem remover lá deixa
-- subscription órfã mandando notificação que o webhook não sabe mapear:
--
--   update public.connected_devices
--      set subscription_id = null,
--          subscription_created_at = null
--    where provider = 'google_health';
