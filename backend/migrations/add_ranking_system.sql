-- Migration: add_ranking_system
-- Adds total_xp, current_streak, last_activity_date to users table
-- Creates trigger to auto-sync points_history inserts to users.total_xp
-- Creates indexes for fast ranking queries

-- 1. Add ranking columns to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS total_xp BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- 2. Indexes for ranking queries
CREATE INDEX IF NOT EXISTS idx_users_total_xp_desc ON public.users (total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users (created_at);

-- 3. Trigger function: on INSERT to points_history, sync points to users.total_xp
CREATE OR REPLACE FUNCTION public.sync_points_to_user_xp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET total_xp = COALESCE(total_xp, 0) + NEW.points
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach trigger to points_history
DROP TRIGGER IF EXISTS trg_points_history_sync_xp ON public.points_history;
CREATE TRIGGER trg_points_history_sync_xp
  AFTER INSERT ON public.points_history
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_points_to_user_xp();

-- 5. Backfill: sync existing points_history data to users.total_xp
UPDATE public.users u
SET total_xp = COALESCE(sub.total, 0)
FROM (
  SELECT user_id, SUM(points) as total
  FROM public.points_history
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id;
