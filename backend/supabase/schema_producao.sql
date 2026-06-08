--
-- PostgreSQL database dump
--

\restrict l5pYO1yPAF8hSbUAXAL2MpYEEUgkoQabBVy6pa5Cb1g5blf3Zpqv70sehiara5K

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: race_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.race_level AS ENUM (
    'beginner',
    'intermediate',
    'advanced',
    'all_levels'
);


--
-- Name: race_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.race_status AS ENUM (
    'active',
    'finished',
    'draft',
    'rejected',
    'cancelled'
);


--
-- Name: race_terrain; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.race_terrain AS ENUM (
    'road',
    'trail',
    'track',
    'mixed'
);


--
-- Name: calculate_level_from_points(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_level_from_points(p_total_points bigint) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
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


--
-- Name: generate_race_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_race_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Gera slug base: lowercase, remove acentos, substitui espaços por hífens
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

  -- Adiciona ano da prova ao slug
  base_slug := base_slug || '-' || EXTRACT(YEAR FROM NEW.race_date)::TEXT;

  -- Garante unicidade
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM races WHERE slug = final_slug AND id != NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter::TEXT;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.users (id, email, onboarding_completed)
  values (new.id, new.email, false);
  return new;
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: shift_pending_workouts(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shift_pending_workouts(p_plan_id uuid, p_days integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare v_count integer;
begin
  update public.workouts set scheduled_date = scheduled_date + p_days
   where plan_id = p_plan_id and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end; $$;


--
-- Name: sync_points_to_user_xp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_points_to_user_xp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_new_total BIGINT;
BEGIN
    -- Atomic increment on users.total_xp (preserves existing behavior)
    UPDATE public.users
    SET total_xp = COALESCE(total_xp, 0) + NEW.points
    WHERE id = NEW.user_id
    RETURNING total_xp INTO v_new_total;

    -- Atomic upsert + increment on user_levels.total_points (race-free)
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


--
-- Name: update_connected_devices_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_connected_devices_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: races; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.races (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    external_id text,
    name text NOT NULL,
    slug text,
    edition text,
    description text,
    race_date date NOT NULL,
    race_date_end date,
    race_time time without time zone,
    registration_deadline date,
    city text NOT NULL,
    state text NOT NULL,
    country text DEFAULT 'BR'::text NOT NULL,
    venue text,
    full_address text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    distances numeric(6,2)[] NOT NULL,
    distances_labels text[],
    main_distance numeric(6,2) NOT NULL,
    level public.race_level DEFAULT 'all_levels'::public.race_level NOT NULL,
    terrain public.race_terrain DEFAULT 'road'::public.race_terrain NOT NULL,
    is_championship boolean DEFAULT false,
    series_name text,
    tags text[],
    registration_url text,
    official_website text,
    source_url text NOT NULL,
    source_platform text,
    image_url text,
    image_thumbnail_url text,
    image_source text,
    price_min numeric(8,2),
    price_max numeric(8,2),
    is_free boolean DEFAULT false,
    organizer_name text,
    organizer_contact text,
    status public.race_status DEFAULT 'draft'::public.race_status NOT NULL,
    confidence_score numeric(3,2),
    needs_review boolean DEFAULT false,
    review_notes text,
    raw_data jsonb,
    scraper_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    finished_at timestamp with time zone
);


--
-- Name: TABLE races; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.races IS 'Provas de corrida de rua importadas pelo scraper semi-automático. Alimentado mensalmente via runeasy-race-scraper. Consumido pelo NestJS via view active_races.';


--
-- Name: COLUMN races.distances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.races.distances IS 'Array com todas as distâncias da prova em km. Ex: {5, 10, 21, 42}';


--
-- Name: COLUMN races.tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.races.tags IS 'Tags livres para filtro: noturna, dog-friendly, familiar, mountain, trail, élite, beneficente';


--
-- Name: COLUMN races.source_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.races.source_url IS 'URL original de onde a prova foi extraída. Usado para deduplicação.';


--
-- Name: COLUMN races.confidence_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.races.confidence_score IS 'Score 0.0-1.0 do parser Claude. Abaixo de 0.7 = needs_review automático.';


--
-- Name: COLUMN races.raw_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.races.raw_data IS 'JSON bruto retornado pelo parser. Útil para debug e re-parsing futuro.';


--
-- Name: active_races; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_races WITH (security_invoker='true') AS
 SELECT id,
    name,
    slug,
    description,
    race_date,
    race_time,
    registration_deadline,
    city,
    state,
    country,
    venue,
    latitude,
    longitude,
    distances,
    distances_labels,
    main_distance,
    level,
    terrain,
    is_championship,
    series_name,
    tags,
    registration_url,
    official_website,
    image_url,
    image_thumbnail_url,
    price_min,
    price_max,
    is_free,
    organizer_name,
    (race_date - CURRENT_DATE) AS days_until_race
   FROM public.races
  WHERE ((status = 'active'::public.race_status) AND (race_date >= CURRENT_DATE))
  ORDER BY race_date;


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    workout_id uuid,
    name text,
    distance double precision,
    moving_time integer,
    average_pace double precision,
    map_polyline text,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    raw_points jsonb,
    device_type text,
    platform_version text,
    type text,
    start_date timestamp with time zone DEFAULT now(),
    elapsed_time integer,
    max_pace double precision,
    elevation_gain double precision,
    average_heartrate double precision,
    max_heartrate double precision,
    calories double precision,
    splits_metric jsonb,
    start_latlng double precision[],
    route_geometry extensions.geometry(LineString,4326),
    external_id text,
    source text DEFAULT 'phone'::text,
    gps_route jsonb,
    environment text DEFAULT 'outdoor'::text NOT NULL,
    treadmill_data jsonb,
    elevation_profile jsonb,
    elevation_source text,
    CONSTRAINT activities_environment_check CHECK ((environment = ANY (ARRAY['outdoor'::text, 'treadmill'::text])))
);


--
-- Name: COLUMN activities.average_heartrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activities.average_heartrate IS 'Average heart rate (BPM) during the activity. Sourced from wearable when available.';


--
-- Name: COLUMN activities.max_heartrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activities.max_heartrate IS 'Maximum heart rate (BPM) reached during the activity.';


--
-- Name: COLUMN activities.calories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activities.calories IS 'Active calories burned (kcal). Sourced from wearable when available.';


--
-- Name: COLUMN activities.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activities.source IS 'Origin of the activity row. Values: phone | phone_redundant | apple_watch | garmin | fitbit | polar | apple_health | health_connect. Device-local sources (apple_health, health_connect) are reconciled with plan workouts inside ActivitySyncService.processDeviceLocalActivity.';


--
-- Name: ai_feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_feedbacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    activity_id uuid,
    hero_tone text,
    hero_message text,
    improvements jsonb,
    feedback_rating integer,
    created_at timestamp with time zone DEFAULT now(),
    metrics_comparison jsonb DEFAULT '{}'::jsonb,
    strengths jsonb DEFAULT '[]'::jsonb,
    progression_impact text,
    workout_id uuid,
    CONSTRAINT ai_feedbacks_feedback_rating_check CHECK (((feedback_rating >= 1) AND (feedback_rating <= 5)))
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    feature_name text NOT NULL,
    model_name text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,6) DEFAULT 0 NOT NULL,
    latency_ms integer DEFAULT 0 NOT NULL,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_usage_by_user; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_usage_by_user WITH (security_invoker='true') AS
 SELECT user_id,
    feature_name,
    count(*) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))) AS calls_24h,
    (COALESCE(sum(estimated_cost_usd) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::numeric))::numeric(10,6) AS cost_24h,
    count(*) FILTER (WHERE (created_at > (now() - '7 days'::interval))) AS calls_7d,
    (COALESCE(sum(estimated_cost_usd) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::numeric))::numeric(10,6) AS cost_7d,
    COALESCE(sum(input_tokens) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::bigint) AS input_tokens_7d,
    COALESCE(sum(output_tokens) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::bigint) AS output_tokens_7d
   FROM public.ai_usage_logs
  WHERE (user_id IS NOT NULL)
  GROUP BY user_id, feature_name;


