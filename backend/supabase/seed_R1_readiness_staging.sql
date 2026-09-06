-- =============================================================================
-- R.1 — SEED DE STAGING PARA O MOTOR DE PRONTIDÃO
-- =============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------------------------------------------------------
-- A R.1 substitui o ACWR terceirizado a um LLM por um motor determinístico
-- (EWMA desacoplada + baseline do subjetivo + piso de ~14 dias). Provar que o
-- motor novo deixou de ser ruído exige HISTÓRICO — e produção inteira tem, hoje,
-- 14 atividades, 2 usuários e 7 check-ins de UM único corredor (medido em
-- 2026-09-05). Nenhum caso do desenho é observável com esse dado: ninguém tem 14
-- dias de histórico, ninguém voltou de férias, e não há dois corredores com
-- baselines diferentes para o "desvio do baseline" significar alguma coisa.
--
-- Este seed cria cinco corredores sintéticos que cobrem, cada um, um caso que o
-- motor precisa acertar. É FIXTURE DE TESTE, não dado de produto.
--
-- ⚠️ RODAR SOMENTE EM STAGING (gcaozgnevvmnlxnkfthh). Há duas travas no BLOCO 0.
--
-- COMO RODAR (SQL Editor do Supabase, staging)
-- ---------------------------------------------------------------------------
--   1. Digite ESTA linha no topo do editor, ACIMA do arquivo colado:
--
--          SET app.r1_seed = 'staging';
--
--      Ela não está no arquivo de propósito: é a trava que exige que alguém
--      tenha olhado para qual aba do Supabase está aberta.
--   2. Cole este arquivo INTEIRO logo abaixo e rode tudo junto.
--   3. O bloco final imprime o resumo do que entrou.
--   4. Para limpar: `cleanup_R1_readiness_staging.sql` (um DELETE, cascata faz
--      o resto).
--
-- O SQL Editor roda como `postgres`, que ignora RLS — por isso os INSERTs
-- passam sem policy nenhuma. Pelo mesmo motivo, não rode isto por um client
-- com a chave `anon`.
--
-- IDEMPOTÊNCIA
-- ---------------------------------------------------------------------------
-- Por construção: o BLOCO 1 apaga tudo que este seed cria antes de recriar. As
-- datas são relativas a HOJE em São Paulo, então rodar de novo amanhã produz um
-- histórico deslocado em um dia — que é o comportamento desejado (o seed
-- envelhece junto com o calendário).
--
-- MARCAÇÃO / LIMPEZA
-- ---------------------------------------------------------------------------
--   auth.users.email        r1-seed-<persona>@runeasy.test
--   activities.external_id  r1seed:<persona>:<k>      (UNIQUE em produção)
--   activities.name         [R1-SEED] ...
-- `public.users.id` tem FK para `auth.users(id) ON DELETE CASCADE`, e
-- activities/workouts/training_plans/readiness_history têm FK para
-- `public.users(id) ON DELETE CASCADE`. Apagar as 5 linhas de `auth.users`
-- remove TODO o resto — não há órfão possível.
--
-- =============================================================================

BEGIN;

-- ── BLOCO 0 — travas ────────────────────────────────────────────────────────
-- Duas, e de naturezas diferentes de propósito: a primeira exige INTENÇÃO
-- explícita (você teve de digitar "staging"), a segunda checa um FATO do banco.
-- Uma sozinha não basta: intenção erra de aba, e fato envelhece.

DO $$
BEGIN
  IF coalesce(current_setting('app.r1_seed', true), '') <> 'staging' THEN
    RAISE EXCEPTION
      'TRAVA 1: digite `SET app.r1_seed = ''staging'';` acima deste arquivo e rode tudo junto.';
  END IF;

  -- O corredor real de produção. Se ele existe aqui, isto NÃO é staging.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = 'c40efbbd-d792-4561-ad15-0ecc0d9fda84') THEN
    RAISE EXCEPTION
      'TRAVA 2: usuário de PRODUÇÃO encontrado. Este seed nunca roda em produção.';
  END IF;
END $$;

