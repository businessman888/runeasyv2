-- Fase A — Dados de capacidade atual no onboarding.
--
-- A auditoria de progressão de planos mostrou que o volume dos planos ancora no
-- rótulo de nível ("beginner"), não na capacidade real do atleta, porque o dado
-- de entrada é insuficiente. Esta migration adiciona os campos que a Fase A passa
-- a coletar e que o motor de volume determinístico (Fase B) vai consumir.
--
-- recent_frequency  : frequência de corrida nas últimas 4 semanas
--                     ('never' | '1x' | '2x' | '3x' | '4x_plus')
-- current_weekly_km : faixa de volume semanal atual — número âncora da Fase B
--                     ('lt5' | '5_10' | '10_20' | '20_30' | 'gt30')
-- walk_capacity     : só no fluxo "nunca corri" (recent_distance = 0). Ponto de
--                     partida do protocolo caminhada/corrida da Fase B
--                     ('easy' | 'effort' | 'not_yet')
--
-- Guardados como TEXT (enum-string); a derivação numérica é feita na Fase B.
-- Todas as colunas são aditivas e nullable, então a migration é não-destrutiva e
-- segura em tabelas ativas. Usuários/planos antigos ficam com NULL — a Fase B
-- degrada ao comportamento atual quando faltarem. As RLS já existentes cobrem as
-- novas colunas (não há mudança na forma da linha).

ALTER TABLE user_onboarding
  ADD COLUMN IF NOT EXISTS recent_frequency TEXT,
  ADD COLUMN IF NOT EXISTS current_weekly_km TEXT,
  ADD COLUMN IF NOT EXISTS walk_capacity TEXT;
