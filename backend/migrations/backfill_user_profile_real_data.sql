-- Migration: Backfill user profile with real Google OAuth and onboarding data
-- Date: 2026-03-24
-- Description: Copies full_name/avatar_url from auth.users metadata and
--              birth_date/weight/height from user_onboarding into public.users.profile JSONB

-- 1. Sync Google OAuth metadata (full_name, avatar_url) from auth.users to public.users.profile
UPDATE public.users u
SET profile = COALESCE(u.profile, '{}'::jsonb)
    || jsonb_build_object(
        'full_name', COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''),
        'avatar_url', COALESCE(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture', ''),
        'profile_pic', COALESCE(au.raw_user_meta_data->>'avatar_url', au.raw_user_meta_data->>'picture', ''),
        'firstname', split_part(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''), ' ', 1),
        'lastname', CASE
            WHEN position(' ' IN COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')) > 0
            THEN substring(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') FROM position(' ' IN COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')) + 1)
            ELSE ''
        END
    ),
    updated_at = NOW()
FROM auth.users au
WHERE u.id = au.id
AND (u.profile->>'full_name' IS NULL OR u.profile->>'full_name' = '');

-- 2. Sync onboarding biometrics (birth_date, weight_kg, height_cm) from user_onboarding to users.profile
UPDATE public.users u
SET profile = COALESCE(u.profile, '{}'::jsonb)
    || jsonb_build_object(
        'birth_date', uo.birth_date,
        'weight_kg', uo.weight,
        'height_cm', uo.height
    ),
    updated_at = NOW()
FROM user_onboarding uo
WHERE u.id = uo.user_id
AND uo.weight IS NOT NULL
AND (u.profile->>'weight_kg' IS NULL);