--
-- Name: ai_usage_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_usage_summary WITH (security_invoker='true') AS
 SELECT feature_name,
    model_name,
    count(*) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))) AS calls_24h,
    COALESCE(sum(input_tokens) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::bigint) AS input_tokens_24h,
    COALESCE(sum(output_tokens) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::bigint) AS output_tokens_24h,
    (COALESCE(sum(estimated_cost_usd) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::numeric))::numeric(10,6) AS cost_24h,
    (COALESCE(avg(latency_ms) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::numeric))::integer AS avg_latency_24h,
    count(*) FILTER (WHERE (created_at > (now() - '7 days'::interval))) AS calls_7d,
    COALESCE(sum(input_tokens) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::bigint) AS input_tokens_7d,
    COALESCE(sum(output_tokens) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::bigint) AS output_tokens_7d,
    (COALESCE(sum(estimated_cost_usd) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::numeric))::numeric(10,6) AS cost_7d,
    (COALESCE(avg(latency_ms) FILTER (WHERE (created_at > (now() - '7 days'::interval))), (0)::numeric))::integer AS avg_latency_7d
   FROM public.ai_usage_logs
  GROUP BY feature_name, model_name;


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text,
    name text,
    description text,
    tier integer,
    icon text,
    criteria jsonb,
    slug text NOT NULL,
    xp_reward integer DEFAULT 100 NOT NULL
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    influencer_id uuid NOT NULL,
    referral_id uuid NOT NULL,
    user_id uuid NOT NULL,
    month_number integer NOT NULL,
    gross_amount numeric(10,2) NOT NULL,
    store_fee numeric(10,2) NOT NULL,
    net_amount numeric(10,2) NOT NULL,
    commission_amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT commissions_month_number_check CHECK ((month_number > 0)),
    CONSTRAINT commissions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: connected_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connected_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_user_id text,
    access_token text,
    refresh_token text,
    expires_at timestamp with time zone,
    scope text,
    device_name text,
    connected_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: influencers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.influencers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    code character varying(30) NOT NULL,
    email character varying(255),
    pix_key character varying(255),
    commission_rate numeric(3,2) DEFAULT 0.50 NOT NULL,
    max_commission_months integer DEFAULT 3 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    total_referrals integer DEFAULT 0 NOT NULL,
    total_revenue_generated numeric(10,2) DEFAULT 0 NOT NULL,
    total_commission_earned numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title character varying,
    description text,
    type character varying,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: plan_retrospectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_retrospectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    plan_id uuid,
    total_distance_km numeric(10,2),
    total_workouts_completed integer,
    total_workouts_planned integer,
    avg_pace_seconds integer,
    completion_rate numeric(5,2),
    ai_insights text,
    suggested_next_goal text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    distance_vs_goal_percent numeric(5,2),
    pace_vs_goal_percent numeric(5,2),
    frequency_vs_goal_percent numeric(5,2),
    suggested_next_goal_type character varying(50)
);


