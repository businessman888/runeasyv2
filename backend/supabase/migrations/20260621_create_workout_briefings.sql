-- Migration: Create workout_briefings table for on-demand deep-dive coach briefings
-- Date: 2026-06-21
-- Description: Stores the AI-generated "deep dive" briefing for a workout (Pro feature).
--              One briefing per workout (workout_id UNIQUE) — generated once, on demand,
--              and persisted so revisiting the workout detail never re-calls the AI.

CREATE TABLE IF NOT EXISTS workout_briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL UNIQUE REFERENCES public.workouts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,                  -- the generated briefing (plain text)
    athlete_level TEXT,                     -- level at generation time (audit/debug)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only read their own briefings; backend writes via service role.
ALTER TABLE workout_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout briefings"
    ON workout_briefings FOR SELECT
    USING (auth.uid() = user_id);

-- Service role bypass (backend uses service role key for generate/persist)
CREATE POLICY "Service role full access"
    ON workout_briefings FOR ALL
    USING (auth.role() = 'service_role');

-- Index for the per-user / per-workout lookups done on screen load
CREATE INDEX IF NOT EXISTS idx_workout_briefings_user_workout
    ON workout_briefings(user_id, workout_id);
