-- Marca de exclusão de conta em andamento.
--
-- ── POR QUE UMA COLUNA, E NÃO SÓ UM JOB ──────────────────────────────────────
--
-- Excluir uma conta não cabe numa transação: antes de tocar no banco é preciso
-- remover a subscription no Google e revogar o grant OAuth, que são chamadas de
-- rede. Se o processo morrer entre a revogação e o `DELETE`, o usuário fica num
-- estado real e invisível — sem integração, com todos os dados.
--
-- `deletion_requested_at` torna esse estado VISÍVEL e o processo RETOMÁVEL:
-- quem lê a linha sabe que a exclusão começou, e o job pode rodar de novo do
-- início porque todos os passos anteriores ao `DELETE` final são idempotentes.
--
-- ── POR QUE ELA SOME SOZINHA ─────────────────────────────────────────────────
--
-- A coluna vive em `public.users`, que é apagada em cascata quando `auth.users`
-- é apagado — o último passo da exclusão. Ou seja: conta excluída não deixa
-- marca nenhuma, e marca que sobrou significa exclusão que não terminou. É
-- exatamente o sinal que se quer, sem estado extra para limpar depois.
--
-- ── O ÍNDICE ─────────────────────────────────────────────────────────────────
--
-- Parcial, e por isso barato: só indexa as linhas em exclusão, que são raras e
-- efêmeras. A consulta que ele serve é "que exclusões ficaram penduradas?",
-- feita por quem for investigar, não por caminho quente.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.deletion_requested_at IS
  'Quando o usuário pediu a exclusão da conta. NULL = conta normal. Preenchido = exclusão em andamento (ou que falhou no meio, e o job pode ser reprocessado — todos os passos antes do DELETE final são idempotentes). A coluna some junto com a linha quando a exclusão conclui, então marca remanescente É o alerta.';

CREATE INDEX IF NOT EXISTS idx_users_deletion_pending
  ON public.users (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ── VERIFICAÇÃO PÓS-APLICAÇÃO ───────────────────────────────────────────────
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'users'
--      and column_name = 'deletion_requested_at';
--
--   -- esperado: 1 linha, timestamp with time zone, YES
--
--   -- e o índice:
--   select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'users'
--      and indexname = 'idx_users_deletion_pending';
--
--   -- exclusões penduradas (deve ser 0 logo após aplicar):
--   select count(*) from public.users where deletion_requested_at is not null;
--
-- ── REVERT ───────────────────────────────────────────────────────────────────
--
-- **Sem DROP, de propósito.** Regra do projeto: coluna sem leitor é inerte;
-- derrubar coluna com código antigo no ar quebra toda leitura de `users`, que é
-- a tabela mais quente do app. Se a exclusão assíncrona for revertida, esta
-- migration FICA aplicada e a coluna simplesmente deixa de ser escrita.