--
-- Name: points_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    points integer NOT NULL,
    reason text NOT NULL,
    reference_type text,
    reference_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: races_pending_review; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.races_pending_review WITH (security_invoker='true') AS
 SELECT id,
    name,
    race_date,
    city,
    state,
    main_distance,
    source_url,
    source_platform,
    confidence_score,
    needs_review,
    review_notes,
    status,
    created_at
   FROM public.races
  WHERE ((needs_review = true) OR (status = 'draft'::public.race_status))
  ORDER BY confidence_score, created_at DESC;


--
-- Name: readiness_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    score integer,
    status_label text,
    status_color text,
    metrics_summary jsonb,
    created_at timestamp with time zone DEFAULT now(),
    ai_analysis jsonb DEFAULT '{}'::jsonb,
    check_in_answers jsonb DEFAULT '[]'::jsonb,
    set_number integer,
    CONSTRAINT readiness_history_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT readiness_history_status_color_check CHECK ((status_color = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])))
);


--
-- Name: readiness_question_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_question_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    set_number integer NOT NULL,
    set_name text NOT NULL,
    questions jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    influencer_id uuid NOT NULL,
    code_used character varying(30) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    first_purchase_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'converted'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: revenuecat_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revenuecat_events (
    event_id text NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    goal text,
    plan_json jsonb,
    frequency_per_week integer,
    duration_weeks integer,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    last_adaptation_at timestamp with time zone,
    adaptation_history jsonb DEFAULT '[]'::jsonb,
    generation_status text DEFAULT 'partial'::text,
    first_workout_json jsonb,
    goal_type text DEFAULT 'distance'::text,
    race_id uuid,
    race_date date,
    race_name text,
    race_distance numeric(6,2)
);


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    badge_id uuid,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    current_level integer DEFAULT 1,
    total_points integer DEFAULT 0,
    current_streak integer DEFAULT 0,
    best_streak integer DEFAULT 0,
    performance_score double precision DEFAULT 0,
    consistency_score double precision DEFAULT 0,
    adherence_score double precision DEFAULT 0,
    best_5k_pace double precision,
    best_10k_pace double precision,
    last_activity_date date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_onboarding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_onboarding (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    completed_at timestamp with time zone,
    goal text NOT NULL,
    level text NOT NULL,
    days_per_week integer,
    has_limitations boolean DEFAULT false,
    limitations text,
    current_pace_5k double precision,
    target_weeks integer NOT NULL,
    preferred_days integer[] DEFAULT ARRAY[]::integer[],
    responses_json jsonb,
    weight numeric,
    height numeric,
    calculated_pace numeric,
    start_date text,
    created_at timestamp with time zone DEFAULT now(),
    pace_minutes text,
    pace_seconds text,
    dont_know_pace boolean DEFAULT false,
    goal_timeframe integer,
    birth_date text,
    available_days jsonb,
    intense_day_index integer,
    recent_distance numeric,
    distance_time jsonb,
    goal_type text DEFAULT 'distance'::text,
    race_id uuid,
    race_date date,
    race_name text,
    race_distance numeric(6,2),
    CONSTRAINT user_onboarding_days_per_week_check CHECK (((days_per_week >= 2) AND (days_per_week <= 7)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text,
    push_token text,
    profile jsonb DEFAULT '{}'::jsonb,
    preferences jsonb DEFAULT '{}'::jsonb,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subscription_status text DEFAULT 'active'::text,
    subscription_plan text DEFAULT 'free'::text,
    subscription_started_at timestamp with time zone,
    subscription_expires_at timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    total_xp bigint DEFAULT 0,
    current_streak integer DEFAULT 0,
    last_activity_date date,
    trial_started_at timestamp with time zone,
    trial_expires_at timestamp with time zone,
    grace_period_expires_at timestamp with time zone,
    revenuecat_user_id text,
    CONSTRAINT users_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['active'::text, 'trial'::text, 'expired'::text, 'cancelled'::text, 'billing_issue'::text])))
);


