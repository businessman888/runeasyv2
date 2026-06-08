-- =============================================================================
-- Staging schema parity — functions + triggers (extracted 1:1 from production)
-- =============================================================================
-- The staging Supabase project (gcaozgnevvmnlxnkfthh) was created with the
-- TABLES but WITHOUT the functions/triggers that live in production
-- (ndlsxgsccyjspbhzccyp). The most visible symptom: Google/Apple login succeeds
-- in auth.users but no public.users profile row is created, so GET /users/:id
-- returns 0 rows and the app logs the user straight back out.
--
-- Run this in the STAGING SQL editor. It is fully idempotent
-- (CREATE OR REPLACE / DROP TRIGGER IF EXISTS), so re-running is safe and it is
-- also safe to apply to production (which already matches).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- FUNCTIONS
-- ----------------------------------------------------------------------------

-- Creates the public.users profile row whenever a new auth user signs up.
-- THIS is the one that unblocks login.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  insert into public.users (id, email, onboarding_completed)
  values (new.id, new.email, false);
  return new;
end;
$$;

-- XP/level math used by the points→XP sync trigger.
CREATE OR REPLACE FUNCTION public.calculate_level_from_points(p_total_points bigint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
$$;

-- Auto-generates a unique, accent-stripped slug for races on insert.
CREATE OR REPLACE FUNCTION public.generate_race_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  base_slug := lower(
    regexp_replace(
      regexp_replace(
        translate(
          NEW.name,
          'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
          'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
        ),
        '[^a-z0-9\s-]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  );

  base_slug := base_slug || '-' || EXTRACT(YEAR FROM NEW.race_date)::TEXT;

  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM races WHERE slug = final_slug AND id != NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter::TEXT;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

-- Shifts pending workouts by N days (used by reschedule flows).
CREATE OR REPLACE FUNCTION public.shift_pending_workouts(p_plan_id uuid, p_days integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
declare v_count integer;
begin
  update public.workouts set scheduled_date = scheduled_date + p_days
   where plan_id = p_plan_id and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keeps users.total_xp and user_levels in sync whenever points are awarded.
CREATE OR REPLACE FUNCTION public.sync_points_to_user_xp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_total BIGINT;
BEGIN
    UPDATE public.users
    SET total_xp = COALESCE(total_xp, 0) + NEW.points
    WHERE id = NEW.user_id
    RETURNING total_xp INTO v_new_total;

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
$$;

-- Generic updated_at touch functions.
CREATE OR REPLACE FUNCTION public.update_connected_devices_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Security hardening: auto-enables RLS on any new public table (DDL event
-- trigger). Optional, but production has it — keep parity.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

-- *** The one that fixes login ***
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trigger_connected_devices_updated_at ON public.connected_devices;
CREATE TRIGGER trigger_connected_devices_updated_at
BEFORE UPDATE ON public.connected_devices
FOR EACH ROW EXECUTE FUNCTION public.update_connected_devices_updated_at();

DROP TRIGGER IF EXISTS trg_points_history_sync_xp ON public.points_history;
CREATE TRIGGER trg_points_history_sync_xp
AFTER INSERT ON public.points_history
FOR EACH ROW EXECUTE FUNCTION public.sync_points_to_user_xp();

DROP TRIGGER IF EXISTS generate_races_slug ON public.races;
CREATE TRIGGER generate_races_slug
BEFORE INSERT ON public.races
FOR EACH ROW WHEN (new.slug IS NULL) EXECUTE FUNCTION public.generate_race_slug();

DROP TRIGGER IF EXISTS update_races_updated_at ON public.races;
CREATE TRIGGER update_races_updated_at
BEFORE UPDATE ON public.races
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Event trigger for rls_auto_enable (parity with production).
DROP EVENT TRIGGER IF EXISTS rls_auto_enable_evt;
CREATE EVENT TRIGGER rls_auto_enable_evt
ON ddl_command_end
EXECUTE FUNCTION public.rls_auto_enable();

-- ----------------------------------------------------------------------------
-- BACKFILL — create profile rows for any auth users that signed up BEFORE the
-- trigger existed (e.g. the test user that got bounced back to the landing).
-- ----------------------------------------------------------------------------
insert into public.users (id, email, onboarding_completed)
select u.id, u.email, false
from auth.users u
left join public.users p on p.id = u.id
where p.id is null;
