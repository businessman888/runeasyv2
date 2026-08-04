-- Fase 2B — "visto" e "reajuste aplicado" no insight semanal.
--
-- ── seen_at ───────────────────────────────────────────────────────────────────
--
-- O modal de entrada dispara na abertura do app quando existe insight
-- `completed` ainda não visto. Sem uma marca de leitura, ele reapareceria a cada
-- abertura até a semana seguinte — o caminho mais curto para o usuário aprender
-- a fechar o modal no reflexo, sem ler.
--
-- No banco e não em AsyncStorage local por dois motivos: vale entre aparelhos e
-- sobrevive a reinstalação; e vira métrica de engajamento (quantos de fato
-- abriram o insight), que a Fase 4 vai querer para calibrar a cadência.
--
-- O CARD PERSISTENTE NÃO DEPENDE DISTO. `seen_at` só governa o modal; o card da
-- home/calendário continua aparecendo enquanto o insight for o mais recente,
-- porque ele é a rede de segurança de quem fechou o modal sem abrir.
--
-- ── adjustment_applied_at ─────────────────────────────────────────────────────
--
-- O botão da classe `schedule` (adiar/repetir semana) re-ancora o plano. É uma
-- ação que MOVE O CALENDÁRIO INTEIRO e não deve ser aplicável duas vezes: um
-- toque duplo empurraria o plano duas semanas. Esta coluna é a trava — o
-- endpoint recusa quando já está preenchida, e a UI mostra "aplicado" em vez do
-- botão.

ALTER TABLE public.plan_week_insights
  ADD COLUMN IF NOT EXISTS seen_at              timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_applied_at timestamptz;

COMMENT ON COLUMN public.plan_week_insights.seen_at IS
  'Quando o usuário abriu o insight. NULL = o modal de entrada ainda deve disparar. Não governa o card persistente da home/calendário, que aparece independente disto.';

COMMENT ON COLUMN public.plan_week_insights.adjustment_applied_at IS
  'Quando o reajuste de classe `schedule` foi aplicado (re-âncora do plano). Trava de idempotência: a ação move o calendário inteiro e um toque duplo empurraria o plano duas semanas. Sempre NULL para classe `prescription`, que é só conselho até a Fase 6.';

-- O modal pergunta "existe insight completed não visto?" a cada abertura do app.
-- Índice parcial: só as linhas não vistas entram, o que o mantém minúsculo.
CREATE INDEX IF NOT EXISTS plan_week_insights_unseen_idx
  ON public.plan_week_insights (user_id, week_end DESC)
  WHERE seen_at IS NULL AND status = 'completed';
