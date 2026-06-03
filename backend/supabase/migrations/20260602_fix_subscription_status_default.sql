-- P2 hygiene: 'trial' was the default for users.subscription_status, so every
-- Free signup looked like a (meaningless) trial — confusing audits and the UI
-- (status='trial' + plan='free', no trial dates). Reserve 'trial' for real Pro
-- trials, which the RevenueCat webhook sets on period_type=TRIAL
-- (handleActivation). Free users default to 'active'.
alter table public.users
  alter column subscription_status set default 'active';

-- Backfill existing Free users carrying the old default with no real trial.
update public.users
   set subscription_status = 'active'
 where subscription_plan = 'free'
   and subscription_status = 'trial'
   and trial_started_at is null;
