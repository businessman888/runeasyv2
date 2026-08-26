-- Troca de Dias T.0 — o `kind` novo em `plan_adaptations`.
--
-- Só o CHECK. Nada mais na tabela.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE UM `kind` PRÓPRIO, E NÃO REUSAR `schedule_shift`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `schedule_shift` existe e também mexe em datas, então a tentação de reusá-lo é
-- real — evitaria esta migration inteira. Foi descartado por dois motivos:
--
--   AUDITORIA. A tabela existe para responder "por que meu treino de quinta
--   mudou?". Uma troca de dias e uma re-âncora por reativação são eventos
--   diferentes, com causas diferentes; colapsá-las no mesmo rótulo apaga
--   exatamente a informação que a tabela foi criada para guardar.
--
--   DEDUPE. A 6.3 pergunta "esta ação já foi aplicada?" filtrando
--   `plan_adaptations` por `kind` (ver `resolveWeek`, em volume-relief.service).
--   Com os dois eventos sob o mesmo rótulo, uma re-âncora passaria a "contar"
--   como troca de dias — e vice-versa.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE UM `DO` BLOCK, E NÃO UM `ALTER … DROP CONSTRAINT IF EXISTS` SIMPLES
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O CHECK foi declarado INLINE na coluna (20260815_create_plan_adaptations.sql):
--
--     kind text NOT NULL CHECK (kind IN (...))
--
-- Constraint inline não tem nome no código-fonte — quem nomeia é o Postgres. A
-- convenção é `plan_adaptations_kind_check`, mas convenção não é garantia: basta
-- uma colisão de nome no momento da criação para o Postgres sufixar.
--
-- E o modo de falha é SILENCIOSO, que é o que torna isto perigoso:
--
--     ALTER TABLE ... DROP CONSTRAINT IF EXISTS plan_adaptations_kind_check;
--     ALTER TABLE ... ADD  CONSTRAINT plan_adaptations_kind_check CHECK (...);
--
-- Se o nome real fosse outro, o DROP não acha nada (e `IF EXISTS` não reclama),
-- o ADD cria a constraint nova, e a tabela fica com DUAS. Um INSERT precisa
-- passar em AMBAS — então `swap_days` continuaria rejeitado, pela constraint
-- antiga que ninguém derrubou, sem erro nenhum nesta migration. A T.1 quebraria
-- em runtime, longe daqui.
--
-- O bloco abaixo derruba por DEFINIÇÃO, não por nome: qualquer CHECK de
-- `plan_adaptations` cuja definição mencione `reduzir_frequencia` é a régua de
-- `kind`, tenha o nome que tiver. Depois confere que sobrou exatamente uma, e
-- FALHA ALTO se não sobrou — silêncio aqui é justamente o que se está evitando.
--
-- ── Idempotência ──────────────────────────────────────────────────────────────
--
-- Reexecutável sem erro: na segunda vez, o loop derruba a constraint que a
-- primeira criou e a recria idêntica. Isso importa porque o carregador de schema
-- dos testes de integração trata "objeto duplicado" como no-op E DEPOIS falha se
-- uma migration >= 20260815 tiver sido pulada por esse motivo (ver
-- `test/db/db.ts`). Um `ADD CONSTRAINT` que colidisse derrubaria o setup inteiro
-- da suíte.

DO $$
DECLARE
  v_conname text;
  v_dropped integer := 0;
  v_final   integer;
BEGIN
  -- ── 1. Derruba a régua de `kind`, seja qual for o nome dela ────────────────
  FOR v_conname IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.plan_adaptations'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%reduzir_frequencia%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.plan_adaptations DROP CONSTRAINT %I', v_conname);
    v_dropped := v_dropped + 1;
    RAISE NOTICE '[T.0] CHECK de kind derrubado: %', v_conname;
  END LOOP;

  IF v_dropped = 0 THEN
    RAISE NOTICE '[T.0] nenhum CHECK antigo de kind encontrado (reexecução?)';
  END IF;

  -- ── 2. A régua nova, com nome explícito ────────────────────────────────────
  --
  -- 'swap_days' — a Troca de Dias. Os outros quatro são exatamente os de
  -- 20260815, na mesma ordem, para o diff ficar legível.
  ALTER TABLE public.plan_adaptations
    ADD CONSTRAINT plan_adaptations_kind_check
    CHECK (kind IN ('reduzir_frequencia',
                    'reduzir_volume',
                    'schedule_shift',
                    'reprice',
                    'swap_days'));

  -- ── 3. Rede de segurança: exatamente UMA régua sobre `kind` ────────────────
  --
  -- Se sobrou mais de uma, alguma constraint antiga escapou do filtro do passo 1
  -- e continuaria rejeitando `swap_days` em silêncio. Falhar aqui é o ponto.
  SELECT count(*) INTO v_final
    FROM pg_constraint
   WHERE conrelid = 'public.plan_adaptations'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%kind%';

  IF v_final <> 1 THEN
    RAISE EXCEPTION
      '[T.0] esperava 1 CHECK sobre `kind`, encontrei %. Uma constraint antiga escapou e rejeitaria `swap_days` em silêncio.',
      v_final;
  END IF;
END;
$$;

COMMENT ON COLUMN public.plan_adaptations.kind IS
  'O QUE foi feito. reduzir_frequencia · reduzir_volume (6.2/6.3) · schedule_shift (re-âncora: adiar/repetir semana) · reprice (Fase 3, só pace) · swap_days (Troca de Dias: remapeia scheduled_date para outros dias da semana, mantendo a quantidade).';
