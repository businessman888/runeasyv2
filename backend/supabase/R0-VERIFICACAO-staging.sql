-- ═══════════════════════════════════════════════════════════════════════════
-- Readiness R.0 — VALIDAÇÃO EM STAGING (IDOR + compat 1.0.9)
--
-- Não é migration (fica fora de `migrations/` porque o carregador dos testes de
-- integração executa todo `.sql` daquela pasta).
--
-- ⚠️ SÓ STAGING. Supabase `gcaozgnevvmnlxnkfthh` · API
--    `https://runeasyv2-staging.up.railway.app`. Nada aqui deve ser rodado em
--    produção: o BLOCO 2 GRAVA um check-in de verdade e gasta uma chamada de IA.
--
-- ── ORDEM ──────────────────────────────────────────────────────────────────
--   1. deploy do `develop` em staging
--   2. BLOCO 1 (SQL, leitura) — anotar os ids e o horário de corte
--   3. BLOCO 2 (curl, fora do SQL) — o ataque
--   4. BLOCO 3 (SQL, leitura) — o veredito
--   5. BLOCO 4 (curl) — os dois controles
--
-- ── O QUE ESTÁ SENDO PROVADO ───────────────────────────────────────────────
--
-- `POST /readiness/analyze` era a única rota do backend a derivar identidade do
-- CORPO da requisição. O teste manda o token do usuário A e o id do usuário B
-- no body, e verifica em quem a linha caiu.
--
-- ⚠️ ARMADILHA DO TESTE: "nenhuma linha nova para B" passa vazio se a
-- requisição tiver falhado (400/401/500). Por isso o BLOCO 3 exige as DUAS
-- coisas — exatamente UMA linha nova, E ela pertencendo a A. Não aceite só a
-- metade negativa.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — preparação. Leitura pura. Todo `veredito` tem que ser ✅.
-- ═══════════════════════════════════════════════════════════════════════════

-- 👉 EDITE: o e-mail da conta de staging em que você CONSEGUE fazer login.
--    É o atacante (A) — quem assina o token.
WITH atacante AS (
  SELECT id, email
    FROM auth.users
   WHERE email = 'TROQUE_PELO_EMAIL_DE_STAGING@exemplo.com'
),
-- A vítima (B) é qualquer outro usuário. Não precisa de senha: o ataque só usa
-- o id dela.
vitima AS (
  SELECT u.id, u.email
    FROM auth.users u
   WHERE u.id <> (SELECT id FROM atacante)
   ORDER BY u.created_at DESC
   LIMIT 1
),
-- A janela do check-in é a MEIA-NOITE de São Paulo (getReadinessWindowStart).
-- Se A já tem linha nesta janela, o endpoint devolve o veredito existente e NÃO
-- grava — o teste passaria sem exercitar nada.
janela AS (
  SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
           AT TIME ZONE 'America/Sao_Paulo') AS inicio
)
SELECT
  'ID do ATACANTE (A) — use no header Authorization' AS item,
  (SELECT id::text FROM atacante)                    AS valor,
  CASE WHEN (SELECT count(*) FROM atacante) = 1
       THEN '✅' ELSE '❌ e-mail não encontrado' END  AS veredito
UNION ALL SELECT
  'ID da VÍTIMA (B) — use no body do curl',
  (SELECT id::text FROM vitima),
  CASE WHEN (SELECT count(*) FROM vitima) = 1
       THEN '✅' ELSE '❌ precisa de 2 usuários em staging' END
UNION ALL SELECT
  'Início da janela de hoje (00:00 São Paulo)',
  (SELECT inicio::text FROM janela),
  '✅'
UNION ALL SELECT
  'A ainda NÃO respondeu hoje (senão o endpoint curto-circuita)',
  (SELECT count(*)::text FROM readiness_history
    WHERE user_id = (SELECT id FROM atacante)
      AND created_at >= (SELECT inicio FROM janela)),
  CASE WHEN (SELECT count(*) FROM readiness_history
              WHERE user_id = (SELECT id FROM atacante)
                AND created_at >= (SELECT inicio FROM janela)) = 0
       THEN '✅' ELSE '❌ rode a LIMPEZA abaixo antes do BLOCO 2' END