-- ── BLOCO 1 — limpeza do que este seed criou (idempotência) ─────────────────

DELETE FROM auth.users WHERE email LIKE 'r1-seed-%@runeasy.test';

-- ── BLOCO 2 — os cinco corredores ───────────────────────────────────────────
--
-- O trigger `on_auth_user_created` cria a linha em `public.users` sozinho
-- (onboarding_completed=false, subscription_plan='free'); o UPDATE seguinte
-- ajusta o que o teste precisa.
--
--   novato       6 dias de histórico  → PISO: o motor deve dizer "ainda
--                                       aprendendo" e o progresso que falta,
--                                       não um veredito.
--   consistente  42 dias, 4x/semana   → EWMA em regime: agudo ≈ crônico.
--                                       Baseline subjetivo BAIXO e estável
--                                       (dorme mal e sempre dormiu).
--   ferias       30 dias treinando,
--                21 dias de nada,
--                5 dias de volta      → o caso que o roadmap nomeia: crônico
--                                       despencou. Baseline subjetivo ALTO.
--   rampa        28 dias leves +
--                7 dias de pico       → carga aguda genuinamente alta. É o
--                                       ÚNICO que deveria acionar a modulação
--                                       por carga.
--   esparso      40 dias, 5 corridas  → buracos: distingue "0 = descansou" de
--                                       "sem dado". FREE de propósito, para o
--                                       Pro-gate do backend ter contraprova.

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous, raw_user_meta_data)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'r1-seed-novato@runeasy.test',      false, false, '{"full_name":"R1 Novato"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'r1-seed-consistente@runeasy.test', false, false, '{"full_name":"R1 Consistente"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'r1-seed-ferias@runeasy.test',      false, false, '{"full_name":"R1 Ferias"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000004', 'r1-seed-rampa@runeasy.test',       false, false, '{"full_name":"R1 Rampa"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000005', 'r1-seed-esparso@runeasy.test',     false, false, '{"full_name":"R1 Esparso"}'::jsonb);

UPDATE public.users
   SET onboarding_completed = true,
       subscription_plan    = CASE WHEN id = 'a1000000-0000-4000-8000-000000000005'
                                   THEN 'free' ELSE 'pro' END,
       subscription_status  = 'active',
       subscription_started_at = now() - interval '90 days',
       profile = coalesce(profile, '{}'::jsonb) || '{"r1_seed": true}'::jsonb
 WHERE id::text LIKE 'a1000000-0000-4000-8000-%';

-- ── BLOCO 3 — o calendário de carga ─────────────────────────────────────────
--
-- `k` = dias ATRÁS de hoje (São Paulo). k=1 é ontem; k=0 (hoje) fica de fora de
-- propósito: o desbloqueio on-read pergunta "treinou num dia ANTERIOR a hoje?",
-- e um treino de hoje mascararia esse teste.
--
-- Cada linha vira UMA activity às 07:00 SP. `moving_time` é a fonte de carga da
-- R.1 (duração ponderada por tipo), então ele é o número que importa aqui —
-- `distance` acompanha de forma coerente só para o resto do app não estranhar.

CREATE TEMP TABLE r1_plano ON COMMIT DROP AS
WITH k AS (SELECT generate_series(1, 60) AS k)

-- consistente: k de 1 a 42, treina quando k%7 ∈ {0,1,3,5} → 4 dias/semana
SELECT 'consistente'::text AS persona, k,
       CASE k%7 WHEN 0 THEN 13.0 WHEN 1 THEN 7.0 WHEN 3 THEN 6.5 ELSE 7.0 END AS km,
       CASE k%7 WHEN 0 THEN 4500  WHEN 1 THEN 2400 WHEN 3 THEN 2100 ELSE 2400 END AS seg,
       CASE k%7 WHEN 0 THEN 'long_run' WHEN 3 THEN 'tempo' ELSE 'easy_run' END AS wtype
  FROM k WHERE k <= 42 AND k%7 IN (0,1,3,5)

