-- ============================================================================
-- Align public.handle_new_user() across staging and production.
--
-- Divergence found during launch prep: staging's trigger populated public.users
-- .profile (full_name / firstname / lastname + avatar) from the new auth user's
-- raw_user_meta_data, while production's only inserted id/email and left profile
-- as '{}'. For SOCIAL login the backend backfills the profile via the service
-- role afterwards, so prod looked fine — but the EMAIL/PASSWORD sign-up flow is
-- client-side (no backend step), so on prod those users would land with an empty
-- profile until onboarding. This adopts staging's richer version everywhere.
--
-- Safe & idempotent: CREATE OR REPLACE keeps the existing on_auth_user_created
-- trigger and existing ACLs; the REVOKE re-asserts the I6 hardening in case the
-- function is ever recreated fresh. Pins search_path = public (no regression to
-- the function_search_path_mutable advisor fixed in 20260610).
-- Run on BOTH production (ndlsxgsccyjspbhzccyp) and staging (gcaozgnevvmnlxnkfthh).
-- (Running on staging is a no-op — it already has this body.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_full_name text;
  v_avatar    text;
  v_first     text;
  v_last      text;
  v_profile   jsonb := '{}'::jsonb;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
  v_avatar    := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '');

  if v_full_name <> '' then
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := btrim(substring(v_full_name from char_length(v_first) + 1));
    v_profile := v_profile || jsonb_build_object(
      'full_name', v_full_name,
      'firstname', v_first,
      'lastname',  coalesce(v_last, '')
    );
  end if;

  if v_avatar <> '' then
    v_profile := v_profile || jsonb_build_object(
      'avatar_url',  v_avatar,
      'profile_pic', v_avatar
    );
  end if;

  insert into public.users (id, email, profile, onboarding_completed)
  values (new.id, new.email, v_profile, false);
  return new;
end;
$$;

-- Re-assert I6 hardening (no client should RPC this trigger-only function).
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
  END IF;
END $$;
