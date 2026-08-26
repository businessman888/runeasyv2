-- Fundação da Fase 6 — tirar as funções do alcance do Data API DE VERDADE.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- O QUE FOI ENCONTRADO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- As migrations 20260815 fecham com este par, e o comentário acima dele diz
-- "Server-only … fora do Data API, execução só pela service role":
--
--     REVOKE ALL ON FUNCTION public.apply_plan_adaptation(...) FROM public;
--     GRANT EXECUTE ON FUNCTION public.apply_plan_adaptation(...) TO service_role;
--
-- A afirmação é FALSA. Medido nos dois ambientes, a ACL real das quatro funções
-- da fundação é:
--
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
--                                           | service_role=X/postgres
--
-- `anon` e `authenticated` têm EXECUTE. O motivo é que o Supabase mantém
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role`: toda função criada em `public` já nasce
-- concedida a esses papéis, por grant EXPLÍCITO. E `REVOKE … FROM public`
-- remove apenas o grant do pseudo-papel `PUBLIC` — ele não toca em grants
-- explícitos. As duas coisas se parecem no texto e não são a mesma.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE ISTO NÃO É (HOJE) UMA VULNERABILIDADE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- As quatro funções são SECURITY INVOKER (nenhuma declara SECURITY DEFINER), e
-- `workouts` e `training_plans` estão com RLS LIGADA e ZERO POLÍTICAS — o que
-- nega tudo para quem não tem BYPASSRLS.
--
-- Então uma chamada de `anon`/`authenticated` via PostgREST executa o corpo sob
-- RLS, o `SELECT … FROM training_plans … FOR UPDATE` não devolve linha, e a
-- função responde `{"applied": false, "reason": "plan_not_editable"}`. Nada
-- escreve. A guarda que segura hoje é a RLS, NÃO o grant.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- POR QUE, AINDA ASSIM, VALE CORRIGIR
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Porque a proteção está inteiramente em uma decisão tomada em OUTRO lugar, e
-- essa decisão é plausível de mudar por um motivo que nada tem a ver com a
-- Fase 6.
--
-- Basta alguém adicionar UMA política de leitura em `workouts` — "o corredor lê
-- os próprios treinos", o pedido mais natural do mundo para uma tela nova — e,
-- no mesmo instante, `authenticated` passa a poder chamar
-- `apply_plan_adaptation` direto pelo Data API, com o próprio JWT, pulando o
-- backend inteiro: sem ProGuard (a edição de plano é Pro), sem a política de
-- alívio, sem as invariantes de taper e prova, sem a régua de espaçamento da
-- Troca de Dias. A whitelist de quatro colunas continuaria valendo — e ela
-- inclui `status`, `distance_km`, `instructions_json` e `scheduled_date`.
--
-- Ninguém que escrevesse aquela política teria motivo para suspeitar disso. Um
-- REVOKE explícito custa uma linha e remove a armadilha antes que ela exista.
--
-- ── Ninguém depende deste grant ───────────────────────────────────────────────
--
-- O backend fala com a SERVICE ROLE (`SupabaseService.getClient()`), e o app
-- mobile não chama `.rpc()` em lugar nenhum — verificado por grep em
-- `mobile/src`: zero ocorrências de `.rpc(` e zero menções às quatro funções.
-- O `GRANT … TO service_role` abaixo é reafirmado para deixar isso explícito.
--
-- ⚠️ Esta migration é INDEPENDENTE da T.0 da Troca de Dias. Ela conserta um
-- defeito da 20260815 e pode ser aplicada (ou não) sem afetar a T.0.

DO $$
DECLARE
  v_fn   text;
  v_alvo text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
    'public.apply_schedule_shift(uuid,uuid,uuid[],integer,date,text,text,uuid,jsonb)',
    'public.plan_editable_workouts(uuid,date)',
    'public.plan_state_digest(uuid,date)'
  ]
  LOOP
    -- `PUBLIC` continua no REVOKE: ele cobre o pseudo-papel, que os grants
    -- explícitos abaixo NÃO cobrem. Os três juntos é que fecham.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);

    -- `anon` e `authenticated` só existem em Supabase; no cluster descartável
    -- dos testes eles são criados pelo `bootstrap.sql`. O IF é para qualquer
    -- outro Postgres onde a migration venha a rodar.
    FOREACH v_alvo IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_alvo) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn, v_alvo);
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
    END IF;

    RAISE NOTICE '[fundação] % → só service_role', split_part(v_fn, '(', 1);
  END LOOP;
END;
$$;

-- ── Rede de segurança ─────────────────────────────────────────────────────────
--
-- Falha ALTO se alguma das quatro continuar executável por `anon` ou
-- `authenticated`. Sem isto, um REVOKE que não pegasse (nome de papel diferente
-- num self-hosted, por exemplo) passaria em silêncio — que é exatamente o modo
-- de falha que esta migration existe para consertar.
DO $$
DECLARE
  v_fn      text;
  v_papel   text;
  v_sobrou  text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.apply_plan_adaptation(uuid,uuid,date,text,text,text,jsonb,boolean,jsonb,jsonb,jsonb)',
    'public.apply_schedule_shift(uuid,uuid,uuid[],integer,date,text,text,uuid,jsonb)',
    'public.plan_editable_workouts(uuid,date)',
    'public.plan_state_digest(uuid,date)'
  ]
  LOOP
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_papel)
         AND has_function_privilege(v_papel, v_fn, 'EXECUTE') THEN
        v_sobrou := v_sobrou || (split_part(v_fn, '(', 1) || '→' || v_papel);
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_sobrou, 1) > 0 THEN
    RAISE EXCEPTION 'REVOKE não pegou em: %', array_to_string(v_sobrou, ', ');
  END IF;

  RAISE NOTICE '[fundação] ✓ nenhuma das 4 é alcançável por anon/authenticated';
END;
$$;
