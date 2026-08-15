-- Fase 6.1 — as duas funções de LEITURA da fundação.
--
--   plan_editable_workouts(plan, hoje)  → a janela editável, com o md5 de cada
--                                          instructions_json
--   plan_state_digest(plan, hoje)        → o "número de versão" do agregado
--
-- Ambas são STABLE e não escrevem nada. Existem antes da função de escrita
-- porque ela depende do digest.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 1. plan_editable_workouts — A FRONTEIRA, EM UM LUGAR SÓ
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO QUE ESTA FUNÇÃO EXISTE PARA IMPEDIR ─────────────────────────────
--
-- `reanchorRemainingWorkoutsToToday` calculava em memória um conjunto fino de
-- treinos e depois chamava `shift_pending_workouts`, cujo predicado era
-- `WHERE plan_id = ? AND status = 'pending'` — TODOS os pendentes do plano. As
-- duas seleções nunca foram iguais, e 95 testes verdes não pegaram isso porque
-- eles MOCKAM o `.rpc()`: o SQL nunca executou.
--
-- A lição não é "escrever um predicado melhor no serviço". É que a seleção do
-- serviço e a seleção do SQL precisam ser A MESMA COISA. Aqui o serviço não
-- monta mais um predicado próprio: ele PEDE a lista para o banco, e a função de
-- escrita reafirma exatamente os mesmos critérios no seu WHERE.
--
-- ── POR QUE O md5 VEM DAQUI ───────────────────────────────────────────────────
--
-- O compare-and-swap por linha compara `md5(instructions_json::text)`. Esse
-- valor NÃO pode ser calculado no TypeScript: o Postgres normaliza jsonb
-- (chaves ordenadas, espaços removidos, numéricos canônicos) e
-- `JSON.stringify` não reproduz isso. Um md5 calculado no Node divergiria em
-- silêncio e o CAS nunca casaria. Então o banco entrega o md5 junto da linha.
--
-- ── OS CRITÉRIOS ──────────────────────────────────────────────────────────────
--
--   plan_id = o plano                 manual/livre (plan_id NULL) e ciclos
--                                     encerrados ficam fora sem heurística
--   status = 'pending'                terminal é história
--   scheduled_date > p_today          HOJE INTEIRO CONGELADO — o backend não
--                                     conhece "em execução" (o cursor da corrida
--                                     vive em MMKV no device), então a
--                                     representação segura é não representar
--   is_race_day = false               prova é invariante
--
-- `p_today` vem do BACKEND (`getSaoPauloToday()`), nunca `CURRENT_DATE`: o
-- Postgres do Supabase roda em UTC e discordaria em um dia inteiro perto da
-- meia-noite de São Paulo.

