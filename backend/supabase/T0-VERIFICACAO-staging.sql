-- ═══════════════════════════════════════════════════════════════════════════
-- Troca de Dias T.0 — VALIDAÇÃO EM STAGING
--
-- Não é migration (fica fora de `migrations/` porque o carregador dos testes
-- de integração executa todo `.sql` daquela pasta).
--
-- ── ORDEM ──────────────────────────────────────────────────────────────────
--   1. migrations/20260826_add_swap_days_kind.sql
--   2. migrations/20260826_validate_new_scheduled_date.sql
--   3. BLOCO 1 daqui  (leitura pura)
--   4. BLOCO 2 daqui  (funcional, dentro de transação revertida)
--
-- A primeira migration emite NOTICE dizendo qual constraint derrubou — vale
-- olhar. Se ela levantar EXCEPTION reclamando de mais de um CHECK sobre
-- `kind`, PARE: uma régua antiga escapou e `swap_days` seria rejeitado em
-- silêncio.
--
-- ⚠️ Só STAGING. A T.0 não vai para produção até a T.1 estar validada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — estrutural. Leitura pura, não escreve nada.
-- Devolve uma tabela: todo `veredito` tem que ser ✅.
-- ═══════════════════════════════════════════════════════════════════════════

WITH fn AS (
  SELECT pg_get_functiondef(
           'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)'::regprocedure
         ) AS src
),
checks AS (
  SELECT 1 AS ord,
         'régua de `kind` é ÚNICA' AS verifica,
         (SELECT count(*)::text FROM pg_constraint
           WHERE conrelid = 'public.plan_adaptations'::regclass
             AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%kind%') AS obtido,
         '1' AS esperado

  UNION ALL SELECT 2,
         '`swap_days` aceito pelo CHECK',
         (SELECT (pg_get_constraintdef(oid) LIKE '%swap_days%')::text
            FROM pg_constraint
           WHERE conrelid = 'public.plan_adaptations'::regclass
             AND conname = 'plan_adaptations_kind_check'),
         'true'

  UNION ALL SELECT 3,
         'guarda RE422 no corpo da função',
         (SELECT (src LIKE '%RE422%')::text FROM fn),
         'true'

  UNION ALL SELECT 4,
         'reason `new_date_in_past` presente',
         (SELECT (src LIKE '%new_date_in_past%')::text FROM fn),
         'true'

  -- Se a assinatura tivesse mudado, `CREATE OR REPLACE` criaria uma SEGUNDA
  -- função em vez de substituir — e o PostgREST poderia chamar a antiga.
  UNION ALL SELECT 5,
         'apply_plan_adaptation SEM sobrecarga',
         (SELECT count(*)::text FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation'),
         '1'

  -- A T.0 é cirúrgica: a re-âncora é função SEPARADA e não foi tocada.
  UNION ALL SELECT 6,
         'apply_schedule_shift INTACTA (sem RE422)',
         (SELECT (pg_get_functiondef(
                    'public.apply_schedule_shift(uuid,uuid,uuid[],integer,date,text,text,uuid,jsonb)'::regprocedure
                  ) NOT LIKE '%RE422%')::text),
         'true'

  UNION ALL SELECT 7,
         'service_role executa',
         has_function_privilege('service_role',
           'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
           'EXECUTE')::text,
         'true'
)
SELECT verifica,
       esperado,
       obtido,
       CASE WHEN obtido IS NOT DISTINCT FROM esperado THEN '✅' ELSE '❌ FALHOU' END AS veredito
  FROM checks
 ORDER BY ord;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1b — DIAGNÓSTICO. Não faz parte da T.0 e não a bloqueia.
--
-- Achado da varredura: `anon` e `authenticated` têm EXECUTE nas quatro funções
-- da fundação, apesar do `REVOKE … FROM public` da 20260815 — o Supabase
-- concede por DEFAULT PRIVILEGES, e revogar de `PUBLIC` não remove grant
-- explícito. Hoje é inofensivo (funções SECURITY INVOKER + RLS ligada sem
-- políticas em `workouts`/`training_plans` = nega tudo), mas vira porta aberta
-- no dia em que alguém adicionar a primeira política de leitura.
--
-- Corrigido por `migrations/20260826_revoke_foundation_fns_from_data_api.sql`,
-- que é DECISÃO À PARTE. Sem ela: `alcancavel_por` mostra anon/authenticated.
-- Com ela: `(ninguém)`.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT split_part(fn, '(', 1) AS funcao,
       coalesce(
         nullif(concat_ws(', ',
           CASE WHEN has_function_privilege('anon', fn, 'EXECUTE')
                THEN 'anon' END,
           CASE WHEN has_function_privilege('authenticated', fn, 'EXECUTE')
                THEN 'authenticated' END), ''),
         '(ninguém) ✅') AS alcancavel_por
  FROM unnest(ARRAY[
    'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
    'public.apply_schedule_shift(uuid,uuid,uuid[],integer,date,text,text,uuid,jsonb)',
    'public.plan_editable_workouts(uuid,date)',
    'public.plan_state_digest(uuid,date)'
  ]) AS fn;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — funcional. A prova de que a guarda REALMENTE recusa.
--
-- Rode o bloco INTEIRO de uma vez (BEGIN … ROLLBACK). Ele escolhe sozinho um
-- treino futuro/pendente real, tenta movê-lo para ONTEM, e desfaz tudo.
--
-- ── POR QUE O ROLLBACK, se a guarda deveria impedir a escrita ───────────────
--
-- Justamente porque é isso que está sendo testado. Se a migration não tiver
-- pegado, esta chamada MOVE um treino de verdade para o passado — o dano que a
-- T.0 existe para impedir. O ROLLBACK garante que o teste não cause aquilo que
-- ele está verificando.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

WITH alvo AS (
  SELECT w.id, w.plan_id, w.user_id, w.scheduled_date AS data_antes,
         (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
    FROM public.workouts w
    JOIN public.training_plans p ON p.id = w.plan_id
   WHERE p.status = 'active'
     AND p.generation_status = 'complete'
     AND w.status = 'pending'
     AND w.scheduled_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND coalesce(w.is_race_day, false) = false
   ORDER BY w.scheduled_date
   LIMIT 1
),
chamada AS (
  SELECT a.*,
         public.apply_plan_adaptation(
           p_user_id         => a.user_id,
           p_plan_id         => a.plan_id,
           p_today           => a.hoje,
           p_expected_digest => public.plan_state_digest(a.plan_id, a.hoje),
           p_idempotency_key => 't0-prova-' || gen_random_uuid()::text,
           p_kind            => 'swap_days',
           p_patch           => jsonb_build_array(jsonb_build_object(
                                  'workout_id', a.id,
                                  'expected',   jsonb_build_object('status', 'pending'),
                                  'set',        jsonb_build_object(
                                                  'scheduled_date',
                                                  (a.hoje - 1)::text)))
         ) AS res
    FROM alvo a
)
SELECT c.data_antes                                    AS estava_em,
       (c.hoje - 1)                                    AS tentou_mover_para,
       c.res->>'applied'                               AS applied,
       c.res->>'reason'                                AS reason,
       coalesce(c.res->>'current_digest', '(ausente)') AS current_digest,
       (SELECT w.scheduled_date FROM public.workouts w WHERE w.id = c.id) AS data_agora,
       CASE
         WHEN c.res->>'reason' = 'new_date_in_past'
          AND c.res->>'current_digest' IS NULL
          AND (SELECT w.scheduled_date FROM public.workouts w WHERE w.id = c.id)
              = c.data_antes
         THEN '✅ guarda recusou e não escreveu'
         ELSE '❌ FALHOU — ver detalhe: ' || c.res::text
       END AS veredito
  FROM chamada c;

ROLLBACK;

-- ── COMO LER O BLOCO 2 ─────────────────────────────────────────────────────
--
--   applied            = false
--   reason             = new_date_in_past
--   current_digest     = (ausente)      ← a recusa NÃO é retentável, por desenho
--   data_agora         = estava_em      ← nada foi escrito
--
-- Zero linhas no BLOCO 2 significa que staging não tem nenhum treino futuro
-- pendente em plano ativo — não é falha, só não há o que testar. Nesse caso o
-- BLOCO 1 já basta para fechar a T.0.