--
-- Name: workout_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_id uuid NOT NULL,
    route extensions.geometry(LineString,4326),
    raw_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid,
    user_id uuid,
    type text,
    objective text,
    week_number integer,
    scheduled_date date,
    distance_km double precision,
    instructions_json jsonb,
    status text DEFAULT 'pending'::text,
    activity_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    tips text[] DEFAULT '{}'::text[],
    skip_reason text,
    scheduled_time time without time zone DEFAULT '05:00:00'::time without time zone,
    distance_run numeric,
    time_run_seconds integer,
    pace_seconds_per_km numeric,
    completed_at timestamp with time zone,
    source text DEFAULT 'plan'::text NOT NULL,
    title text,
    target_pace_seconds integer,
    target_duration_seconds integer,
    metadata jsonb,
    environment text DEFAULT 'outdoor'::text NOT NULL,
    treadmill_data jsonb,
    is_race_day boolean DEFAULT false,
    CONSTRAINT workouts_environment_check CHECK ((environment = ANY (ARRAY['outdoor'::text, 'treadmill'::text]))),
    CONSTRAINT workouts_source_check CHECK ((source = ANY (ARRAY['plan'::text, 'manual'::text, 'free'::text])))
);


--
-- Name: COLUMN workouts.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.source IS 'Origin of the workout: plan (AI-generated), manual (user-defined), free (free run captured retroactively)';


--
-- Name: COLUMN workouts.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.title IS 'User-defined workout title. Only set for source=manual|free.';


--
-- Name: COLUMN workouts.target_pace_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.target_pace_seconds IS 'Planned pace in seconds per km. Only set for source=manual.';


--
-- Name: COLUMN workouts.target_duration_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.target_duration_seconds IS 'Planned total duration in seconds. Only set for source=manual.';


