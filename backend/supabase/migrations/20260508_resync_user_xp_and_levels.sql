-- Migration: resync user XP across users.total_xp and user_levels.total_points
-- Root cause: addPoints() does read-then-write on user_levels (upsert with pre-calculated total),
-- causing race conditions when called multiple times in sequence (e.g., awardWorkoutXP).
-- users.total_xp stays correct because trg_points_history_sync_xp uses atomic UPDATE += N,
-- but user_levels.total_points gets overwritten with stale values.
--
-- Fix: extend the trigger to atomically sync user_levels.total_points AND current_level,
-- making the trigger the single canonical writer. Backfill existing rows.

-- 1. Backfill: ensure user_levels row exists for every user with points
INSERT INTO public.user_levels (user_id, total_points, current_level, current_streak, best_streak)
SELECT u.id, COALESCE(u.total_xp, 0), 1, COALESCE(u.current_streak, 0), 0
FROM public.users u
LEFT JOIN public.user_levels ul ON ul.user_id = u.id
WHERE ul.user_id IS NULL;

-- 2. Resync user_levels.total_points from authoritative users.total_xp
--    (users.total_xp is correct because of existing atomic trigger)
UPDATE public.user_levels ul
SET total_points = u.total_xp,
    updated_at = now()
FROM public.users u
WHERE ul.user_id = u.id
  AND COALESCE(u.total_xp, 0) <> COALESCE(ul.total_points, 0);

-- 3. Index for ranking queries via user_levels
CREATE INDEX IF NOT EXISTS idx_user_levels_total_points_desc
  ON public.user_levels (total_points DESC)
  WHERE total_points > 0;

-- 4. Helper: calculate level from total_points (matches gamification.service.ts logic)
--    Each level requires 1000 + (level-1)*100 cumulative points.
CREATE OR REPLACE FUNCTION public.calculate_level_from_points(p_total_points BIGINT)
RETURNS INT AS $$
DECLARE
    v_level INT := 1;
    v_cumulative BIGINT := 0;
BEGIN
    LOOP
        v_cumulative := v_cumulative + 1000 + (v_level - 1) * 100;
        IF v_cumulative > COALESCE(p_total_points, 0) THEN
            RETURN v_level;
        END IF;
        v_level := v_level + 1;
        IF v_level > 200 THEN  -- safety cap
            RETURN 200;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Recompute current_level for all existing user_levels rows
UPDATE public.user_levels
SET current_level = public.calculate_level_from_points(total_points),
    updated_at = now()
WHERE current_level <> public.calculate_level_from_points(total_points);

-- 6. Replace trigger function: sync points_history INSERT to BOTH users.total_xp and user_levels
CREATE OR REPLACE FUNCTION public.sync_points_to_user_xp()
RETURNS TRIGGER AS $$
DECLARE
    v_new_total BIGINT;
BEGIN
    -- Atomic increment on users.total_xp (preserves existing behavior)
    UPDATE public.users
    SET total_xp = COALESCE(total_xp, 0) + NEW.points
    WHERE id = NEW.user_id
    RETURNING total_xp INTO v_new_total;

    -- Atomic upsert + increment on user_levels.total_points (race-free)
    INSERT INTO public.user_levels (user_id, total_points, current_level, updated_at)
    VALUES (
        NEW.user_id,
        NEW.points,
        public.calculate_level_from_points(NEW.points),
        now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET total_points = public.user_levels.total_points + NEW.points,
        current_level = public.calculate_level_from_points(public.user_levels.total_points + NEW.points),
        updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger is already attached by add_ranking_system.sql; the CREATE OR REPLACE above
-- updates the function in place. No need to re-create the trigger.
