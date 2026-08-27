-- ═══════════════════════════════════════════════════════════════════════════
-- Troca de Dias T.1 — VALIDAÇÃO EM STAGING
--
-- Não é migration (fica fora de `migrations/` porque o carregador dos testes
-- de integração executa todo `.sql` daquela pasta).
--
-- ── ORDEM ──────────────────────────────────────────────────────────────────
--   1. migrations/20260827_add_onboarding_patch_to_adaptation.sql
--   2. BLOCO 1 daqui  (leitura pura)
--   3. BLOCO 2 daqui  (funcional, dentro de transação revertida)
--
-- A migration derruba e recria `apply_plan_adaptation`. Ela traz assert próprio:
-- se sobrar mais de uma função (o DROP não pegou), ela LEVANTA EXCEPTION. Se
-- isso acontecer, PARE — o PostgREST poderia resolver a versão antiga, sem a
-- escrita de `user_onboarding`, e a Mina 4 continuaria aberta em silêncio.
--
-- ⚠️ Só STAGING. A T.0 também ainda não foi para produção.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — estrutural. Leitura pura. Todo `veredito` tem que ser ✅.
-- ═══════════════════════════════════════════════════════════════════════════

-- `to_regprocedure` e NÃO o cast `::regprocedure`: o cast LEVANTA ERRO quando a
-- função não existe, e o bloco inteiro morreria em vez de mostrar quais checks
-- falharam. Rodando ANTES da migration (a assinatura de 12 ainda não existe),
-- ou depois de uma migration que falhou no meio, é justamente quando este
-- diagnóstico importa. `to_regprocedure` devolve NULL e os checks viram ❌.
WITH fns AS (
  SELECT to_regprocedure(
           'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb,jsonb)'
         ) AS oid12,
         to_regprocedure(
           'public.apply_schedule_shift(uuid,uuid,uuid[],integer,date,text,text,uuid,jsonb)'
         ) AS oid_shift
),
fn AS (
  SELECT CASE WHEN oid12 IS NULL THEN NULL
              ELSE pg_get_functiondef(oid12) END AS src,
         oid12,
         oid_shift
    FROM fns
),
checks AS (
  -- O DROP pegou? Duas funções (11 e 12 params) significaria que o PostgREST
  -- pode chamar a antiga, sem `p_onboarding_patch`.
  SELECT 1 AS ord,
         'apply_plan_adaptation é ÚNICA' AS verifica,
         (SELECT count(*)::text FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation') AS obtido,
         '1' AS esperado

  UNION ALL SELECT 2,
         'e tem 12 parâmetros',
         (SELECT max(p.pronargs)::text FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'apply_plan_adaptation'),
         '12'

  UNION ALL SELECT 3,
         'escreve `user_onboarding` (a Mina 4)',
         (SELECT (src LIKE '%user_onboarding%')::text FROM fn),
         'true'

  -- As DUAS cópias: `responses_json` tem precedência na leitura, então sem o
  -- `jsonb_set` a escrita da coluna seria um no-op silencioso.
  UNION ALL SELECT 4,
         'grava também dentro de `responses_json`',
         (SELECT (src LIKE '%jsonb_set%responses_json%'
                  OR src LIKE '%jsonb_set(responses_json%')::text FROM fn),
         'true'

  -- Herdadas da T.0 — a assinatura nova não pode ter perdido nenhuma.
  UNION ALL SELECT 5,
         'guarda RE422 da T.0 ainda no corpo',
         (SELECT (src LIKE '%RE422%')::text FROM fn),
         'true'

  UNION ALL SELECT 6,
         '`swap_days` aceito pelo CHECK de kind',
         (SELECT (pg_get_constraintdef(oid) LIKE '%swap_days%')::text
            FROM pg_constraint
           WHERE conrelid = 'public.plan_adaptations'::regclass
             AND conname = 'plan_adaptations_kind_check'),
         'true'

  UNION ALL SELECT 7,
         'apply_schedule_shift INTACTA',
         (SELECT CASE WHEN oid_shift IS NULL THEN NULL
                      ELSE (pg_get_functiondef(oid_shift)
                            NOT LIKE '%user_onboarding%')::text END
            FROM fn),
         'true'

  -- `DROP` + `CREATE` cria função NOVA, que herda os DEFAULT PRIVILEGES do
  -- Supabase (EXECUTE para anon/authenticated). A migration repete os REVOKEs;
  -- este check é quem prova que eles pegaram.
  UNION ALL SELECT 8,
         'server-only: anon NÃO executa',
         (SELECT CASE WHEN oid12 IS NULL THEN NULL
                      ELSE has_function_privilege('anon', oid12, 'EXECUTE')::text
                 END FROM fn),
         'false'

  UNION ALL SELECT 9,
         'server-only: authenticated NÃO executa',
         (SELECT CASE WHEN oid12 IS NULL THEN NULL
                      ELSE has_function_privilege('authenticated', oid12, 'EXECUTE')::text
                 END FROM fn),
         'false'

  UNION ALL SELECT 10,
         'server-only: service_role executa',
         (SELECT CASE WHEN oid12 IS NULL THEN NULL
                      ELSE has_function_privilege('service_role', oid12, 'EXECUTE')::text
                 END FROM fn),
         'true'
)
SELECT verifica,
       esperado,
       obtido,
       CASE WHEN obtido IS NOT DISTINCT FROM esperado THEN '✅' ELSE '❌ FALHOU' END AS veredito
  FROM checks
 ORDER BY ord;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — funcional. A Mina 4 fechada, provada e desfeita.
--
-- Rode o bloco INTEIRO de uma vez, do `BEGIN;` ao `ROLLBACK;`. Ele escolhe
-- sozinho um treino futuro/pendente real, remapeia a data E grava dias novos,
-- mostra o antes/depois das DUAS cópias, e desfaz tudo.
--
-- ── POR QUE TRÊS STATEMENTS, E NÃO UM CTE ────────────────────────────────────
--
-- A versão anterior deste bloco chamava a função e lia o resultado no MESMO
-- statement, dentro de um CTE. Ela reportava `❌ FALHOU` mesmo com a função
-- funcionando — e o motivo não era a função.
--
-- Num único statement, TODOS os subselects enxergam o mesmo snapshot: o de
-- ANTES da execução. As escritas de uma função volátil chamada no meio do
-- statement não ficam visíveis para os irmãos dela. A leitura "depois" vinha
-- literalmente do estado anterior — sempre igual ao "antes", tivesse a função
-- escrito ou não.
--
-- Isso torna o teste inútil nas DUAS direções: ele não confirmaria uma escrita
-- que aconteceu, nem detectaria uma que não aconteceu.
--
-- A correção é separar em statements: a temp table captura o ANTES, a chamada
-- vai sozinha, e a leitura acontece num terceiro statement — que abre snapshot
-- novo e enxerga o que a função gravou. Tudo dentro da mesma transação, que é
-- revertida no fim.
--
-- ⚠️ Mesma armadilha no BLOCO 2 da T.0 (`T0-VERIFICACAO-staging.sql`): lá o
-- resultado esperado era "nada mudou", que é o que o snapshot velho mostra de
-- qualquer jeito. A conclusão da T.0 continua válida — quem provou foi o campo
-- `reason = new_date_in_past`, que vem do RETORNO da função e não de leitura —
-- mas a linha `data_agora` daquele bloco não era evidência de nada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. O alvo e o estado ANTES ──────────────────────────────────────────────
CREATE TEMP TABLE t1_prova ON COMMIT DROP AS
SELECT w.id                              AS workout_id,
       w.plan_id,
       w.user_id,
       w.scheduled_date                  AS data_antes,
       (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
       o.available_days                  AS dias_coluna_antes,
       o.responses_json->'available_days' AS dias_json_antes,
       (o.user_id IS NOT NULL)           AS tem_onboarding,
       NULL::jsonb                       AS res
  FROM public.workouts w
  JOIN public.training_plans p ON p.id = w.plan_id
  LEFT JOIN public.user_onboarding o ON o.user_id = w.user_id
 WHERE p.status = 'active'
   AND p.generation_status = 'complete'
   AND w.status = 'pending'
   AND w.scheduled_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date
   AND coalesce(w.is_race_day, false) = false
 ORDER BY w.scheduled_date
 LIMIT 1;

-- ── 2. A chamada, em statement PRÓPRIO ──────────────────────────────────────
UPDATE t1_prova t
   SET res = public.apply_plan_adaptation(
         p_user_id          => t.user_id,
         p_plan_id          => t.plan_id,
         p_today            => t.hoje,
         p_expected_digest  => public.plan_state_digest(t.plan_id, t.hoje),
         p_idempotency_key  => 't1-prova-' || gen_random_uuid()::text,
         p_kind             => 'swap_days',
         p_patch            => jsonb_build_array(jsonb_build_object(
                                 'workout_id', t.workout_id,
                                 'expected',   jsonb_build_object('status', 'pending'),
                                 'set',        jsonb_build_object(
                                                 'scheduled_date',
                                                 (t.data_antes + 1)::text))),
         p_invalidate_briefings => false,
         p_onboarding_patch => jsonb_build_object(
                                 'available_days', '[2,4,6]'::jsonb));

-- ── 3. A leitura e o veredito, em statement PRÓPRIO ─────────────────────────
SELECT t.res->>'applied'                AS applied,
       t.res->'affected'->>'workouts'   AS treinos_movidos,
       t.res->'affected'->>'briefings'  AS briefings_apagados,
       t.res->'affected'->>'onboarding' AS linhas_onboarding,
       t.data_antes,
       w.scheduled_date                 AS data_depois,
       t.dias_coluna_antes::text        AS dias_coluna_antes,
       o.available_days::text           AS dias_coluna_depois,
       t.dias_json_antes::text          AS dias_json_antes,
       (o.responses_json->'available_days')::text AS dias_json_depois,
       CASE
         WHEN t.res->>'applied' <> 'true'
           THEN '❌ a função recusou: ' || t.res::text
         WHEN w.scheduled_date <> t.data_antes + 1
           THEN '❌ a data NÃO foi remapeada'
         WHEN t.tem_onboarding AND o.available_days::text <> '[2, 4, 6]'
           THEN '❌ a COLUNA available_days não foi gravada'
         WHEN t.tem_onboarding
              AND t.dias_json_antes IS NOT NULL
              AND (o.responses_json->'available_days')::text <> '[2, 4, 6]'
           THEN '❌ `responses_json` não foi gravado — a cópia que TEM precedência'
         WHEN NOT t.tem_onboarding
           THEN '✅ data remapeada (usuário de teste sem linha de onboarding)'
         ELSE '✅ data remapeada E as duas cópias dos dias gravadas'
       END AS veredito
  FROM t1_prova t
  JOIN public.workouts w ON w.id = t.workout_id
  LEFT JOIN public.user_onboarding o ON o.user_id = t.user_id;

ROLLBACK;

-- ── COMO LER O BLOCO 2 ─────────────────────────────────────────────────────
--
--   applied            = true
--   treinos_movidos    = 1
--   briefings_apagados = 0              ← o briefing SOBREVIVE (só a data mudou)
--   linhas_onboarding  = 1
--   data_depois        = data_antes + 1
--   dias_coluna_depois = [2, 4, 6]
--   dias_json_depois   = [2, 4, 6]      ← a cópia com PRECEDÊNCIA na leitura;
--                                         se ela não mudar, a troca seria
--                                         desfeita sozinha no próximo plano
--
-- O `veredito` diz exatamente QUAL das quatro condições falhou, em vez de um
-- "❌" genérico — foi o que faltou na primeira versão deste bloco.
--
-- Zero linhas = staging não tem treino futuro pendente em plano ativo. O
-- BLOCO 1 sozinho já fecha a parte estrutural.
