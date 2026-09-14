-- Reserve before paid AI work. Privileged requests never live in public plan rows.
ALTER TABLE public.training_plans
  ADD COLUMN generation_source text,
  ADD COLUMN source_retrospective_id uuid REFERENCES public.plan_retrospectives(id),
  ADD COLUMN generation_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN generation_started_at timestamptz,
  ADD COLUMN generation_finished_at timestamptz,
  ADD COLUMN generation_request_id text,
  ADD COLUMN generation_event_id text;
CREATE UNIQUE INDEX training_plans_source_retrospective_unique
  ON public.training_plans(source_retrospective_id) WHERE source_retrospective_id IS NOT NULL;
CREATE TABLE public.training_plan_generation_requests (
  plan_id uuid PRIMARY KEY REFERENCES public.training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_plan_generation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_plan_generation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plan_generation_requests TO service_role;

CREATE FUNCTION public.reserve_training_plan(
  p_user_id uuid, p_source text, p_plan jsonb, p_request jsonb,
  p_retrospective_id uuid DEFAULT NULL, p_retry_plan_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL, p_event_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_plan public.training_plans%ROWTYPE;
  v_source_plan public.training_plans%ROWTYPE;
  v_retro public.plan_retrospectives%ROWTYPE;
  v_request jsonb;
  v_created boolean := false;
BEGIN
  IF p_source IS NULL OR p_source NOT IN
    ('onboarding','subscription','retrospective_accept','retrospective_customize','retry') THEN
    RAISE EXCEPTION 'GENERATION_INVALID_SOURCE';
  END IF;
  -- Shared lock order with finalization: user, then plan. Independent app
  -- instances, webhook redelivery and explicit CTAs serialize on this row.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GENERATION_USER_NOT_FOUND'; END IF;

  IF p_source = 'retry' THEN
    SELECT * INTO v_plan FROM public.training_plans
      WHERE id = p_retry_plan_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_plan.status IS DISTINCT FROM 'active'
      OR v_plan.generation_status IS DISTINCT FROM 'failed'
      OR EXISTS (SELECT 1 FROM public.training_plans WHERE user_id = p_user_id
        AND status = 'active' AND id <> v_plan.id)
      OR EXISTS (SELECT 1 FROM public.workouts WHERE plan_id = v_plan.id) THEN
      RAISE EXCEPTION 'GENERATION_RETRY_NOT_ALLOWED';
    END IF;
    SELECT request INTO v_request FROM public.training_plan_generation_requests
      WHERE plan_id = v_plan.id AND user_id = p_user_id;
    IF v_request IS NULL THEN RAISE EXCEPTION 'GENERATION_REQUEST_MISSING'; END IF;
    UPDATE public.training_plans SET generation_status = 'generating',
      generation_attempt = generation_attempt + 1, generation_started_at = now(),
      generation_finished_at = NULL, updated_at = now(), generation_request_id = p_request_id
      WHERE id = v_plan.id RETURNING * INTO v_plan;
    v_created := true;
  ELSIF p_source IN ('onboarding','subscription') THEN
    SELECT * INTO v_plan FROM public.training_plans
      WHERE user_id = p_user_id AND status = 'active'
      ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      -- A missing retrospective must not reopen the initial onboarding path.
      IF EXISTS (SELECT 1 FROM public.training_plans WHERE user_id = p_user_id)
        OR EXISTS (SELECT 1 FROM public.plan_retrospectives WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'GENERATION_CYCLE_CONFIRMATION_REQUIRED';
      END IF;
      v_created := true;
    END IF;
  ELSE
    SELECT * INTO v_retro FROM public.plan_retrospectives
      WHERE id = p_retrospective_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'GENERATION_RETROSPECTIVE_NOT_FOUND'; END IF;
    -- Accept/customize share one durable identity, even after failure/cancellation.
    SELECT * INTO v_plan FROM public.training_plans
      WHERE source_retrospective_id = v_retro.id AND user_id = p_user_id;
    IF NOT FOUND THEN
      IF v_retro.status = 'archived' THEN
        RAISE EXCEPTION 'GENERATION_RETROSPECTIVE_ALREADY_CONSUMED';
      END IF;
      IF v_retro.status IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'GENERATION_RETROSPECTIVE_NOT_READY';
      END IF;
      SELECT * INTO v_source_plan FROM public.training_plans
        WHERE id = v_retro.plan_id AND user_id = p_user_id FOR UPDATE;
      IF NOT FOUND OR v_source_plan.status IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'GENERATION_RETROSPECTIVE_NOT_READY';
      END IF;
      -- A previous ended cycle cannot replace a newer ended cycle. An accidental
      -- active fallback from the affected app release may still be replaced.
      IF EXISTS (SELECT 1 FROM public.training_plans WHERE user_id = p_user_id
        AND status = 'completed' AND created_at > v_source_plan.created_at) THEN
        RAISE EXCEPTION 'GENERATION_STALE_RETROSPECTIVE';
      END IF;
      v_created := true;
    END IF;
  END IF;

  IF v_created AND p_source <> 'retry' THEN
    IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
      RAISE EXCEPTION 'GENERATION_REQUEST_MISSING';
    END IF;
    -- Insertion, cancellation and archival roll back together on any error.
    UPDATE public.training_plans SET status = 'cancelled', updated_at = now()
      WHERE user_id = p_user_id AND status = 'active';
    INSERT INTO public.training_plans (
      user_id,goal,duration_weeks,frequency_per_week,plan_json,goal_type,
      race_id,race_date,race_name,race_distance,status,generation_status,
      generation_source,source_retrospective_id,generation_attempt,
      generation_started_at,generation_request_id,generation_event_id
    ) VALUES (
      p_user_id,p_plan->>'goal',(p_plan->>'duration_weeks')::integer,
      (p_plan->>'frequency_per_week')::integer,'{}'::jsonb,
      COALESCE(p_plan->>'goal_type','distance'),
      (p_plan->>'race_id')::uuid,(p_plan->>'race_date')::date,
      p_plan->>'race_name',(p_plan->>'race_distance')::numeric,
      'active','generating',p_source,p_retrospective_id,1,now(),p_request_id,p_event_id
    ) RETURNING * INTO v_plan;
    INSERT INTO public.training_plan_generation_requests(plan_id,user_id,request)
      VALUES (v_plan.id,p_user_id,p_request);
    IF p_source IN ('retrospective_accept','retrospective_customize') THEN
      UPDATE public.plan_retrospectives SET status = 'archived'
        WHERE id = p_retrospective_id AND user_id = p_user_id;
    END IF;
    v_request := p_request;
  ELSIF v_request IS NULL THEN
    SELECT request INTO v_request FROM public.training_plan_generation_requests
      WHERE plan_id = v_plan.id AND user_id = p_user_id;
  END IF;
  RETURN jsonb_build_object('created',v_created,'plan',to_jsonb(v_plan),
    'plan_id',v_plan.id,'generation_status',v_plan.generation_status,'request',v_request);
END;
$$;

CREATE FUNCTION public.finalize_training_plan(
  p_user_id uuid,p_plan_id uuid,p_attempt integer,p_plan_json jsonb,p_workouts jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_plan public.training_plans%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.training_plans
    WHERE id = p_plan_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_plan.status IS DISTINCT FROM 'active'
    OR v_plan.generation_status IS DISTINCT FROM 'generating'
    OR v_plan.generation_attempt IS DISTINCT FROM p_attempt THEN
    RETURN jsonb_build_object('applied',false,'reason','stale_attempt');
  END IF;
  IF jsonb_typeof(p_workouts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_workouts) = 0
    OR jsonb_typeof(p_plan_json) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'GENERATION_INVALID_RESULT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workouts WHERE plan_id = p_plan_id) THEN
    RAISE EXCEPTION 'GENERATION_WORKOUTS_ALREADY_EXIST';
  END IF;
  INSERT INTO public.workouts(plan_id,user_id,week_number,scheduled_date,
    type,distance_km,instructions_json,objective,tips,status,metadata,title,is_race_day)
  SELECT p_plan_id,p_user_id,(w->>'week_number')::integer,
    (w->>'scheduled_date')::date,w->>'type',(w->>'distance_km')::double precision,
    w->'instructions_json',w->>'objective',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(w->'tips','[]'::jsonb))),
    'pending',w->'metadata',w->>'title',COALESCE((w->>'is_race_day')::boolean,false)
  FROM jsonb_array_elements(p_workouts) AS rows(w);
  UPDATE public.training_plans SET plan_json = p_plan_json,
    generation_status = 'complete',generation_finished_at = now(),updated_at = now()
    WHERE id = p_plan_id RETURNING * INTO v_plan;
  RETURN jsonb_build_object('applied',true,'plan',to_jsonb(v_plan));
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_training_plan(uuid,text,jsonb,jsonb,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_training_plan(uuid,uuid,integer,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_training_plan(uuid,text,jsonb,jsonb,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_training_plan(uuid,uuid,integer,jsonb,jsonb) TO service_role;
