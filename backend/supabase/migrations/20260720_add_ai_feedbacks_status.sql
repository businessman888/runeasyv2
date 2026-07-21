-- Migration: Add generation `status` to ai_feedbacks
-- Date: 2026-07-20
-- Description:
--   Until now `ai_feedbacks` had no lifecycle state: a row either existed
--   (feedback ready) or it didn't (mobile shows "Análise em preparo…").
--   There was no way to represent "processing", "failed" or "skipped", so
--   any failure mode — BullMQ job exhausted its retries, AI daily quota
--   exceeded, activity row never linked, offline completion degraded to a
--   free run — left NO row, and the coach card stayed "em preparo" forever
--   with no retry affordance and no self-healing (the stores are not
--   persisted; the card faithfully mirrors the server, which genuinely has
--   no feedback row).
--
--   This adds an explicit lifecycle so the app can:
--     - show a real "processing" state right after completion,
--     - surface "failed"/"skipped" with a "Tentar novamente" action,
--     - poll a status endpoint to route to CoachAnalysis when ready.
--
--   `status` defaults to 'completed' so every PRE-EXISTING row (which only
--   ever existed because generation succeeded) stays valid without a
--   backfill. New in-flight rows are inserted as 'processing' and updated
--   to 'completed' / 'failed' by the worker, or inserted as 'skipped' when
--   the enqueue is intentionally skipped.

ALTER TABLE public.ai_feedbacks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS status_reason text;

-- Guard the allowed values. Named constraint so it is idempotent-ish across
-- re-runs (drop first if present).
ALTER TABLE public.ai_feedbacks
  DROP CONSTRAINT IF EXISTS ai_feedbacks_status_check;
ALTER TABLE public.ai_feedbacks
  ADD CONSTRAINT ai_feedbacks_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'skipped'));

-- Status endpoint / home card resolve feedback by activity or workout and
-- prefer the completed row. Index the lookup dimensions.
CREATE INDEX IF NOT EXISTS idx_ai_feedbacks_activity_status
  ON public.ai_feedbacks (activity_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_feedbacks_workout_status
  ON public.ai_feedbacks (workout_id, status);
