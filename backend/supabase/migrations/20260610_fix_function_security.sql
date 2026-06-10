-- ============================================================================
-- Security hardening for public SECURITY DEFINER functions (audit item I6)
--
-- Two problems flagged by the Supabase security advisor:
--   1) anon/authenticated can EXECUTE SECURITY DEFINER functions via PostgREST
--      RPC (/rest/v1/rpc/<fn>) that should be internal/trigger-only.
--   2) functions with a mutable search_path are vulnerable to search_path
--      hijacking — pin them to `public`.
--
-- Idempotent: REVOKE is safe to re-run; ALTER FUNCTION ... SET search_path is
-- idempotent; both are wrapped to no-op when the function does not exist.
-- Run on BOTH production (ndlsxgsccyjspbhzccyp) and staging (gcaozgnevvmnlxnkfthh).
-- ============================================================================

-- ── 1. Revoke RPC EXECUTE from anon/authenticated on internal functions ──────
-- These are invoked by triggers / the service role only; no client should call
-- them directly. Guarded with to_regprocedure so a missing function is skipped.
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
  END IF;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
  END IF;

  IF to_regprocedure('public.sync_points_to_user_xp()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.sync_points_to_user_xp() FROM anon, authenticated;
  END IF;
END $$;

-- ── 2. Pin search_path = public on functions flagged as mutable ──────────────
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  END IF;

  IF to_regprocedure('public.update_connected_devices_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.update_connected_devices_updated_at() SET search_path = public;
  END IF;

  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;

  IF to_regprocedure('public.calculate_level_from_points(bigint)') IS NOT NULL THEN
    ALTER FUNCTION public.calculate_level_from_points(bigint) SET search_path = public;
  END IF;

  IF to_regprocedure('public.generate_race_slug()') IS NOT NULL THEN
    ALTER FUNCTION public.generate_race_slug() SET search_path = public;
  END IF;

  IF to_regprocedure('public.shift_pending_workouts(uuid, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.shift_pending_workouts(uuid, integer) SET search_path = public;
  END IF;

  IF to_regprocedure('public.sync_points_to_user_xp()') IS NOT NULL THEN
    ALTER FUNCTION public.sync_points_to_user_xp() SET search_path = public;
  END IF;
END $$;