--
-- Name: COLUMN workouts.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.metadata IS 'Enriched workout context: { zone, perceived_effort, scientific_note, week_phase, segment_descriptions[] }. NULL for legacy workouts.';


--
-- Name: activities activities_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_external_id_key UNIQUE (external_id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: ai_feedbacks ai_feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedbacks
    ADD CONSTRAINT ai_feedbacks_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: badges badges_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_slug_unique UNIQUE (slug);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_referral_id_month_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_referral_id_month_number_key UNIQUE (referral_id, month_number);


--
-- Name: connected_devices connected_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_devices
    ADD CONSTRAINT connected_devices_pkey PRIMARY KEY (id);


--
-- Name: connected_devices connected_devices_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_devices
    ADD CONSTRAINT connected_devices_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: influencers influencers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.influencers
    ADD CONSTRAINT influencers_code_key UNIQUE (code);


--
-- Name: influencers influencers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.influencers
    ADD CONSTRAINT influencers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: plan_retrospectives plan_retrospectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_retrospectives
    ADD CONSTRAINT plan_retrospectives_pkey PRIMARY KEY (id);


--
-- Name: plan_retrospectives plan_retrospectives_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_retrospectives
    ADD CONSTRAINT plan_retrospectives_plan_id_key UNIQUE (plan_id);


--
-- Name: points_history points_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_history
    ADD CONSTRAINT points_history_pkey PRIMARY KEY (id);


--
-- Name: races races_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.races
    ADD CONSTRAINT races_pkey PRIMARY KEY (id);


--
-- Name: races races_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.races
    ADD CONSTRAINT races_slug_key UNIQUE (slug);


--
-- Name: readiness_history readiness_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_history
    ADD CONSTRAINT readiness_history_pkey PRIMARY KEY (id);


--
-- Name: readiness_question_sets readiness_question_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_question_sets
    ADD CONSTRAINT readiness_question_sets_pkey PRIMARY KEY (id);


--
-- Name: readiness_question_sets readiness_question_sets_set_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_question_sets
    ADD CONSTRAINT readiness_question_sets_set_number_key UNIQUE (set_number);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_user_id_key UNIQUE (user_id);


--
-- Name: revenuecat_events revenuecat_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenuecat_events
    ADD CONSTRAINT revenuecat_events_pkey PRIMARY KEY (event_id);


--
-- Name: training_plans training_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_levels user_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_levels
    ADD CONSTRAINT user_levels_pkey PRIMARY KEY (id);


--
-- Name: user_levels user_levels_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_levels
    ADD CONSTRAINT user_levels_user_id_key UNIQUE (user_id);


--
-- Name: user_onboarding user_onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding
    ADD CONSTRAINT user_onboarding_pkey PRIMARY KEY (id);


--
-- Name: user_onboarding user_onboarding_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding
    ADD CONSTRAINT user_onboarding_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workout_routes workout_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_routes
    ADD CONSTRAINT workout_routes_pkey PRIMARY KEY (id);


--
-- Name: workouts workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);


--
-- Name: idx_activities_environment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_environment ON public.activities USING btree (environment);


