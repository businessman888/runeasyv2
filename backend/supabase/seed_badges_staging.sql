-- =============================================================================
-- SEED do catálogo de badges — rodar no SQL Editor do STAGING
-- Projeto: gcaozgnevvmnlxnkfthh  (NÃO rodar em produção — lá já está íntegro)
-- =============================================================================
-- Contexto: o staging foi criado a partir de um dump schema-only, então
-- public.badges nasceu VAZIA (Q0: definicoes=0). Sem catálogo, a tela de badges
-- conta 0, os chips somem dos cards de treino e checkBadges() sai silenciosamente
-- em `if (allBadges.length === 0) return []`.
--
-- Estas 29 linhas foram extraídas 1:1 de PRODUÇÃO (ndlsxgsccyjspbhzccyp) via MCP
-- read-only em 2026-07-29. Os UUIDs de produção são preservados de propósito:
-- o staging não tem nenhuma linha em user_badges (Q0: conquistas_total=0), então
-- não há risco de órfão, e manter os mesmos ids deixa os dois bancos idênticos.
--
-- Idempotente: ON CONFLICT (slug) DO NOTHING. Rodar duas vezes não duplica nem
-- quebra. `slug` é a chave única e é por slug que o backend casa checker↔badge.
--
-- NOTA: este arquivo NÃO está em supabase/migrations/ de propósito — é um seed
-- manual pontual, não uma migration versionada (decisão de escopo).
-- =============================================================================

INSERT INTO public.badges (id, slug, name, description, icon, type, tier, xp_reward, criteria) VALUES

-- ─── adherence ───────────────────────────────────────────────────────────────
  ('f17fab6f-1870-4682-8a41-03fafbc38414', 'fiel_ao_plano', 'Fiel ao Plano', 'Mantenha 80% de aderência ao plano por 4 semanas', '🎯', 'adherence', 3, 150, '{"type": "adherence_4_weeks", "percentage": 80}'::jsonb),

-- ─── consistency ─────────────────────────────────────────────────────────────
  ('62a64f57-9335-471c-b7b1-1516555e304f', 'semana_completa', 'Semana Completa', 'Complete todos os treinos de uma semana', '📅', 'consistency', 1, 80, '{"type": "week_complete"}'::jsonb),
  ('36d7264f-9911-43c0-be0e-fd5d4f775fcb', 'consistente', 'Consistente', 'Complete 12 treinos em 30 dias', '🔥', 'consistency', 2, 120, '{"type": "workouts_30_days", "count": 12}'::jsonb),

-- ─── exploration ─────────────────────────────────────────────────────────────
  ('cb16399f-c48b-4de3-9fb7-cec90fe12504', 'madrugador', 'Madrugador', 'Completou 5 corridas iniciadas entre 05h e 07h da manhã.', 'shield_indigo_2', 'exploration', 2, 100, '{"type": "runs_in_time_window", "hour_to": 7, "hour_from": 5, "threshold": 5}'::jsonb),
  ('6c366095-6bb6-437e-ad64-1a61a1fa7029', 'na_chuva_e_no_sol', 'Coruja e Cotovia', 'Treinou em todos os 5 períodos do dia: madrugada, manhã, tarde, fim de tarde e noite.', '🌦️', 'exploration', 2, 100, '{"type": "weather_variety", "count": 5}'::jsonb),
  ('6458e074-99c2-4201-9797-a47a314d7b72', 'noturno', 'Corredor Noturno', 'Completou 5 corridas iniciadas após as 20h.', 'shield_indigo_2', 'exploration', 2, 100, '{"type": "runs_in_time_window", "hour_to": 24, "hour_from": 20, "threshold": 5}'::jsonb),
  ('9e1254d0-e4ac-48fd-a17f-435fda7b3186', 'diversificado', 'Diversificado', 'Treinou em todos os 7 dias da semana ao longo do histórico.', 'shield_indigo_3', 'exploration', 3, 150, '{"type": "all_weekdays_covered", "threshold": 7}'::jsonb),

-- ─── milestone ───────────────────────────────────────────────────────────────
  ('0dfaf950-2caa-408d-ba85-5a29075168da', 'primeiro_passo', 'Primeiro Passo', 'Complete seu primeiro treino', '🏃', 'milestone', 1, 50, '{"type": "first_workout"}'::jsonb),
  ('c4571752-5432-484b-a47d-9788c4a9e120', 'welcome', 'Boas-Vindas', 'Concluiu o onboarding e começou a jornada no RunEasy.', '🏆', 'milestone', 1, 0, '{}'::jsonb),
  ('74ba10e3-0a99-4e75-8aaa-b6469745064b', 'cinquenta_km', 'Cinquenta', 'Acumulou 50 km de corrida no total.', 'shield_blue_2', 'milestone', 2, 100, '{"type": "total_distance_km", "threshold": 50}'::jsonb),
  ('4790d0f5-6485-4b73-aaa3-942ac61c9616', 'centuriao', 'Centurião', 'Acumulou 100 km de corrida no total.', 'shield_blue_3', 'milestone', 3, 150, '{"type": "total_distance_km", "threshold": 100}'::jsonb),
  ('2c0ac6d6-13f7-4532-afb0-b724059ff2c6', 'maratonista', 'Maratonista', 'Complete uma corrida de mais de 21km', '🏅', 'milestone', 3, 150, '{"km": 21, "type": "distance"}'::jsonb),
  ('527cae8e-8dca-44d0-9153-3388d1a06df8', 'subidor', 'Subidor', 'Completou uma corrida com 500 m ou mais de elevação acumulada.', 'shield_teal_3', 'milestone', 3, 150, '{"type": "single_elevation_m", "threshold": 500}'::jsonb),
  ('a8458efe-a02a-4105-80b2-c975b394e3a7', 'maratona_completa', 'Maratonista Completo', 'Completou uma corrida de maratona (42,195 km).', 'shield_orange_4', 'milestone', 4, 200, '{"type": "single_distance_km", "threshold": 42.195}'::jsonb),
  ('4d879e0d-8f1a-4b90-962e-34a3aede08f2', 'quinhentos_km', 'Meio Milhar', 'Acumulou 500 km de corrida no total.', 'shield_blue_4', 'milestone', 4, 200, '{"type": "total_distance_km", "threshold": 500}'::jsonb),
  ('9cc83b61-01fe-4d34-9ccf-c52ec51197a2', 'alpinista', 'Alpinista', 'Acumulou 5.000 m de elevação no histórico total de corridas.', 'shield_teal_5', 'milestone', 5, 300, '{"type": "total_elevation_m", "threshold": 5000}'::jsonb),
  ('4d8e9f1b-12f2-4359-b1a2-225e5201a75d', 'mil_km', 'Milha de Ouro', 'Acumulou 1.000 km de corrida no total.', 'shield_blue_5', 'milestone', 5, 300, '{"type": "total_distance_km", "threshold": 1000}'::jsonb),