UNION ALL SELECT
  'Linhas de B na janela (baseline — tem que continuar igual no fim)',
  (SELECT count(*)::text FROM readiness_history
    WHERE user_id = (SELECT id FROM vitima)
      AND created_at >= (SELECT inicio FROM janela)),
  '📌 anote';


-- ── LIMPEZA (só se o check "A ainda NÃO respondeu hoje" deu ❌) ─────────────
-- ⚠️ ESCRITA. Apaga o check-in de hoje de A para o teste poder rodar.
--    Staging apenas.
--
-- DELETE FROM readiness_history
--  WHERE user_id = 'ID_DE_A'
--    AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
--                        AT TIME ZONE 'America/Sao_Paulo');


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — o ataque. Rode no terminal, NÃO no SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 2.1 — Token de A (Supabase password grant). A anon key abaixo é a publishable
--       de staging, valor público já versionado em `references/`.
--
--   curl -s -X POST \
--     'https://gcaozgnevvmnlxnkfthh.supabase.co/auth/v1/token?grant_type=password' \
--     -H 'apikey: sb_publishable_c11B_LhCkB2c-F5GtAhcog_zA4GnZYr' \
--     -H 'Content-Type: application/json' \
--     -d '{"email":"EMAIL_DE_A","password":"SENHA_DE_A"}'
--
--   Guarde `access_token`. Confira que `user.id` bate com o ID DE A do BLOCO 1.
--
-- 2.2 — O ATAQUE: token de A, id de B no corpo.
--
--   ⚠️ NÃO mande o header `x-user-id`. O guard já rejeita header divergente
--      (401 'User ID mismatch') desde antes desta correção — mandá-lo faria o
--      teste morrer no guard e nunca chegar no ponto que estamos testando, que
--      é o BODY.
--
--   curl -i -X POST \
--     'https://runeasyv2-staging.up.railway.app/api/readiness/analyze' \
--     -H 'Authorization: Bearer TOKEN_DE_A' \
--     -H 'Content-Type: application/json' \
--     -d '{"userId":"ID_DE_B","answers":{"sleep":4,"legs":3,"mood":5,"stress":4,"motivation":5},"setNumber":7}'
--
--   ESPERADO: HTTP 200 com o veredito e `"alreadyCompleted":false`.
--
--   Este mesmo request prova DUAS coisas de uma vez:
--     · 200 (e não 400 "property userId should not exist")
--         → a compat com o app 1.0.9 sobreviveu ao `forbidNonWhitelisted`;
--     · em quem a linha caiu → o BLOCO 3.
--
--   Se vier 400, PARE: o campo `userId` saiu do DTO e o app instalado quebrou.
--   Se vier 401, o token expirou (ou é de outro ambiente) — refaça o 2.1.


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — o veredito. Leitura pura. Rode DEPOIS do curl do 2.2.
-- ═══════════════════════════════════════════════════════════════════════════

-- 👉 EDITE os dois ids com os valores que o BLOCO 1 devolveu.
WITH ids AS (
  SELECT 'ID_DE_A'::uuid AS atacante,
         'ID_DE_B'::uuid AS vitima
),
janela AS (
  SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
           AT TIME ZONE 'America/Sao_Paulo') AS inicio
),
novas AS (
  SELECT h.*
    FROM readiness_history h, janela j
   WHERE h.created_at >= j.inicio
     AND h.user_id IN ((SELECT atacante FROM ids), (SELECT vitima FROM ids))
)
SELECT
  '1. A requisição foi processada (existe linha nova)' AS check,
  (SELECT count(*)::text FROM novas)                   AS valor,
  CASE WHEN (SELECT count(*) FROM novas) >= 1
       THEN '✅' ELSE '❌ VAZIO — o curl falhou; o teste NÃO provou nada' END AS veredito
UNION ALL SELECT
  '2. A linha caiu no ATACANTE (id do token)',
  (SELECT count(*)::text FROM novas WHERE user_id = (SELECT atacante FROM ids)),
  CASE WHEN (SELECT count(*) FROM novas WHERE user_id = (SELECT atacante FROM ids)) >= 1
       THEN '✅' ELSE '❌' END
