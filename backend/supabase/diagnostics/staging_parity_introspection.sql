-- =============================================================================
-- STAGING parity introspection — run in the STAGING SQL editor
-- (project gcaozgnevvmnlxnkfthh) and paste the single JSON result back.
-- Read-only. Diffed against the production manifest captured from
-- ndlsxgsccyjspbhzccyp.
--
-- PREFERRED: run the ONE consolidated query below — it returns a single row /
-- single JSON with every section, so you paste once. (The Supabase SQL editor
-- only shows the LAST statement's result, so a single query is ideal.)
-- =============================================================================

select jsonb_pretty(jsonb_build_object(
  'extensions', (select jsonb_agg(extname || ' ' || extversion order by extname) from pg_extension),

  'tables', (select jsonb_object_agg(c.relname, c.relrowsecurity)
             from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind='r'),

  'columns', (select jsonb_object_agg(table_name, cols) from (
                select table_name,
                       string_agg(column_name || ' ' || data_type || case when is_nullable='NO' then ' NN' else '' end, ', ' order by ordinal_position) as cols
                from information_schema.columns
                where table_schema='public' group by table_name) t),

  'functions', (select jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname)
                from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public'),

  'triggers', (select jsonb_agg(n.nspname || '.' || c.relname || '.' || t.tgname order by n.nspname, c.relname, t.tgname)
               from pg_trigger t
               join pg_class c on c.oid=t.tgrelid
               join pg_namespace n on n.oid=c.relnamespace
               where not t.tgisinternal and n.nspname in ('public','auth')),

  'event_triggers', (select jsonb_agg(evtname order by evtname) from pg_event_trigger),

  'policies', (select jsonb_object_agg(tablename, pols) from (
                 select tablename,
                        string_agg(policyname || ' [' || cmd || '/' || array_to_string(roles,'|') || ']', ' :: ' order by policyname) as pols
                 from pg_policies where schemaname='public' group by tablename) t),

  'indexes', (select jsonb_object_agg(tablename, idxs) from (
                select tablename, string_agg(indexname, ', ' order by indexname) as idxs
                from pg_indexes where schemaname='public' group by tablename) t),

  'enums', (select jsonb_object_agg(typname, vals) from (
              select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as vals
              from pg_type t
              join pg_enum e on e.enumtypid=t.oid
              join pg_namespace n on n.oid=t.typnamespace
              where n.nspname='public' group by t.typname) x),

  'views', (select jsonb_agg(table_name order by table_name) from information_schema.views where table_schema='public'),

  'target_user', (select jsonb_build_object(
                     'exists', count(*) > 0,
                     'full_name', max(profile->>'full_name'),
                     'avatar_url', max(profile->>'avatar_url'),
                     'onboarding_completed', bool_or(onboarding_completed))
                   from public.users where id='aa68de6a-2efb-42c5-9c48-61c89845abbd'),

  'target_onboarding_rows', (select count(*) from public.user_onboarding where user_id='aa68de6a-2efb-42c5-9c48-61c89845abbd'),

  'target_auth_meta', (select jsonb_build_object(
                          'name', coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
                          'avatar', coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'),
                          'provider', raw_app_meta_data->>'provider')
                        from auth.users where id='aa68de6a-2efb-42c5-9c48-61c89845abbd')
)) as staging_manifest;
