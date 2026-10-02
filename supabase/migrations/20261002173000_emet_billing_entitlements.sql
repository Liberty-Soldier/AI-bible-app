alter table public.emet_accounts
  add column if not exists billing_entitlement_id text,
  add column if not exists billing_product_id text,
  add column if not exists billing_store text,
  add column if not exists billing_environment text,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_will_renew boolean,
  add column if not exists billing_event_at timestamptz;

create table if not exists public.emet_billing_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.emet_plans (code),
  environment text,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists emet_billing_events_user_event_idx
  on public.emet_billing_events (user_id, event_at desc);

alter table public.emet_billing_events enable row level security;
revoke all on table public.emet_billing_events from public, anon, authenticated;
grant all on table public.emet_billing_events to service_role;

create or replace function public.apply_emet_billing_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_user_id uuid,
  p_plan_code text,
  p_subscription_status text,
  p_entitlement_id text,
  p_product_id text,
  p_store text,
  p_environment text,
  p_expires_at timestamptz,
  p_will_renew boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_updated integer;
  v_limit integer;
  v_period_start timestamptz :=
    date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
begin
  if nullif(trim(p_provider), '') is null
     or nullif(trim(p_event_id), '') is null
     or nullif(trim(p_event_type), '') is null
     or p_event_at is null
     or p_user_id is null then
    raise exception 'A complete billing event identity is required'
      using errcode = '22023';
  end if;

  if p_subscription_status not in ('trialing', 'active', 'canceled') then
    raise exception 'Unsupported subscription status'
      using errcode = '22023';
  end if;

  select monthly_question_limit into v_limit
  from public.emet_plans
  where code = p_plan_code and active = true;

  if not found then
    raise exception 'Unknown or inactive EMET plan'
      using errcode = '22023';
  end if;

  insert into public.emet_billing_events (
    provider,
    event_id,
    event_type,
    event_at,
    user_id,
    plan_code,
    environment
  ) values (
    p_provider,
    p_event_id,
    p_event_type,
    p_event_at,
    p_user_id,
    p_plan_code,
    p_environment
  ) on conflict (provider, event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  insert into public.emet_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.emet_accounts
  set plan_code = p_plan_code,
      subscription_status = p_subscription_status,
      billing_provider = p_provider,
      billing_entitlement_id = p_entitlement_id,
      billing_product_id = p_product_id,
      billing_store = p_store,
      billing_environment = p_environment,
      subscription_expires_at = p_expires_at,
      subscription_will_renew = p_will_renew,
      billing_event_at = p_event_at,
      updated_at = now()
  where user_id = p_user_id
    and (billing_event_at is null or billing_event_at <= p_event_at);

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'stale';
  end if;

  update public.emet_usage_periods
  set question_limit = greatest(v_limit, questions_used),
      updated_at = now()
  where user_id = p_user_id
    and period_start = v_period_start;

  return 'processed';
end;
$$;

revoke all on function public.apply_emet_billing_event(
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
) from public, anon, authenticated;

grant execute on function public.apply_emet_billing_event(
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean
) to service_role;