-- ─── performance ─────────────────────────────────────────────────────────────
  ('b8f57acd-cea0-4826-ac04-cbb963f1a84e', 'uma_hora', 'Hora da Verdade', 'Completou uma corrida com duração de pelo menos 1 hora.', 'shield_purple_2', 'performance', 2, 100, '{"type": "single_duration_min", "threshold": 60}'::jsonb),
  ('56282243-86a3-4b3a-af5d-db16de8c9d37', 'velocista_i', 'Velocista I', 'Atinja pace abaixo de 5:30/km em uma corrida de 5K', '⚡', 'performance', 2, 100, '{"pace": 5.5, "type": "pace_5k"}'::jsonb),
  ('48819024-d473-4df6-a058-c6ccfe74d4ac', 'duas_horas', 'Dois Tempos', 'Completou uma corrida com duração de pelo menos 2 horas.', 'shield_purple_3', 'performance', 3, 200, '{"type": "single_duration_min", "threshold": 120}'::jsonb),
  ('d1f3332e-f1c2-4685-8be7-b8650b4e875f', 'superacao', 'Superação', 'Melhore seu pace em 5% em 30 dias', '📈', 'performance', 3, 150, '{"type": "pace_improvement", "percentage": 5}'::jsonb),
  ('104092a5-6d3c-4572-9786-ad3c4b22e7c0', 'velocista_ii', 'Velocista II', 'Atinja pace abaixo de 5:00/km em uma corrida de 5K', '⚡', 'performance', 3, 150, '{"pace": 5, "type": "pace_5k"}'::jsonb),
  ('d8171b0d-98f7-49b7-8d76-45088cfd4f7b', 'velocista_iii', 'Velocista III', 'Correu 5 km ou mais com pace abaixo de 4:30/km.', 'shield_red_3', 'performance', 3, 200, '{"type": "pace_on_distance", "max_pace_min_km": 4.5, "min_distance_km": 5}'::jsonb),
  ('fde667cd-ac57-4c82-837e-6ba2d5c88553', 'velocista_iv', 'Velocista IV', 'Correu 5 km ou mais com pace abaixo de 4:00/km.', 'shield_red_4', 'performance', 4, 250, '{"type": "pace_on_distance", "max_pace_min_km": 4.0, "min_distance_km": 5}'::jsonb),
  ('b29edf4b-6f4d-4124-b5be-702d7ca6818f', 'foguete', 'Foguete', 'Manteve pace abaixo de 3:30/km em uma corrida.', 'shield_red_5', 'performance', 5, 300, '{"type": "pace_on_distance", "max_pace_min_km": 3.5, "min_distance_km": 1}'::jsonb),

-- ─── streak ──────────────────────────────────────────────────────────────────
  ('a78c46ea-9d70-4406-a116-9f08bba1aa3b', 'ignicao', 'Ignição', 'Manteve uma sequência ativa de 7 dias de treino.', 'shield_amber_1', 'streak', 1, 80, '{"type": "current_streak", "threshold": 7}'::jsonb),
  ('a7d117df-27b2-4295-ad1a-fa577ad33587', 'chama_viva', 'Chama Viva', 'Manteve uma sequência ativa de 14 dias de treino.', 'shield_amber_2', 'streak', 2, 120, '{"type": "current_streak", "threshold": 14}'::jsonb),
  ('7fa13b55-99aa-4558-94e3-9938a6bd565f', 'chama_eterna', 'Chama Eterna', 'Mantenha streak de 30 dias consecutivos', '🔥', 'streak', 4, 200, '{"days": 30, "type": "streak"}'::jsonb),
  ('162302a8-d02f-4946-870c-875f6ae11c1c', 'imortal', 'Imortal', 'Manteve uma sequência ativa de 60 dias de treino.', 'shield_amber_5', 'streak', 5, 250, '{"type": "current_streak", "threshold": 60}'::jsonb)

ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- VERIFICAÇÃO — deve retornar 29 / 29
-- =============================================================================
select count(*) as total, count(distinct slug) as slugs_unicos from public.badges;
