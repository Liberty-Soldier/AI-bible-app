-- Additive only. Apply to a disposable database first; never run automatically.
create table public.emet_conversations (
 id uuid primary key, owner_user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (char_length(title) between 1 and 120),
 revision bigint not null default 0, next_sequence bigint not null default 1,
 legacy_key text, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_user_id, legacy_key)
);
create table public.emet_conversation_turns (
 request_id uuid primary key, conversation_id uuid not null references public.emet_conversations(id) on delete cascade,
 sequence bigint not null, question text not null check(char_length(question) between 1 and 800),
 context jsonb, state text not null check(state in ('pending','complete','interrupted')),
 response jsonb, http_status integer, imported boolean not null default false,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(conversation_id,sequence)
);
create index emet_conversations_owner_updated on public.emet_conversations(owner_user_id,updated_at desc);
alter table public.emet_conversations enable row level security;
alter table public.emet_conversation_turns enable row level security;
create policy conversations_read_own on public.emet_conversations for select to authenticated using(owner_user_id=auth.uid() and deleted_at is null);
create policy turns_read_own on public.emet_conversation_turns for select to authenticated using(exists(select 1 from public.emet_conversations c where c.id=conversation_id and c.owner_user_id=auth.uid() and c.deleted_at is null));
revoke all on public.emet_conversations, public.emet_conversation_turns from public,anon,authenticated;
grant select on public.emet_conversations, public.emet_conversation_turns to authenticated;
grant all on public.emet_conversations, public.emet_conversation_turns to service_role;

-- Called only by authenticated server handlers via service role. Locking the
-- parent serializes devices and reserves sequence numbers atomically.
create function public.emet_begin_turn(p_owner uuid,p_conversation uuid,p_request uuid,p_question text,p_context jsonb,p_revision bigint default null)
returns jsonb language plpgsql set search_path=public as $$
declare c public.emet_conversations; t public.emet_conversation_turns;
begin
 insert into public.emet_conversations(id,owner_user_id,title) values(p_conversation,p_owner,left(p_question,120)) on conflict(id) do nothing;
 select * into c from public.emet_conversations where id=p_conversation for update;
 if c.owner_user_id<>p_owner or c.deleted_at is not null then return jsonb_build_object('status','not-found'); end if;
 select * into t from public.emet_conversation_turns where request_id=p_request;
 if found then
  -- Bind idempotency to the original turn; imported data is never a server replay.
  if t.conversation_id<>p_conversation or t.imported or t.question<>p_question or t.context is distinct from p_context then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status',t.state,'response',t.response,'httpStatus',t.http_status);
 end if;
 if p_revision is not null and c.revision<>p_revision then return jsonb_build_object('status','conflict'); end if;
 update public.emet_conversation_turns set state='interrupted',completed_at=now() where conversation_id=p_conversation and state='pending' and created_at<now()-interval '3 minutes';
 if exists(select 1 from public.emet_conversation_turns where conversation_id=p_conversation and state='pending') then return jsonb_build_object('status','busy'); end if;
 insert into public.emet_conversation_turns(request_id,conversation_id,sequence,question,context,state) values(p_request,p_conversation,c.next_sequence,p_question,p_context,'pending');
 update public.emet_conversations set next_sequence=next_sequence+1,revision=revision+1,updated_at=now() where id=p_conversation;
 return jsonb_build_object('status','created');
end $$;

create function public.emet_finish_turn(p_owner uuid,p_conversation uuid,p_request uuid,p_response jsonb,p_http integer)
returns boolean language plpgsql set search_path=public as $$
declare c public.emet_conversations;
begin
 select * into c from public.emet_conversations where id=p_conversation for update;
 if not found or c.owner_user_id<>p_owner or c.deleted_at is not null then return false; end if;
 update public.emet_conversation_turns set state='complete',response=p_response,http_status=p_http,completed_at=now() where request_id=p_request and conversation_id=p_conversation and state='pending';
 if not found then return false; end if;
 update public.emet_conversations set revision=revision+1,updated_at=now() where id=p_conversation;
 return true;
end $$;

create function public.emet_edit_conversation(p_owner uuid,p_id uuid,p_revision bigint,p_title text,p_delete boolean)
returns text language plpgsql set search_path=public as $$
declare c public.emet_conversations;
begin
 select * into c from public.emet_conversations where id=p_id for update;
 if not found or c.owner_user_id<>p_owner or c.deleted_at is not null then return 'not-found'; end if;
 if c.revision<>p_revision then return 'conflict'; end if;
 update public.emet_conversations set title=coalesce(p_title,title),deleted_at=case when p_delete then now() else null end,revision=revision+1,updated_at=now() where id=p_id;
 return 'saved';
end $$;

create function public.emet_import_conversation(p_owner uuid,p_id uuid,p_key text,p_turns jsonb)
returns uuid language plpgsql set search_path=public as $$
declare cid uuid; item jsonb; n bigint=0;
begin
 insert into public.emet_conversations(id,owner_user_id,title,legacy_key) values(p_id,p_owner,left(p_turns->0->>'question',120),p_key) on conflict(owner_user_id,legacy_key) do nothing returning id into cid;
 if cid is null then select id into cid from public.emet_conversations where owner_user_id=p_owner and legacy_key=p_key; return cid; end if;
 for item in select value from jsonb_array_elements(p_turns) loop
  n=n+1;
  insert into public.emet_conversation_turns(request_id,conversation_id,sequence,question,state,response,http_status,imported,completed_at)
  values(gen_random_uuid(),cid,n,item->>'question','complete',item->'response',200,true,now());
 end loop;
 update public.emet_conversations set next_sequence=n+1,revision=1 where id=cid;
 return cid;
end $$;
revoke all on function public.emet_begin_turn(uuid,uuid,uuid,text,jsonb,bigint),public.emet_finish_turn(uuid,uuid,uuid,jsonb,integer),public.emet_edit_conversation(uuid,uuid,bigint,text,boolean),public.emet_import_conversation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.emet_begin_turn(uuid,uuid,uuid,text,jsonb,bigint),public.emet_finish_turn(uuid,uuid,uuid,jsonb,integer),public.emet_edit_conversation(uuid,uuid,bigint,text,boolean),public.emet_import_conversation(uuid,uuid,text,jsonb) to service_role;

-- Source eligibility is not theological certification. Existing snapshots retain
-- their original eligibility and publication behavior.
alter table public.emet_shared_studies add column source_kind text not null default 'current';
alter table public.emet_shared_studies add column qualifications jsonb not null default '[]'::jsonb;
alter table public.emet_shared_studies add column source_passages jsonb not null default '[]'::jsonb;