UNION ALL
-- ferias: BLOCO A, k 27..56, treinando forte 4x/semana
SELECT 'ferias', k,
       CASE k%7 WHEN 0 THEN 15.0 WHEN 1 THEN 8.0 WHEN 3 THEN 7.0 ELSE 8.0 END,
       CASE k%7 WHEN 0 THEN 5400  WHEN 1 THEN 2700 WHEN 3 THEN 2250 ELSE 2700 END,
       CASE k%7 WHEN 0 THEN 'long_run' WHEN 3 THEN 'intervals' ELSE 'easy_run' END
  FROM k WHERE k BETWEEN 27 AND 56 AND k%7 IN (0,1,3,5)
UNION ALL
-- ferias: BLOCO B, k 6..26 → NADA (21 dias de silêncio; ausência é o dado)
-- ferias: BLOCO C, k 1..5 → volta no volume de antes, 3 sessões
SELECT 'ferias', k,
       CASE k WHEN 5 THEN 8.0 WHEN 3 THEN 8.0 ELSE 15.0 END,
       CASE k WHEN 5 THEN 2700 WHEN 3 THEN 2700 ELSE 5400 END,
       CASE k WHEN 1 THEN 'long_run' ELSE 'easy_run' END
  FROM k WHERE k IN (1,3,5)

UNION ALL
-- rampa: base leve 3x/semana, k 8..35
SELECT 'rampa', k, 5.0, 1800, 'easy_run'
  FROM k WHERE k BETWEEN 8 AND 35 AND k%7 IN (0,2,4)
UNION ALL
-- rampa: pico, k 1..7 — 6 sessões longas na última semana
SELECT 'rampa', k,
       CASE WHEN k%2 = 1 THEN 12.0 ELSE 10.0 END,
       CASE WHEN k%2 = 1 THEN 4200 ELSE 3600 END,
       CASE k WHEN 1 THEN 'long_run' WHEN 4 THEN 'intervals' ELSE 'easy_run' END
  FROM k WHERE k BETWEEN 1 AND 7 AND k <> 6

UNION ALL
-- novato: 3 corridas curtas em 6 dias. Abaixo do piso por TODA medida
-- (span=6 dias, 3 dias com dado).
SELECT 'novato', k, 3.0, 1200, 'easy_run' FROM k WHERE k IN (2,4,6)

UNION ALL
-- esparso: 5 corridas espalhadas em 40 dias. Os buracos são o teste.
SELECT 'esparso', k, 6.0, 2400, 'free_run' FROM k WHERE k IN (2,9,17,29,38);

-- ── BLOCO 4 — activities ────────────────────────────────────────────────────
--
-- 07:00 em São Paulo, convertido para timestamptz pelo próprio Postgres —
-- `AT TIME ZONE` resolve o offset sem a aritmética manual de -3h que o backend
-- ainda faz em quatro lugares.

INSERT INTO activities (
  user_id, name, type, source, environment,
  distance, moving_time, elapsed_time, average_pace, start_date, external_id, created_at
)
SELECT
  ('a1000000-0000-4000-8000-00000000000' ||
     CASE p.persona WHEN 'novato' THEN '1' WHEN 'consistente' THEN '2'
                    WHEN 'ferias' THEN '3' WHEN 'rampa'       THEN '4'
                    ELSE '5' END)::uuid,
  '[R1-SEED] ' || p.persona || ' D-' || p.k,
  'Run', 'phone', 'outdoor',
  p.km * 1000,
  p.seg,
  p.seg,
  round((p.seg / p.km)::numeric, 3),
  (((now() AT TIME ZONE 'America/Sao_Paulo')::date - p.k)::timestamp + time '07:00')
    AT TIME ZONE 'America/Sao_Paulo',
  'r1seed:' || p.persona || ':' || p.k,
  now()
FROM r1_plano p;