--
-- Name: idx_activities_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_external_id ON public.activities USING btree (external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_activities_geometry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_geometry ON public.activities USING gist (route_geometry);


--
-- Name: idx_activities_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_source ON public.activities USING btree (source);


--
-- Name: idx_activities_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_user_date ON public.activities USING btree (user_id, start_date);


--
-- Name: idx_activities_user_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_user_start_date ON public.activities USING btree (user_id, start_date DESC);


--
-- Name: idx_ai_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_created ON public.ai_usage_logs USING btree (created_at DESC);


--
-- Name: idx_ai_usage_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_feature ON public.ai_usage_logs USING btree (feature_name);


--
-- Name: idx_ai_usage_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_model ON public.ai_usage_logs USING btree (model_name);


--
-- Name: idx_ai_usage_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_user ON public.ai_usage_logs USING btree (user_id);


--
-- Name: idx_badges_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_badges_slug ON public.badges USING btree (slug);


--
-- Name: idx_commissions_influencer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_influencer ON public.commissions USING btree (influencer_id);


--
-- Name: idx_commissions_referral; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_referral ON public.commissions USING btree (referral_id);


--
-- Name: idx_commissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_status ON public.commissions USING btree (status);


--
-- Name: idx_connected_devices_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connected_devices_provider ON public.connected_devices USING btree (provider);


--
-- Name: idx_connected_devices_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connected_devices_user_id ON public.connected_devices USING btree (user_id);


--
-- Name: idx_influencers_code_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_influencers_code_lower ON public.influencers USING btree (lower((code)::text));


--
-- Name: idx_question_sets_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_sets_number ON public.readiness_question_sets USING btree (set_number);


--
-- Name: idx_races_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_city ON public.races USING btree (city, state) WHERE (status = 'active'::public.race_status);


--
-- Name: idx_races_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_level ON public.races USING btree (level) WHERE (status = 'active'::public.race_status);


--
-- Name: idx_races_main_distance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_main_distance ON public.races USING btree (main_distance) WHERE (status = 'active'::public.race_status);


--
-- Name: idx_races_name_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_name_fts ON public.races USING gin (to_tsvector('portuguese'::regconfig, name));


--
-- Name: idx_races_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_needs_review ON public.races USING btree (needs_review, created_at) WHERE (needs_review = true);


--
-- Name: idx_races_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_races_slug ON public.races USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_races_source_url; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_races_source_url ON public.races USING btree (source_url) WHERE (source_url IS NOT NULL);


--
-- Name: idx_races_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_status_date ON public.races USING btree (status, race_date) WHERE (status = 'active'::public.race_status);


--
-- Name: idx_races_terrain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_races_terrain ON public.races USING btree (terrain) WHERE (status = 'active'::public.race_status);


--
-- Name: idx_readiness_history_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_readiness_history_user_created ON public.readiness_history USING btree (user_id, created_at DESC);


--
-- Name: idx_readiness_history_user_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_readiness_history_user_set ON public.readiness_history USING btree (user_id, set_number);


--
-- Name: idx_referrals_influencer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_influencer ON public.referrals USING btree (influencer_id);


--
-- Name: idx_referrals_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_user ON public.referrals USING btree (user_id);


--
-- Name: idx_revenuecat_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revenuecat_events_user ON public.revenuecat_events USING btree (user_id, processed_at DESC);


--
-- Name: idx_training_plans_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_plans_user ON public.training_plans USING btree (user_id, status);


--
-- Name: idx_user_levels_total_points_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_levels_total_points_desc ON public.user_levels USING btree (total_points DESC) WHERE (total_points > 0);


--
-- Name: idx_user_onboarding_race_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_race_goal ON public.user_onboarding USING btree (race_id) WHERE (race_id IS NOT NULL);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_subscription ON public.users USING btree (subscription_plan, subscription_status);


--
-- Name: idx_users_total_xp_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_total_xp_desc ON public.users USING btree (total_xp DESC);


--
-- Name: idx_workouts_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_activity_id ON public.workouts USING btree (activity_id) WHERE (activity_id IS NOT NULL);


--
-- Name: idx_workouts_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_completed_at ON public.workouts USING btree (completed_at) WHERE (completed_at IS NOT NULL);


--
-- Name: idx_workouts_environment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_environment ON public.workouts USING btree (environment);


--
-- Name: idx_workouts_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_plan ON public.workouts USING btree (plan_id);


--
-- Name: idx_workouts_race_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_race_day ON public.workouts USING btree (plan_id, is_race_day) WHERE (is_race_day = true);


--
-- Name: idx_workouts_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_schedule ON public.workouts USING btree (scheduled_date, scheduled_time, status);


--
-- Name: idx_workouts_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_user_date ON public.workouts USING btree (user_id, scheduled_date);


--
-- Name: idx_workouts_user_source_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_user_source_date ON public.workouts USING btree (user_id, source, scheduled_date DESC);


--
-- Name: idx_workouts_user_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_user_status_date ON public.workouts USING btree (user_id, scheduled_date) WHERE (status = 'pending'::text);


--
-- Name: workout_routes_route_gix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_routes_route_gix ON public.workout_routes USING gist (route);


--
-- Name: workout_routes_workout_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_routes_workout_id_idx ON public.workout_routes USING btree (workout_id);


--
-- Name: races generate_races_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER generate_races_slug BEFORE INSERT ON public.races FOR EACH ROW WHEN ((new.slug IS NULL)) EXECUTE FUNCTION public.generate_race_slug();


--
-- Name: points_history trg_points_history_sync_xp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_points_history_sync_xp AFTER INSERT ON public.points_history FOR EACH ROW EXECUTE FUNCTION public.sync_points_to_user_xp();


--
-- Name: connected_devices trigger_connected_devices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_connected_devices_updated_at BEFORE UPDATE ON public.connected_devices FOR EACH ROW EXECUTE FUNCTION public.update_connected_devices_updated_at();


--
-- Name: races update_races_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_races_updated_at BEFORE UPDATE ON public.races FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activities activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activities activities_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE SET NULL;


--
-- Name: ai_feedbacks ai_feedbacks_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedbacks
    ADD CONSTRAINT ai_feedbacks_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: ai_feedbacks ai_feedbacks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedbacks
    ADD CONSTRAINT ai_feedbacks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_feedbacks ai_feedbacks_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedbacks
    ADD CONSTRAINT ai_feedbacks_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_influencer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_influencer_id_fkey FOREIGN KEY (influencer_id) REFERENCES public.influencers(id) ON DELETE RESTRICT;


--
-- Name: commissions commissions_referral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_referral_id_fkey FOREIGN KEY (referral_id) REFERENCES public.referrals(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: connected_devices connected_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connected_devices
    ADD CONSTRAINT connected_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: plan_retrospectives plan_retrospectives_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_retrospectives
    ADD CONSTRAINT plan_retrospectives_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.training_plans(id) ON DELETE CASCADE;


--
-- Name: plan_retrospectives plan_retrospectives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_retrospectives
    ADD CONSTRAINT plan_retrospectives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: points_history points_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_history
    ADD CONSTRAINT points_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: readiness_history readiness_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_history
    ADD CONSTRAINT readiness_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_influencer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_influencer_id_fkey FOREIGN KEY (influencer_id) REFERENCES public.influencers(id) ON DELETE RESTRICT;


--
-- Name: referrals referrals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: revenuecat_events revenuecat_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revenuecat_events
    ADD CONSTRAINT revenuecat_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: training_plans training_plans_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id);


--
-- Name: training_plans training_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_plans
    ADD CONSTRAINT training_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_levels user_levels_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_levels
    ADD CONSTRAINT user_levels_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_onboarding user_onboarding_race_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding
    ADD CONSTRAINT user_onboarding_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id);


