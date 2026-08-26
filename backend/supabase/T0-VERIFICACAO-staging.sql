-- ═══════════════════════════════════════════════════════════════════════════
-- Troca de Dias T.0 — o que rodar no SQL Editor de STAGING
--
-- Este arquivo NÃO é uma migration (o prefixo `_` o mantém fora da ordem
-- alfabética que o carregador de testes segue). É o roteiro manual.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 0 — ANTES de aplicar qualquer coisa: fotografar o estado
-- ───────────────────────────────────────────────────────────────────────────
--
-- (a) O `schema_producao.sql` do repo está DESATUALIZADO — não contém
--     `plan_adaptations`, `plan_vdot_history` nem `plan_week_insights`. Nada
--     nele serve de prova sobre constraints atuais.
--
-- (b) A pergunta do `UNIQUE (plan_id, scheduled_date)` NÃO afeta a T.0. Ela
--     decide o desenho da T.1: se a constraint existir, um remapeamento que
--     colocasse dois treinos no mesmo dia estouraria no banco, e a validação
--     de destino da T.1 tem que impedir a colisão ANTES de chegar lá.

-- Índices e constraints de `workouts` — procure por UNIQUE em
-- (plan_id, scheduled_date):
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'workouts'
 ORDER BY indexname;

SELECT conname, contype, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.workouts'::regclass
 ORDER BY contype, conname;

-- O nome REAL do CHECK de `kind` antes da migration. A migration derruba por
-- DEFINIÇÃO e não por nome justamente porque este nome não é garantido — mas
-- vale registrar qual era:
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.plan_adaptations'::regclass
   AND contype = 'c';


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Aplicar as migrations, NESTA ORDEM
-- ───────────────────────────────────────────────────────────────────────────
--
--   1. 20260826_add_swap_days_kind.sql
--   2. 20260826_validate_new_scheduled_date.sql
--
-- A ordem importa pouco (são independentes), mas manter a alfabética evita
-- divergência entre staging e o que o carregador de testes faz.
--
-- A primeira emite `NOTICE` dizendo qual constraint derrubou — vale olhar a
-- aba de mensagens. Se ela levantar EXCEPTION reclamando de mais de um CHECK
-- sobre `kind`, PARE: significa que uma constraint antiga escapou do filtro e
-- `swap_days` seria rejeitado em silêncio.


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Verificar que pegou
-- ───────────────────────────────────────────────────────────────────────────

-- (a) A régua de `kind`: tem que ser UMA só, com os cinco valores.
SELECT conname,
       pg_get_constraintdef(oid) AS def,
       count(*) OVER () AS quantas_reguas
  FROM pg_constraint
 WHERE conrelid = 'public.plan_adaptations'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) LIKE '%kind%';
-- ESPERADO: 1 linha · quantas_reguas = 1 · def contendo 'swap_days'

-- (b) A guarda está no corpo da função?
SELECT pg_get_functiondef(
         'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)'::regprocedure
       ) LIKE '%RE422%' AS guarda_ativa,
       pg_get_functiondef(
         'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)'::regprocedure
       ) LIKE '%new_date_in_past%' AS reason_presente;
-- ESPERADO: t · t

-- (c) Não nasceu uma SOBRECARGA por engano. `CREATE OR REPLACE` com assinatura
--     idêntica substitui; com assinatura diferente CRIA UMA SEGUNDA função, e
--     aí o PostgREST poderia chamar a antiga.
SELECT count(*) AS quantas_funcoes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation';
-- ESPERADO: 1

-- (d) Os grants server-only continuam de pé.
SELECT has_function_privilege(
         'service_role',
         'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
         'EXECUTE') AS service_role_executa,
       has_function_privilege(
         'anon',
         'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
         'EXECUTE') AS anon_executa;
-- ESPERADO: t · f


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Prova funcional em staging (opcional, mas é o teste de verdade)
-- ───────────────────────────────────────────────────────────────────────────
--
-- Contra um plano ATIVO de um usuário de teste. Troque os literais e rode.
-- É uma chamada de FUNÇÃO com data no passado: ela deve RECUSAR sem escrever.
--
--   SELECT public.apply_plan_adaptation(
--     p_user_id         => '<uuid do usuário de teste>',
--     p_plan_id         => '<uuid do plano ativo>',
--     p_today           => '<hoje em São Paulo, YYYY-MM-DD>',
--     p_expected_digest => public.plan_state_digest('<plano>', '<hoje>'),
--     p_idempotency_key => 't0-prova-' || gen_random_uuid()::text,
--     p_kind            => 'swap_days',
--     p_patch           => jsonb_build_array(jsonb_build_object(
--                            'workout_id', '<uuid de um treino FUTURO pending>',
--                            'expected',   jsonb_build_object('status','pending'),
--                            'set',        jsonb_build_object('scheduled_date','<ONTEM>')))
--   );
--
-- ESPERADO:
--   {"applied": false, "reason": "new_date_in_past", "detail": "new_date_in_past:… -> …"}
--   SEM `current_digest` — a recusa não é retentável.
--
-- E o treino continua na data original: confira com
--   SELECT scheduled_date FROM public.workouts WHERE id = '<uuid>';
--
-- ⚠️ Nenhum dos passos acima em PRODUÇÃO. A T.0 é staging-only até a T.1
-- estar pronta e validada.