-- ── BLOCO 5 — training_plans + workouts ─────────────────────────────────────
--
-- ⚠️ ISTO NÃO É DECORAÇÃO. A ponderação por tipo de treino é a decisão 1 da
-- R.1, e `activities` NÃO TEM tipo de treino: `activities.type` vale 'Run' em
-- 100% das linhas de produção. O tipo só existe em `workouts`, e o vínculo
-- vivo é `workouts.activity_id` → `activities.id` — NÃO o contrário:
-- `activities.workout_id` está NULL em 14 de 14 linhas de produção (medido).
-- Sem estas linhas o seed não exercitaria a ponderação de jeito nenhum.
--
-- `esparso` fica com `plan_id NULL` e `source='free'`, que é como nascem a
-- corrida livre e o treino manual — e é a metade do universo que um filtro por
-- plano ativo mataria.
--
-- `novato` fica SEM workout nenhum: atividade órfã, para o motor ter de decidir
-- o peso de uma corrida sem tipo conhecido.

INSERT INTO training_plans (id, user_id, goal, goal_type, status, frequency_per_week, duration_weeks, generation_status, created_at)
VALUES
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '10k', 'distance', 'active', 4, 12, 'complete', now() - interval '45 days'),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', '21k', 'distance', 'active', 4, 16, 'complete', now() - interval '60 days'),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', '10k', 'distance', 'active', 4, 12, 'complete', now() - interval '40 days');

INSERT INTO workouts (
  plan_id, user_id, type, objective, status, source, environment,
  scheduled_date, distance_km, distance_run, time_run_seconds,
  pace_seconds_per_km, activity_id, completed_at, created_at
)
SELECT
  CASE p.persona WHEN 'consistente' THEN 'b1000000-0000-4000-8000-000000000002'::uuid
                 WHEN 'ferias'      THEN 'b1000000-0000-4000-8000-000000000003'::uuid
                 WHEN 'rampa'       THEN 'b1000000-0000-4000-8000-000000000004'::uuid
                 ELSE NULL END,
  a.user_id,
  p.wtype,
  '[R1-SEED] ' || p.wtype,
  'completed',
  CASE WHEN p.persona = 'esparso' THEN 'free' ELSE 'plan' END,
  'outdoor',
  (a.start_date AT TIME ZONE 'America/Sao_Paulo')::date,
  p.km, p.km, p.seg,
  round((p.seg / p.km)::numeric, 3),
  a.id,
  a.start_date,
  now()
FROM r1_plano p
JOIN activities a ON a.external_id = 'r1seed:' || p.persona || ':' || p.k
WHERE p.persona <> 'novato';   -- novato fica órfão de propósito

-- ── BLOCO 6 — readiness_history (o baseline do subjetivo) ───────────────────
--
-- O PONTO INTEIRO DESTE BLOCO: `consistente` e `ferias` respondem coisas
-- DIFERENTES e ambos são normais PARA ELES.
--
--   consistente  vive em sleep≈3, legs≈3 — dorme mal e sempre dormiu.
--   ferias       vive em sleep≈5, legs≈5 — dorme bem.
--
-- No último check-in (k=1) os dois convergem para 4. Na régua ABSOLUTA de hoje
-- os dois recebem o mesmo veredito. Na régua do DESVIO, `consistente` está
-- ACIMA do seu normal (+1) e `ferias` está ABAIXO do dele (−1) — sinais
-- opostos. Se o motor novo não separar esses dois casos, o baseline não está
-- fazendo nada, e este seed é a prova.
--
-- `set_number` circula 1..40 por usuário para não brigar com a lógica de
-- exclusão de `getQuestionSetForUser`.

INSERT INTO readiness_history (
  user_id, score, status_color, status_label, check_in_answers,
  ai_analysis, metrics_summary, set_number, created_at
)
SELECT
  r.uid, r.score,
  CASE WHEN r.score >= 70 THEN 'green' WHEN r.score >= 40 THEN 'yellow' ELSE 'red' END,
  '[R1-SEED] histórico sintético',
  r.answers,
  jsonb_build_object('headline', '[R1-SEED]', 'reasoning', 'linha sintética do seed da R.1',
                     'plan_adjustment', '-', 'source', 'r1-seed'),
  '[]'::jsonb,
  ((row_number() OVER (PARTITION BY r.uid ORDER BY r.k DESC) - 1) % 40) + 1,
  (((now() AT TIME ZONE 'America/Sao_Paulo')::date - r.k)::timestamp + time '08:30')
    AT TIME ZONE 'America/Sao_Paulo'