CREATE OR REPLACE FUNCTION public.plan_editable_workouts(
  p_plan_id uuid,
  p_today   date
)
RETURNS TABLE (
  id                uuid,
  week_number       integer,
  scheduled_date    date,
  status            text,
  type              text,
  title             text,
  distance_km       double precision,
  instructions_json jsonb,
  instructions_md5  text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT w.id,
         w.week_number,
         w.scheduled_date,
         w.status,
         w.type,
         w.title,
         w.distance_km,
         w.instructions_json,
         md5(coalesce(w.instructions_json::text, ''))
    FROM public.workouts w
   WHERE w.plan_id = p_plan_id
     AND w.status = 'pending'
     AND w.scheduled_date > p_today
     AND coalesce(w.is_race_day, false) = false
   ORDER BY w.scheduled_date, w.id;
$$;

COMMENT ON FUNCTION public.plan_editable_workouts(uuid, date) IS
  'A janela editável da Fase 6 (amanhã em diante, pending, do plano, não-prova), com o md5 de cada instructions_json para o compare-and-swap. O serviço consome esta lista em vez de montar predicado próprio — é assim que a seleção do TS e a do SQL passam a ser a mesma coisa por construção.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. plan_state_digest — A VERSÃO DO AGREGADO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ── POR QUE UM DIGEST CALCULADO, E NÃO UM CONTADOR ARMAZENADO ─────────────────
--
-- A alternativa óbvia seria `training_plans.plan_revision integer`, incrementado
-- a cada escrita. Ela foi descartada por um motivo concreto: SETE caminhos
-- escrevem em `workouts` hoje (materialização, re-âncora, missed automático,
-- skip, conclusão/sync, reprecificação da F3, e a própria F6). Um contador
-- depende de todos eles LEMBRAREM de incrementar, e o custo de um esquecimento
-- é um falso "sem conflito" — silencioso, e exatamente o defeito que o
-- versionamento existe para impedir.
--
-- Um digest calculado do CONTEÚDO não pode ser esquecido: quem escreveu, escreveu.
--
-- A variante com trigger (`AFTER ... ON workouts` incrementando o plano) também
-- foi descartada: ela transformaria a linha do plano num ponto de serialização
-- para toda escrita de workout — `completeWorkout` passaria a esperar por uma
-- transação da F3 ou da F6. Custo real em caminho crítico já validado, para
-- comprar O(1) num agregado de algumas dezenas de linhas.
--
-- ── O QUE ENTRA ───────────────────────────────────────────────────────────────
--
-- A linha do plano (status, generation_status, vdot_current) + a janela
-- editável inteira. Se qualquer um mudar, uma adaptação já calculada deixa de
-- valer.
--
-- ── E O QUE NÃO ENTRA, DE PROPÓSITO ───────────────────────────────────────────
--
-- Treinos de HOJE e do passado. Concluir o treino de hoje entre a preview e o
-- apply NÃO invalida a adaptação — e não deve: a edição não alcança hoje. Um
-- digest do plano inteiro geraria rejeições que o corredor leria como bug.
--
-- ── EFEITO COLATERAL CORRETO ──────────────────────────────────────────────────
--
-- O digest depende de `p_today`. Uma preview às 23h59 e um apply às 00h01 veem
-- janelas diferentes e conflitam. Isso é CERTO: a fronteira moveu, e um treino
-- que era "amanhã" virou "hoje" e passou a ser intocável.

CREATE OR REPLACE FUNCTION public.plan_state_digest(
  p_plan_id uuid,
  p_today   date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT md5(
           coalesce(p.status, '')            || '|' ||
           coalesce(p.generation_status, '') || '|' ||
           coalesce(p.vdot_current::text, '')|| '|' ||
           coalesce(
             (SELECT string_agg(
                       e.id::text                        || ':' ||
                       coalesce(e.status, '')            || ':' ||
                       coalesce(e.scheduled_date::text,'')|| ':' ||
                       coalesce(e.distance_km::text, '') || ':' ||
                       e.instructions_md5,
                       ','
                       -- ordem estável: sem ORDER BY, string_agg não garante
                       -- ordem e o mesmo estado produziria digests diferentes.
                       ORDER BY e.id
                     )
                FROM public.plan_editable_workouts(p.id, p_today) e),
             '')
         )
    FROM public.training_plans p
   WHERE p.id = p_plan_id;
$$;

COMMENT ON FUNCTION public.plan_state_digest(uuid, date) IS
  'Versão do agregado (plano + janela editável), para concorrência otimista. Calculado do conteúdo e não armazenado: um contador exigiria que os 7 caminhos que escrevem em workouts lembrassem de incrementar, e um esquecimento produziria falso "sem conflito". O TS trata como string opaca — espelhar este md5 em JavaScript é impossível sem reproduzir a normalização de jsonb do Postgres.';

-- ── Server-only ───────────────────────────────────────────────────────────────
-- Mesmo padrão de `shift_pending_workouts` e de 20260610_fix_function_security:
-- fora do Data API, execução só pela service role usada pelo backend.
REVOKE ALL ON FUNCTION public.plan_editable_workouts(uuid, date) FROM public;
REVOKE ALL ON FUNCTION public.plan_state_digest(uuid, date)      FROM public;
GRANT EXECUTE ON FUNCTION public.plan_editable_workouts(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_state_digest(uuid, date)      TO service_role;
