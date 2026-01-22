-- Migration: Update readiness_history to backfill set_number for existing records
-- Purpose: Assign sequential set_numbers to old records that don't have one
-- This ensures the exclusion logic works correctly for users with pre-existing history

-- Option 1: Assign set_number = 1 to all old records (simple, treats as if all used Set #1)
-- UPDATE readiness_history SET set_number = 1 WHERE set_number IS NULL;

-- Option 2: Assign random set_numbers between 1-10 to old records (distributes load)
UPDATE readiness_history 
SET set_number = floor(random() * 10 + 1)::int 
WHERE set_number IS NULL;

-- Verify the update
SELECT user_id, set_number, created_at 
FROM readiness_history 
ORDER BY created_at DESC 
LIMIT 20;
