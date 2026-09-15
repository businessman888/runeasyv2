-- Estado degradado do token — "a renovação morreu" precisa ficar gravado.
--
-- ── O QUE ISTO CONSERTA ──────────────────────────────────────────────────────
--
-- Quando a renovação de token falhava, o `TokenRefreshService` só logava e
-- seguia. Nada ficava registrado na linha, então o app não tinha como saber
-- que a conexão estava morta: hoje "conectado" deriva da mera existência da
-- linha em `connected_devices` (Mina 21). Com o refresh token de 7 dias do
-- Google em modo Teste, o usuário veria "Conectado" numa integração morta a
-- partir do 8º dia.
--
-- ── SEMÂNTICA ────────────────────────────────────────────────────────────────
--
-- `refresh_failed_at` preenchido = o provedor recusou o refresh token de forma
-- definitiva (`invalid_grant`: revogado, expirado, ou a senha mudou). A conexão
-- precisa ser refeita pelo usuário. Falha TRANSITÓRIA (rede, 5xx) não marca
-- nada — o cron tenta de novo no ciclo seguinte.
--
-- As duas colunas voltam a NULL quando o usuário reconecta.
--
-- `last_refresh_error` guarda o código e a descrição devolvidos pelo provedor
-- (ex.: `invalid_grant: Token has been expired or revoked.`). Nunca token, nunca
-- corpo de requisição.
--
-- Aditiva. As RLS existentes de `connected_devices` são por linha, então já
-- cobrem as colunas novas. Nenhum dado existente é tocado.

ALTER TABLE public.connected_devices
  ADD COLUMN IF NOT EXISTS refresh_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refresh_error TEXT;

COMMENT ON COLUMN public.connected_devices.refresh_failed_at IS
  'Quando o provedor recusou o refresh token de forma definitiva (invalid_grant). Preenchido = conexão morta, o usuário precisa reconectar. Falha transitória não marca. Volta a NULL na reconexão.';

COMMENT ON COLUMN public.connected_devices.last_refresh_error IS
  'Código e descrição do erro devolvidos pelo provedor na última falha definitiva de refresh. Nunca contém token.';
