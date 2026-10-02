create extension if not exists pgcrypto;

create table public.emet_plans (
  code text primary key,
  name text not null,
  monthly_question_limit integer not null check (monthly_question_limit >= 0),
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.emet_plans (code, name, monthly_question_limit, monthly_price_cents)
values
  ('free', 'Free', 5, 0),
  ('lite', 'EMET Lite', 15, 99),
  ('starter', 'Starter', 50, 299),
  ('study', 'Study', 150, 699),
  ('deep-study', 'Deep Study', 300, 999)
on conflict (code) do update set
  name = excluded.name,
  monthly_question_limit = excluded.monthly_question_limit,
  monthly_price_cents = excluded.monthly_price_cents,
  active = true;

create table public.emet_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_code text not null default 'free' references public.emet_plans (code),
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'trialing', 'active', 'past_due', 'canceled')),
  billing_provider text,
  billing_customer_id text,
  billing_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index emet_accounts_billing_customer_idx
  on public.emet_accounts (billing_provider, billing_customer_id)
  where billing_customer_id is not null;

create unique index emet_accounts_billing_subscription_idx
  on public.emet_accounts (billing_provider, billing_subscription_id)
  where billing_subscription_id is not null;

create table public.emet_usage_periods (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  question_limit integer not null check (question_limit >= 0),
  questions_used integer not null default 0 check (questions_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start),
  check (period_end > period_start),
  check (questions_used <= question_limit)
);

create index emet_usage_periods_user_idx
  on public.emet_usage_periods (user_id, period_start desc);

create table public.emet_question_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  cache_key text not null,
  allowed boolean not null,
  charged boolean not null,
  result_source text check (result_source in ('cache', 'model', 'fail-closed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_id)
);

create index emet_question_requests_user_created_idx
  on public.emet_question_requests (user_id, created_at desc);

create index emet_question_requests_cache_idx
  on public.emet_question_requests (cache_key);

create table public.emet_verified_answers (
  cache_key text primary key,
  schema_version text not null,
  prompt_version text not null,
  evidence_version text not null,
  canonical_entity_id text,
  answer jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(answer) = 'object')
);

alter table public.emet_plans enable row level security;
alter table public.emet_accounts enable row level security;
alter table public.emet_usage_periods enable row level security;
alter table public.emet_question_requests enable row level security;
alter table public.emet_verified_answers enable row level security;

revoke all on table public.emet_plans from anon, authenticated;
revoke all on table public.emet_accounts from anon, authenticated;
revoke all on table public.emet_usage_periods from anon, authenticated;
revoke all on table public.emet_question_requests from anon, authenticated;
revoke all on table public.emet_verified_answers from anon, authenticated;

grant select on table public.emet_plans to authenticated;
grant select on table public.emet_accounts to authenticated;
grant select on table public.emet_usage_periods to authenticated;
grant select on table public.emet_question_requests to authenticated;
grant all on table public.emet_plans to service_role;
grant all on table public.emet_accounts to service_role;
grant all on table public.emet_usage_periods to service_role;
grant all on table public.emet_question_requests to service_role;
grant all on table public.emet_verified_answers to service_role;

create policy "Authenticated users read active EMET plans"
  on public.emet_plans for select
  to authenticated
  using (active = true);

create policy "Users read their own EMET account"
  on public.emet_accounts for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users read their own EMET usage"
  on public.emet_usage_periods for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users read their own EMET question history"
  on public.emet_question_requests for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.create_emet_account_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.emet_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_emet_account on auth.users;
create trigger on_auth_user_created_create_emet_account
  after insert on auth.users
  for each row execute function public.create_emet_account_for_new_user();

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
