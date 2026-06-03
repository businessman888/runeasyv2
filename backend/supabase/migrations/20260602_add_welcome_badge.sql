-- P2: the onboarding screen shows "Badge de Boas-Vindas: CONQUISTADO" but no
-- badge row backed it. Seed a real welcome badge so awarding it is honest.
-- xp_reward = 0 because onboarding XP is credited separately
-- (TrainingController.creditOnboardingXP) — this avoids double-crediting XP.
insert into public.badges (type, name, description, tier, icon, slug, xp_reward, criteria)
values (
  'milestone',
  'Boas-Vindas',
  'Concluiu o onboarding e começou a jornada no RunEasy.',
  1,
  '🏆',
  'welcome',
  0,
  '{}'::jsonb
)
on conflict (slug) do nothing;
