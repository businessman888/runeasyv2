-- Migration: add_new_badges_v2
-- Seeds 18 new badges expanding the catalog from 10 to 28.
-- Depends on: add_badge_slug_xp_reward.sql (slug column must exist)

INSERT INTO public.badges (name, slug, description, icon, type, tier, xp_reward, criteria) VALUES

-- ─── Milestone: distância acumulada ───────────────────────────────────────
('Cinquenta',
 'cinquenta_km',
 'Acumulou 50 km de corrida no total.',
 'shield_blue_2', 'milestone', 2, 100,
 '{"type": "total_distance_km", "threshold": 50}'),

('Centurião',
 'centuriao',
 'Acumulou 100 km de corrida no total.',
 'shield_blue_3', 'milestone', 3, 150,
 '{"type": "total_distance_km", "threshold": 100}'),

('Meio Milhar',
 'quinhentos_km',
 'Acumulou 500 km de corrida no total.',
 'shield_blue_4', 'milestone', 4, 200,
 '{"type": "total_distance_km", "threshold": 500}'),

('Milha de Ouro',
 'mil_km',
 'Acumulou 1.000 km de corrida no total.',
 'shield_blue_5', 'milestone', 5, 300,
 '{"type": "total_distance_km", "threshold": 1000}'),

('Maratonista Completo',
 'maratona_completa',
 'Completou uma corrida de maratona (42,195 km).',
 'shield_orange_4', 'milestone', 4, 200,
 '{"type": "single_distance_km", "threshold": 42.195}'),

-- ─── Milestone: elevação ──────────────────────────────────────────────────
('Subidor',
 'subidor',
 'Completou uma corrida com 500 m ou mais de elevação acumulada.',
 'shield_teal_3', 'milestone', 3, 150,
 '{"type": "single_elevation_m", "threshold": 500}'),

('Alpinista',
 'alpinista',
 'Acumulou 5.000 m de elevação no histórico total de corridas.',
 'shield_teal_5', 'milestone', 5, 300,
 '{"type": "total_elevation_m", "threshold": 5000}'),

-- ─── Performance: pace ────────────────────────────────────────────────────
('Velocista III',
 'velocista_iii',
 'Correu 5 km ou mais com pace abaixo de 4:30/km.',
 'shield_red_3', 'performance', 3, 200,
 '{"type": "pace_on_distance", "max_pace_min_km": 4.5, "min_distance_km": 5}'),

('Velocista IV',
 'velocista_iv',
 'Correu 5 km ou mais com pace abaixo de 4:00/km.',
 'shield_red_4', 'performance', 4, 250,
 '{"type": "pace_on_distance", "max_pace_min_km": 4.0, "min_distance_km": 5}'),

('Foguete',
 'foguete',
 'Manteve pace abaixo de 3:30/km em uma corrida.',
 'shield_red_5', 'performance', 5, 300,
 '{"type": "pace_on_distance", "max_pace_min_km": 3.5, "min_distance_km": 1}'),

-- ─── Performance: tempo de corrida ────────────────────────────────────────
('Hora da Verdade',
 'uma_hora',
 'Completou uma corrida com duração de pelo menos 1 hora.',
 'shield_purple_2', 'performance', 2, 100,
 '{"type": "single_duration_min", "threshold": 60}'),

('Dois Tempos',
 'duas_horas',
 'Completou uma corrida com duração de pelo menos 2 horas.',
 'shield_purple_3', 'performance', 3, 200,
 '{"type": "single_duration_min", "threshold": 120}'),

-- ─── Streak: progressão ───────────────────────────────────────────────────
('Ignição',
 'ignicao',
 'Manteve uma sequência ativa de 7 dias de treino.',
 'shield_amber_1', 'streak', 1, 80,
 '{"type": "current_streak", "threshold": 7}'),

('Chama Viva',
 'chama_viva',
 'Manteve uma sequência ativa de 14 dias de treino.',
 'shield_amber_2', 'streak', 2, 120,
 '{"type": "current_streak", "threshold": 14}'),

('Imortal',
 'imortal',
 'Manteve uma sequência ativa de 60 dias de treino.',
 'shield_amber_5', 'streak', 5, 250,
 '{"type": "current_streak", "threshold": 60}'),

-- ─── Exploration: hábitos ─────────────────────────────────────────────────
('Madrugador',
 'madrugador',
 'Completou 5 corridas iniciadas entre 05h e 07h da manhã.',
 'shield_indigo_2', 'exploration', 2, 100,
 '{"type": "runs_in_time_window", "hour_from": 5, "hour_to": 7, "threshold": 5}'),

('Corredor Noturno',
 'noturno',
 'Completou 5 corridas iniciadas após as 20h.',
 'shield_indigo_2', 'exploration', 2, 100,
 '{"type": "runs_in_time_window", "hour_from": 20, "hour_to": 24, "threshold": 5}'),

('Diversificado',
 'diversificado',
 'Treinou em todos os 7 dias da semana ao longo do histórico.',
 'shield_indigo_3', 'exploration', 3, 150,
 '{"type": "all_weekdays_covered", "threshold": 7}')

ON CONFLICT (slug) DO NOTHING;
