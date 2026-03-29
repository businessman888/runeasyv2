-- Migration: create_ai_usage_logs
-- Tabela para registrar cada chamada de IA com tokens, custos e latência

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  feature_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes para queries frequentes
CREATE INDEX idx_ai_usage_user ON ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_feature ON ai_usage_logs(feature_name);
CREATE INDEX idx_ai_usage_created ON ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_model ON ai_usage_logs(model_name);

-- RLS: acesso apenas via service role (backend)
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON ai_usage_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- View: resumo por feature/modelo (24h e 7d)
CREATE OR REPLACE VIEW ai_usage_summary AS
SELECT
  feature_name,
  model_name,
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '24 hours') AS calls_24h,
  COALESCE(SUM(input_tokens) FILTER (WHERE created_at > now() - INTERVAL '24 hours'), 0) AS input_tokens_24h,
  COALESCE(SUM(output_tokens) FILTER (WHERE created_at > now() - INTERVAL '24 hours'), 0) AS output_tokens_24h,
  COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at > now() - INTERVAL '24 hours'), 0)::NUMERIC(10,6) AS cost_24h,
  COALESCE(AVG(latency_ms) FILTER (WHERE created_at > now() - INTERVAL '24 hours'), 0)::INTEGER AS avg_latency_24h,
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') AS calls_7d,
  COALESCE(SUM(input_tokens) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0) AS input_tokens_7d,
  COALESCE(SUM(output_tokens) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0) AS output_tokens_7d,
  COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0)::NUMERIC(10,6) AS cost_7d,
  COALESCE(AVG(latency_ms) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0)::INTEGER AS avg_latency_7d
FROM ai_usage_logs
GROUP BY feature_name, model_name;

-- View: resumo por usuário
CREATE OR REPLACE VIEW ai_usage_by_user AS
SELECT
  user_id,
  feature_name,
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '24 hours') AS calls_24h,
  COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at > now() - INTERVAL '24 hours'), 0)::NUMERIC(10,6) AS cost_24h,
  COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') AS calls_7d,
  COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0)::NUMERIC(10,6) AS cost_7d,
  COALESCE(SUM(input_tokens) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0) AS input_tokens_7d,
  COALESCE(SUM(output_tokens) FILTER (WHERE created_at > now() - INTERVAL '7 days'), 0) AS output_tokens_7d
FROM ai_usage_logs
WHERE user_id IS NOT NULL
GROUP BY user_id, feature_name;
