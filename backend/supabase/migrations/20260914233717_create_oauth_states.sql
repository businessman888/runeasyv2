-- OAuth `state` persistido — o único elo entre o callback e o usuário.
--
-- ── O QUE ISTO CONSERTA (Mina 6) ─────────────────────────────────────────────
--
-- O `state` do OAuth vivia num `Map` na memória do processo. O callback do
-- provedor chega SEM sessão — é o navegador voltando redirecionado pelo Google
-- —, e o `state` é a única coisa que liga essa resposta ao `user_id`. Um deploy
-- ou uma segunda réplica no Railway dentro dos 10 min de TTL fazia o callback
-- cair em "Invalid or expired state parameter", para um usuário que tinha
-- autorizado corretamente. E sem o `state` não há como saber de quem é o token.
--
-- Uma linha por fluxo de autorização em andamento. Sobrevive a restart e a
-- múltiplas réplicas porque mora no banco, não no processo.
--
-- ── USO ÚNICO, ATÔMICO ───────────────────────────────────────────────────────
--
-- O backend consome com um único comando:
--
--     DELETE FROM oauth_states
--      WHERE state = $1 AND provider = $2 AND expires_at > now()
--  RETURNING user_id, code_verifier;
--
-- Duas requisições concorrentes com o mesmo `state`: só uma recebe a linha. Não
-- existe leitura prévia que possa correr contra a outra — é o mesmo raciocínio
-- da UNIQUE de `plan_adaptations`.
--
-- ── ESCOPO ───────────────────────────────────────────────────────────────────
--
-- Hoje só `google_health` usa esta tabela. Fitbit e Polar continuam no `Map` em
-- memória: migrá-los seria mexer em provedor vivo, fora do escopo da Fase 3. A
-- tabela é genérica (`provider`, `code_verifier` nullable) para que possam vir
-- depois sem DDL nova.
--
-- Aditiva. Nenhum dado existente é tocado.

CREATE TABLE IF NOT EXISTS public.oauth_states (
  -- 32 bytes aleatórios em base64url, gerados no backend.
  state          TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL,
  -- PKCE. Nullable porque nem todo provedor usa (a Polar não usa).
  code_verifier  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

-- A coleta preguiçosa das linhas vencidas (`DELETE … WHERE expires_at < now()`)
-- roda a cada `state` novo, então precisa de índice.
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx
  ON public.oauth_states (expires_at);

-- Padrão deste repo: RLS LIGADA com ZERO POLÍTICAS. Bloqueia a tabela por
-- completo no Data API e deixa o acesso só para o backend (service role).
-- Idêntico a plan_adaptations / plan_vdot_history / plan_week_insights.
--
-- Aqui não é formalidade: o `code_verifier` é um segredo de curta duração, e
-- não pode ficar legível para `anon` nem para `authenticated`.
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.oauth_states IS
  'Fluxos de autorização OAuth em andamento (Fase 3). Uma linha por `state` emitido, consumida por DELETE … RETURNING no callback: uso único, atômico, e sobrevive a restart e a réplicas — ao contrário do Map em memória que o Fitbit e o Polar ainda usam.';

COMMENT ON COLUMN public.oauth_states.code_verifier IS
  'Verificador PKCE (S256). Segredo de curta duração: só existe até o callback consumir a linha ou o TTL de 10 min vencer.';
