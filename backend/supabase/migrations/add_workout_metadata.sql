-- Migration: Add metadata JSONB column to workouts table
-- Date: 2026-05-12
-- Description: Adds an opcional metadata column to persist Daniels-based
-- enriched context for each workout: dominant zone (Z1-Z5), perceived effort,
-- scientific note, week phase, and per-segment zones/descriptions.
--
-- Workouts created before this migration remain valid: metadata stays NULL
-- and the mobile client renders the existing (legacy) layout for them.
-- Idempotente.

ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

COMMENT ON COLUMN workouts.metadata IS
  'Enriched workout context: { zone, perceived_effort, scientific_note, week_phase, segment_descriptions[] }. NULL for legacy workouts.';
