-- Race Goal feature (Fase 2) — onboarding can now target a real race.
--
-- A user may pick a race from the `races` table (consumed via the `active_races`
-- view) as their training goal. This anchors the generated plan to the race date
-- (taper/peak periodization) and produces the "Atleta de Prova" archetype.
--
-- goal_type      : 'distance' (legacy distance goal) | 'race' (specific race goal)
-- race_id        : FK to races(id); NULL when the user entered the date manually
-- race_date      : denormalized race date (avoids a join when generating the plan)
-- race_name      : denormalized race name
-- race_distance  : the distance (km) the user will run in that race
--
-- workouts.is_race_day : TRUE only for the placeholder workout on race day.
--
-- All columns are additive and nullable (or defaulted), so this migration is
-- non-destructive and safe to run on live tables. RLS policies already in place
-- on these tables cover the new columns (no row-shape change).

ALTER TABLE user_onboarding
  ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'distance',
  ADD COLUMN IF NOT EXISTS race_id UUID REFERENCES races(id),
  ADD COLUMN IF NOT EXISTS race_date DATE,
  ADD COLUMN IF NOT EXISTS race_name TEXT,
  ADD COLUMN IF NOT EXISTS race_distance DECIMAL(6,2);

ALTER TABLE training_plans
  ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'distance',
  ADD COLUMN IF NOT EXISTS race_id UUID REFERENCES races(id),
  ADD COLUMN IF NOT EXISTS race_date DATE,
  ADD COLUMN IF NOT EXISTS race_name TEXT,
  ADD COLUMN IF NOT EXISTS race_distance DECIMAL(6,2);

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS is_race_day BOOLEAN DEFAULT FALSE;

-- Fast lookup of users with a race goal.
CREATE INDEX IF NOT EXISTS idx_user_onboarding_race_goal
  ON user_onboarding (race_id) WHERE race_id IS NOT NULL;

-- Fast lookup of the race-day workout within a plan.
CREATE INDEX IF NOT EXISTS idx_workouts_race_day
  ON workouts (plan_id, is_race_day) WHERE is_race_day = TRUE;