FROM (
  SELECT uid, k,
         answers,
         round((( (answers->>'sleep')::int + (answers->>'legs')::int + (answers->>'mood')::int
                + (answers->>'stress')::int + (answers->>'motivation')::int ) / 5.0) * 20)::int AS score
  FROM (
    -- consistente — baseline BAIXO e estável, 21 check-ins (k par, 2..42)
    SELECT 'a1000000-0000-4000-8000-000000000002'::uuid AS uid, k,
           jsonb_build_object(
             'sleep',      3 + ((k*7) % 3) - 1,
             'legs',       3 + ((k*5) % 3) - 1,
             'mood',       4 + ((k*3) % 2) - 1,
             'stress',     3 + ((k*11) % 3) - 1,
             'motivation', 4 + ((k*13) % 2) - 1) AS answers
      FROM generate_series(2, 42, 2) AS k
    UNION ALL
    SELECT 'a1000000-0000-4000-8000-000000000002', 1,
           '{"sleep":4,"legs":4,"mood":4,"stress":4,"motivation":4}'::jsonb

    UNION ALL
    -- ferias — baseline ALTO, 15 check-ins no bloco de treino + 1 na volta
    SELECT 'a1000000-0000-4000-8000-000000000003', k,
           jsonb_build_object(
             'sleep',      5 - ((k*7) % 2),
             'legs',       5 - ((k*5) % 2),
             'mood',       5 - ((k*3) % 2),
             'stress',     4 + ((k*11) % 2),
             'motivation', 5 - ((k*13) % 2))
      FROM generate_series(28, 56, 2) AS k
    UNION ALL
    SELECT 'a1000000-0000-4000-8000-000000000003', 1,
           '{"sleep":4,"legs":4,"mood":4,"stress":4,"motivation":4}'::jsonb

    UNION ALL
    -- rampa — baseline médio, 12 check-ins
    SELECT 'a1000000-0000-4000-8000-000000000004', k,
           jsonb_build_object(
             'sleep',      4 - ((k*7) % 2),
             'legs',       4 - ((k*5) % 2),
             'mood',       4,
             'stress',     3 + ((k*11) % 2),
             'motivation', 4)
      FROM generate_series(1, 35, 3) AS k

    UNION ALL
    -- novato — 2 check-ins: NÃO dá baseline, e é isso que tem de ser detectado
    SELECT 'a1000000-0000-4000-8000-000000000001', k,
           '{"sleep":4,"legs":3,"mood":4,"stress":3,"motivation":5}'::jsonb
      FROM (VALUES (2), (5)) AS v(k)

    UNION ALL
    -- esparso — 3 check-ins em 40 dias, buracos enormes entre eles
    SELECT 'a1000000-0000-4000-8000-000000000005', k,
           '{"sleep":3,"legs":4,"mood":3,"stress":2,"motivation":3}'::jsonb
      FROM (VALUES (3), (18), (36)) AS v(k)
  ) base
) r;

-- ── BLOCO 7 — resumo do que entrou ──────────────────────────────────────────

SELECT
  u.email,
  u.subscription_plan                                        AS plano,
  count(DISTINCT a.id)                                       AS atividades,
  count(DISTINCT (a.start_date AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_com_corrida,
  max((now() AT TIME ZONE 'America/Sao_Paulo')::date
        - (a.start_date AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_desde_o_1o,
  min((now() AT TIME ZONE 'America/Sao_Paulo')::date
        - (a.start_date AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_desde_o_ultimo,
  round(sum(a.moving_time)::numeric / 60, 0)                 AS minutos_totais,
  count(DISTINCT w.id)                                       AS workouts_ligados,
  (SELECT count(*) FROM readiness_history rh WHERE rh.user_id = u.id) AS check_ins
FROM public.users u
LEFT JOIN activities a ON a.user_id = u.id
LEFT JOIN workouts   w ON w.activity_id = a.id
WHERE u.email LIKE 'r1-seed-%@runeasy.test'
GROUP BY u.id, u.email, u.subscription_plan
ORDER BY u.email;

COMMIT;
