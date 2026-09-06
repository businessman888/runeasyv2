-- =============================================================================
-- R.1 — LIMPEZA DO SEED DE STAGING
-- =============================================================================
--
-- Remove tudo que `seed_R1_readiness_staging.sql` criou. Um DELETE basta:
-- `public.users.id` referencia `auth.users(id) ON DELETE CASCADE`, e
-- activities / workouts / training_plans / readiness_history referenciam
-- `public.users(id) ON DELETE CASCADE`. Apagar as 5 linhas de `auth.users`
-- derruba a cadeia inteira — não sobra órfão.
--
-- ⚠️ SOMENTE STAGING. O filtro é o domínio `@runeasy.test`, que não existe em
-- produção; ainda assim, rode o passo 1 e confira o que vai sair antes do 2.
-- =============================================================================

-- 1. O QUE VAI SAIR (confira antes de apagar)
SELECT
  u.email,
  (SELECT count(*) FROM activities         a  WHERE a.user_id  = u.id) AS atividades,
  (SELECT count(*) FROM workouts           w  WHERE w.user_id  = u.id) AS workouts,
  (SELECT count(*) FROM training_plans     tp WHERE tp.user_id = u.id) AS planos,
  (SELECT count(*) FROM readiness_history  rh WHERE rh.user_id = u.id) AS check_ins
FROM public.users u
WHERE u.email LIKE 'r1-seed-%@runeasy.test'
ORDER BY u.email;

-- 2. APAGAR (a cascata cuida do resto)
DELETE FROM auth.users WHERE email LIKE 'r1-seed-%@runeasy.test';

-- 3. CONFERIR — as quatro contagens devem voltar 0
SELECT
  (SELECT count(*) FROM public.users      WHERE email LIKE 'r1-seed-%@runeasy.test') AS usuarios,
  (SELECT count(*) FROM activities        WHERE external_id LIKE 'r1seed:%')         AS atividades,
  (SELECT count(*) FROM workouts          WHERE objective LIKE '[R1-SEED]%')         AS workouts,
  (SELECT count(*) FROM readiness_history WHERE status_label LIKE '[R1-SEED]%')      AS check_ins;
