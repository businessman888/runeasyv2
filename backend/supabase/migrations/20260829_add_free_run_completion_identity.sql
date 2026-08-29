-- Stable identity for free-run completion.
--
-- The old flow inserted a pending workout before the activity existed. A
-- retry during that window could insert another pending row because the only
-- dedupe lookup was activities.external_id. Claiming the workout itself by
-- (user_id, completion_external_id) makes retries and concurrent deliveries
-- converge on one entity.

alter table public.workouts
  add column if not exists completion_external_id text,
  add column if not exists completion_processing_id text,
  add column if not exists completion_processing_started_at timestamptz;

with ranked_candidates as (
  select
    workout.id as workout_id,
    activity.external_id,
    row_number() over (
      partition by workout.user_id, activity.external_id
      order by workout.completed_at desc nulls last, workout.id
    ) as identity_rank
  from public.workouts as workout
  join public.activities as activity
    on activity.id = workout.activity_id
   and activity.user_id = workout.user_id
  where workout.source = 'free'
    and workout.completion_external_id is null
    and activity.external_id is not null
)
update public.workouts as workout
set completion_external_id = candidate.external_id
from ranked_candidates as candidate
where workout.id = candidate.workout_id
  and candidate.identity_rank = 1;

create unique index if not exists workouts_user_completion_external_id_uidx
  on public.workouts (user_id, completion_external_id)
  where completion_external_id is not null;

create index if not exists workouts_completion_processing_idx
  on public.workouts (user_id, completion_processing_id)
  where completion_processing_id is not null;
