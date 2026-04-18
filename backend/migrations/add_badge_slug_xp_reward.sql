-- Migration: add_badge_slug_xp_reward
-- Adds stable slug identifier and per-badge XP reward to badges table.
-- slug is used by gamification.service.ts so badge names can be freely edited.

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS slug       TEXT,
  ADD COLUMN IF NOT EXISTS xp_reward  INTEGER NOT NULL DEFAULT 100;

-- Backfill slugs and calibrated XP for the original 10 badges
UPDATE public.badges SET slug = 'primeiro_passo',    xp_reward = 50  WHERE name = 'Primeiro Passo';
UPDATE public.badges SET slug = 'maratonista',        xp_reward = 150 WHERE name = 'Maratonista';
UPDATE public.badges SET slug = 'velocista_i',        xp_reward = 100 WHERE name = 'Velocista I';
UPDATE public.badges SET slug = 'velocista_ii',       xp_reward = 150 WHERE name = 'Velocista II';
UPDATE public.badges SET slug = 'superacao',          xp_reward = 150 WHERE name = 'Superação';
UPDATE public.badges SET slug = 'consistente',        xp_reward = 120 WHERE name = 'Consistente';
UPDATE public.badges SET slug = 'semana_completa',    xp_reward = 80  WHERE name = 'Semana Completa';
UPDATE public.badges SET slug = 'chama_eterna',       xp_reward = 200 WHERE name = 'Chama Eterna';
UPDATE public.badges SET slug = 'na_chuva_e_no_sol',  xp_reward = 100 WHERE name = 'Na Chuva e no Sol';
UPDATE public.badges SET slug = 'fiel_ao_plano',      xp_reward = 150 WHERE name = 'Fiel ao Plano';

-- Rename the misleading badge (name only — slug stays for FK safety in user_badges)
UPDATE public.badges SET name = 'Coruja e Cotovia',
  description = 'Treinou em todos os 5 períodos do dia: madrugada, manhã, tarde, fim de tarde e noite.'
WHERE slug = 'na_chuva_e_no_sol';

-- Enforce uniqueness and NOT NULL after backfill
ALTER TABLE public.badges
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT badges_slug_unique UNIQUE (slug);

-- Index for fast lookup by slug
CREATE INDEX IF NOT EXISTS idx_badges_slug ON public.badges (slug);
