-- Re-anchor support (Q3): atomically shift the scheduled_date of a plan's
-- PENDING workouts forward by a fixed number of days. Used by
-- TrainingService.reanchorPendingWorkoutsToToday() when a lapsed Pro
-- reactivates, so the frozen plan resumes from today. The caller passes a
-- multiple of 7 so each session keeps the weekday the user picked.
--
-- `scheduled_date` is a DATE column, and `date + integer` stays a DATE in
-- Postgres (no timestamp coercion). Returns the number of rows updated.
create or replace function public.shift_pending_workouts(
  p_plan_id uuid,
  p_days integer
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.workouts
     set scheduled_date = scheduled_date + p_days
   where plan_id = p_plan_id
     and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Server-only: the backend calls this with the service role key. Keep it off
-- the Data API so anon/authenticated clients can't shift other users' plans.
revoke all on function public.shift_pending_workouts(uuid, integer) from public;
grant execute on function public.shift_pending_workouts(uuid, integer) to service_role;
