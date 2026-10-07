create table if not exists public.emet_conversation_ledgers (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  ledger jsonb not null default '{"schemaVersion":"emet-conversation-ledger@1","claims":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists emet_conversation_ledgers_updated_idx
  on public.emet_conversation_ledgers (user_id, updated_at desc);

alter table public.emet_conversation_ledgers enable row level security;

revoke all on table public.emet_conversation_ledgers
  from public, anon, authenticated;

grant all on table public.emet_conversation_ledgers to service_role;

create or replace function public.append_emet_conversation_ledger(
  p_user_id uuid,
  p_conversation_id uuid,
  p_claims jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_claims jsonb;
  v_ledger jsonb;
begin
  if jsonb_typeof(p_claims) <> 'array' then
    raise exception 'p_claims must be a JSON array';
  end if;

  insert into public.emet_conversation_ledgers (
    user_id,
    conversation_id
  ) values (
    p_user_id,
    p_conversation_id
  )
  on conflict (user_id, conversation_id) do nothing;

  select ledger
    into v_existing
    from public.emet_conversation_ledgers
   where user_id = p_user_id
     and conversation_id = p_conversation_id
   for update;

  with combined as (
    select value as claim, ordinality
      from jsonb_array_elements(
        coalesce(v_existing->'claims', '[]'::jsonb) || p_claims
      ) with ordinality
     where coalesce(value->>'id', '') <> ''
  ), latest as (
    select distinct on (claim->>'id') claim, ordinality
      from combined
     order by claim->>'id', ordinality desc
  ), retained as (
    select claim, ordinality
      from latest
     order by ordinality desc
     limit 64
  )
  select coalesce(jsonb_agg(claim order by ordinality), '[]'::jsonb)
    into v_claims
    from retained;

  v_ledger := jsonb_build_object(
    'schemaVersion', 'emet-conversation-ledger@1',
    'claims', v_claims
  );

  update public.emet_conversation_ledgers
     set ledger = v_ledger,
         updated_at = now()
   where user_id = p_user_id
     and conversation_id = p_conversation_id;

  return v_ledger;
end;
$$;

revoke all on function public.append_emet_conversation_ledger(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.append_emet_conversation_ledger(uuid, uuid, jsonb)
  to service_role;