UNION ALL SELECT
  '3. NADA foi gravado na VÍTIMA (id do body) — o IDOR',
  (SELECT count(*)::text FROM novas WHERE user_id = (SELECT vitima FROM ids)),
  CASE WHEN (SELECT count(*) FROM novas WHERE user_id = (SELECT vitima FROM ids)) = 0
       THEN '✅ IDOR FECHADO' ELSE '❌❌ IDOR ABERTO — pare o deploy' END
UNION ALL SELECT
  '4. set_number do body foi respeitado (7)',
  (SELECT coalesce(max(set_number)::text, '(null)') FROM novas
    WHERE user_id = (SELECT atacante FROM ids)),
  CASE WHEN (SELECT max(set_number) FROM novas
              WHERE user_id = (SELECT atacante FROM ids)) = 7
       THEN '✅' ELSE '⚠️ conferir' END;


-- ── BÔNUS: o bloco 42703, de graça ─────────────────────────────────────────
-- O mesmo check-in revela se o treino chegou à IA. Só é conclusivo se A tiver
-- plano ativo E um treino `pending` para hoje — o 1º SELECT diz se tem.

SELECT
  (SELECT count(*) FROM training_plans
    WHERE user_id = 'ID_DE_A'::uuid AND status = 'active')          AS planos_ativos,
  (SELECT count(*) FROM workouts
    WHERE user_id = 'ID_DE_A'::uuid
      AND status = 'pending'
      AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS treinos_pendentes_hoje,
  CASE WHEN (SELECT count(*) FROM workouts
              WHERE user_id = 'ID_DE_A'::uuid
                AND status = 'pending'
                AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) > 0
       THEN '✅ dá para avaliar o 42703 abaixo'
       ELSE '⚠️ sem treino hoje: o texto vai dizer "sem treino" com razão' END AS pode_avaliar;

-- Se `pode_avaliar` for ✅, este texto NÃO pode mais dizer "Sem treino
-- planejado hoje" — era isso que os 7 check-ins de produção diziam, inclusive
-- para quem tinha 170 treinos no banco.
SELECT created_at,
       ai_analysis->>'plan_adjustment' AS ajuste_pratico,
       ai_analysis->>'reasoning'       AS raciocinio
  FROM readiness_history
 WHERE user_id = 'ID_DE_A'::uuid
 ORDER BY created_at DESC
 LIMIT 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — controles. Terminal. Provam que o teste discrimina.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 4.1 — Header divergente continua barrado no guard (defesa em profundidade,
--       independente da correção do body):
--
--   curl -i -X POST \
--     'https://runeasyv2-staging.up.railway.app/api/readiness/analyze' \
--     -H 'Authorization: Bearer TOKEN_DE_A' \
--     -H 'x-user-id: ID_DE_B' \
--     -H 'Content-Type: application/json' \
--     -d '{"answers":{"sleep":4,"legs":3,"mood":5,"stress":4,"motivation":5}}'
--
--   ESPERADO: 401 'User ID mismatch'.
--
-- 4.2 — Body SEM `userId` (o mobile do futuro) não quebra:
--
--   curl -i -X POST \
--     'https://runeasyv2-staging.up.railway.app/api/readiness/analyze' \
--     -H 'Authorization: Bearer TOKEN_DE_A' \
--     -H 'Content-Type: application/json' \
--     -d '{"answers":{"sleep":4,"legs":3,"mood":5,"stress":4,"motivation":5}}'
--
--   ESPERADO: 200. Como A já respondeu no 2.2, virá
--   `"alreadyCompleted":true` — e isso basta: o que se prova aqui é a AUSÊNCIA
--   de 400, ou seja, que o mobile pode parar de mandar `userId` sem coordenar
--   deploy com o backend.
--
-- 4.3 — Sem token:
--
--   curl -i -X POST \
--     'https://runeasyv2-staging.up.railway.app/api/readiness/analyze' \
--     -H 'Content-Type: application/json' \
--     -d '{"userId":"ID_DE_B","answers":{"sleep":4,"legs":3,"mood":5,"stress":4,"motivation":5}}'
--
--   ESPERADO: 401. Nunca 200 — seria a versão mais grave do mesmo furo.
-- ═══════════════════════════════════════════════════════════════════════════
