-- Expiração do refresh token — sem isto a integração morre no 8º dia, calada.
--
-- ── O QUE ISTO CONSERTA ──────────────────────────────────────────────────────
--
-- `connected_devices.expires_at` é a validade do ACCESS token (uma hora, no
-- Google). O refresh token tem validade própria, e ela não era gravada em lugar
-- nenhum.
--
-- No Google Health com a tela de consentimento em modo "Teste", o refresh token
-- é time-based e expira em 7 dias — a resposta de token traz
-- `refresh_token_expires_in ≈ 604799`. Sem persistir isso, o cron continua
-- renovando o access token normalmente até o dia em que o refresh token
-- simplesmente para de funcionar, e ninguém tem como saber por quê.
--
-- NULL significa "sem prazo conhecido": o provedor não informou. É o caso do
-- Google com a tela publicada (o campo só vem quando o acesso é time-based) e
-- de todos os provedores que não o mandam (Fitbit, Polar).
--
-- Aditiva. As RLS existentes de `connected_devices` são por linha, então já
-- cobrem a coluna nova. Nenhum dado existente é tocado.

ALTER TABLE public.connected_devices
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.connected_devices.refresh_token_expires_at IS
  'Quando o REFRESH token deixa de valer (o access token é `expires_at`). Vem de `refresh_token_expires_in` na resposta de token; NULL quando o provedor não informa. No Google em modo Teste, 7 dias após a autorização.';
