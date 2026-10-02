create or replace function public.reserve_emet_question(
  p_request_id uuid,
  p_cache_key text
)
returns table (
  allowed boolean,
  charged boolean,
  question_limit integer,
  questions_used integer,
  questions_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := now();
  v_period_start timestamptz := date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_period_end timestamptz;
  v_limit integer;
  v_used integer;
  v_existing public.emet_question_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_request_id is null or nullif(trim(p_cache_key), '') is null then
    raise exception 'A request ID and cache key are required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.emet_question_requests
  where user_id = v_user_id and request_id = p_request_id;

  if found then
    if v_existing.cache_key <> p_cache_key then
      raise exception 'Request ID was already used for different evidence'
        using errcode = '22023';
    end if;

    select u.question_limit, u.questions_used
      into v_limit, v_used
    from public.emet_usage_periods u
    where u.user_id = v_user_id
      and u.period_start = v_period_start;

    return query select
      v_existing.allowed,
      false,
      coalesce(v_limit, 0),
      coalesce(v_used, 0),
      greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0);
    return;
  end if;

  insert into public.emet_accounts (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select p.monthly_question_limit into v_limit
  from public.emet_accounts a
  join public.emet_plans p on p.code =
    case
      when a.subscription_status in ('trialing', 'active') then a.plan_code
      else 'free'
    end
  where a.user_id = v_user_id and p.active = true;

  v_limit := coalesce(v_limit, 5);
  v_period_end := v_period_start + interval '1 month';

  insert into public.emet_usage_periods (
    user_id,
    period_start,
    period_end,
    question_limit,
    questions_used
  ) values (
    v_user_id,
    v_period_start,
    v_period_end,
    v_limit,
    0
  ) on conflict (user_id, period_start) do nothing;

  select u.question_limit, u.questions_used
    into v_limit, v_used
  from public.emet_usage_periods u
  where u.user_id = v_user_id
    and u.period_start = v_period_start
  for update;

  if v_used >= v_limit then
    insert into public.emet_question_requests (
      request_id, user_id, cache_key, allowed, charged
    ) values (
      p_request_id, v_user_id, p_cache_key, false, false
    );

    return query select false, false, v_limit, v_used, 0;
    return;
  end if;

  update public.emet_usage_periods as usage
  set questions_used = usage.questions_used + 1,
      updated_at = v_now
  where usage.user_id = v_user_id and usage.period_start = v_period_start
  returning usage.questions_used into v_used;

  insert into public.emet_question_requests (
    request_id, user_id, cache_key, allowed, charged
  ) values (
    p_request_id, v_user_id, p_cache_key, true, true
  );

  return query select true, true, v_limit, v_used, greatest(v_limit - v_used, 0);
end;
$$;

revoke all on function public.reserve_emet_question(uuid, text) from public, anon;
grant execute on function public.reserve_emet_question(uuid, text) to authenticated;

create or replace function public.refund_failed_emet_question(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.emet_question_requests%rowtype;
  v_period_start timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_request
  from public.emet_question_requests
  where user_id = v_user_id and request_id = p_request_id
  for update;

  if not found or not v_request.charged then
    return false;
  end if;

  v_period_start :=
    date_trunc('month', v_request.created_at at time zone 'UTC') at time zone 'UTC';

  update public.emet_usage_periods as usage
  set questions_used = greatest(usage.questions_used - 1, 0),
      updated_at = now()
  where usage.user_id = v_user_id and usage.period_start = v_period_start;

  update public.emet_question_requests
  set allowed = false,
      charged = false,
      result_source = 'fail-closed',
      completed_at = now()
  where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.refund_failed_emet_question(uuid) from public, anon;
grant execute on function public.refund_failed_emet_question(uuid) to authenticated;
