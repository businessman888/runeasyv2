alter table public.user_badges
  add column if not exists activity_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_badges_activity_id_fkey'
      and conrelid = 'public.user_badges'::regclass
  ) then
    alter table public.user_badges
      add constraint user_badges_activity_id_fkey
      foreign key (activity_id)
      references public.activities(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_user_badges_user_activity
  on public.user_badges (user_id, activity_id)
  where activity_id is not null;