--
-- Name: user_onboarding user_onboarding_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding
    ADD CONSTRAINT user_onboarding_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workout_routes workout_routes_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_routes
    ADD CONSTRAINT workout_routes_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


--
-- Name: workouts workouts_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.training_plans(id) ON DELETE CASCADE;


--
-- Name: workouts workouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: races Public can read active races; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active races" ON public.races FOR SELECT TO authenticated, anon USING (((status = 'active'::public.race_status) AND (race_date >= CURRENT_DATE)));


--
-- Name: connected_devices Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.connected_devices USING ((auth.role() = 'service_role'::text));


--
-- Name: races Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.races TO service_role USING (true) WITH CHECK (true);


--
-- Name: ai_usage_logs System full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System full access" ON public.ai_usage_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: connected_devices Users can delete own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own devices" ON public.connected_devices FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: connected_devices Users can insert own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own devices" ON public.connected_devices FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: users Users can manage their own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own data" ON public.users USING ((auth.uid() = id));


--
-- Name: ai_usage_logs Users can only view own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can only view own logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: connected_devices Users can update own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own devices" ON public.connected_devices FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: connected_devices Users can view own devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own devices" ON public.connected_devices FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_feedbacks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_feedbacks ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: connected_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connected_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: influencers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_retrospectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_retrospectives ENABLE ROW LEVEL SECURITY;

--
-- Name: points_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_history ENABLE ROW LEVEL SECURITY;

--
-- Name: races; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_history ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_question_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_question_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: revenuecat_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;

--
-- Name: training_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: user_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: user_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: user_onboarding; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict l5pYO1yPAF8hSbUAXAL2MpYEEUgkoQabBVy6pa5Cb1g5blf3Zpqv70sehiara5K

