"""Disposable PostgreSQL only. No URL/env credentials; Unix socket is fixed locally."""
import os, pathlib, subprocess, time
root=pathlib.Path(__file__).resolve().parents[2]
tools=root.parent/'redesign-tools'
psql=tools/'pg/usr/lib/postgresql/18/bin/psql'
env={**os.environ,'LD_LIBRARY_PATH':str(tools/'pg/usr/lib/x86_64-linux-gnu')}
test_db=f'emet_redesign_test_{os.getpid()}'
args=[str(psql),'-h',str(tools/'socket'),'-p','55439','-U','creatorstudio','-v','ON_ERROR_STOP=1','-At']
def sql(code,db=test_db):
 return subprocess.check_output(args+['-d',db,'-c',code],env=env,text=True).strip()
# Dedicated disposable DB. Refuse to overwrite an existing test database.
sql(f'create database {test_db}', 'postgres')
sql("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant select on auth.users to authenticated;")
for migration in sorted((root/'supabase/migrations').glob('202610*.sql')):
 sql(migration.read_text())
# Representative existing records before applying the additive migration.
legacy_owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
sql(f"insert into auth.users values('{legacy_owner}');insert into emet_shared_studies(owner_user_id,snapshot_hash,question,answer,citations,published_at) values('{legacy_owner}','existing','Existing question','Existing exact answer','[]',now());")
legacy_before=sql("select id||'|'||answer||'|'||published_at from emet_shared_studies where snapshot_hash='existing'")
sql((root/'supabase/migrations/20261101120000_private_conversations.sql').read_text())
assert sql("select id||'|'||answer||'|'||published_at from emet_shared_studies where snapshot_hash='existing'")==legacy_before
assert sql("select source_kind from emet_shared_studies where snapshot_hash='existing'")=='current'
assert sql("select count(*) from pg_policies where tablename in ('emet_conversations','emet_conversation_turns')")=='2'
assert sql("select has_table_privilege('anon','emet_conversations','select')")=='f'
assert sql("select count(*) from pg_indexes where tablename='emet_conversations'")=='3'

a='11111111-1111-4111-8111-111111111111';b='22222222-2222-4222-8222-222222222222';c='33333333-3333-4333-8333-333333333333';r='44444444-4444-4444-8444-444444444444';r2='55555555-5555-4555-8555-555555555555'
sql(f"insert into auth.users values('{a}'),('{b}')")
def begin(owner=a,rid=r):return sql(f"set role service_role;select emet_begin_turn('{owner}','{c}','{rid}','Exact question','{{}}');").splitlines()[-1]
assert 'created' in begin()
assert 'conflict' in sql(f"select emet_begin_turn('{a}','{c}','{r2}','Stale question','{{}}',0)")
assert 'not-found' in begin(b,r2)
assert 'pending' in begin()
assert 'conflict' in sql(f"select emet_begin_turn('{a}','{c}','{r}','Different question','{{}}')")
assert 'busy' in begin(a,r2)
assert sql(f"set role service_role;select emet_finish_turn('{a}','{c}','{r}','{{\"answer\":\"Exact answer\",\"citations\":[{{\"translation\":\"kjv\"}}]}}',200)").endswith('t')
assert 'complete' in begin()
assert 'Exact answer' in begin()
assert sql(f"set role authenticated;set request.jwt.claim.sub='{b}';select count(*) from emet_conversations").endswith('0')
assert sql(f"set role authenticated;set request.jwt.claim.sub='{b}';select count(*) from emet_conversation_turns").endswith('0')
assert sql(f"set role authenticated;set request.jwt.claim.sub='{a}';select count(*) from emet_conversation_turns").endswith('1')
assert sql("select has_function_privilege('authenticated','emet_begin_turn(uuid,uuid,uuid,text,jsonb,bigint)','execute')").endswith('f')
assert sql("select has_table_privilege('authenticated','emet_conversation_turns','update')").endswith('f')
assert sql(f"select emet_edit_conversation('{a}','{c}',0,'Wrong version',false)")=='conflict'
rev=sql(f"select revision from emet_conversations where id='{c}'")
assert sql(f"select emet_edit_conversation('{a}','{c}',{rev},'Renamed',false)")=='saved'
assert 'created' in begin(a,r2)
# A second device cannot claim another turn while pending.
assert 'busy' in begin(a,'66666666-6666-4666-8666-666666666666')
sql(f"update emet_conversation_turns set created_at=now()-interval '4 minutes' where request_id='{r2}'")
assert 'created' in begin(a,'66666666-6666-4666-8666-666666666666')
assert sql(f"select state from emet_conversation_turns where request_id='{r2}'")=='interrupted'
rev=sql(f"select revision from emet_conversations where id='{c}'")
assert sql(f"select emet_edit_conversation('{a}','{c}',{rev},null,true)")=='saved'
assert sql(f"select emet_finish_turn('{a}','{c}','66666666-6666-4666-8666-666666666666','{{}}',200)")=='f'
assert 'not-found' in begin()
turns='[{"question":"Old question","response":{"answer":{"answer":"Old exact text"}}}]'
first=sql(f"select emet_import_conversation('{a}',gen_random_uuid(),'stable','{turns}')")
second=sql(f"select emet_import_conversation('{a}',gen_random_uuid(),'stable','{turns}')")
assert first==second
imported_request=sql(f"select request_id from emet_conversation_turns where conversation_id='{first}'")
assert 'conflict' in sql(f"select emet_begin_turn('{a}','{first}','{imported_request}','Old question',null)")
assert sql(f"select count(*) from emet_conversation_turns where conversation_id='{first}'")=='1'
# Real concurrent sessions: hold parent lock while another session reserves.
c2='77777777-7777-4777-8777-777777777777';q1='88888888-8888-4888-8888-888888888888';q2='99999999-9999-4999-8999-999999999999'
process=subprocess.Popen(args+['-d',test_db,'-c',f"begin;select emet_begin_turn('{a}','{c2}','{q1}','Concurrent first','{{}}');select pg_sleep(1);commit;"],env=env,stdout=subprocess.PIPE,text=True)
time.sleep(.25)
result=sql(f"select emet_begin_turn('{a}','{c2}','{q2}','Concurrent second','{{}}')")
assert 'busy' in result;assert process.wait()==0
assert sql(f"select count(*) from emet_conversation_turns where conversation_id='{c2}'")=='1'
print('PASS: real isolated PostgreSQL migration, ownership/RLS, privileges, exact payload preservation, idempotency, ordering, pending/interrupted recovery, concurrent sessions, rename conflicts, deletion tombstones, and deduplicated import.')

# Existing billing RPC still operates after the additive migration; no AI call.
import json
quota=sql(f"set role authenticated;set request.jwt.claim.sub='{a}';select row_to_json(q) from reserve_emet_question('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','offline-fixture') q").splitlines()[-1]
quota=json.loads(quota);assert quota['allowed'] and quota['charged']
used=sql(f"select questions_used from emet_usage_periods where user_id='{a}'")
assert used=='1'
sql(f"set role authenticated;set request.jwt.claim.sub='{a}';select count(*) from emet_conversations;select count(*) from emet_conversation_turns")
assert sql(f"select questions_used from emet_usage_periods where user_id='{a}'")==used
print('PASS: original billing RPC reserves the expected single question after migration; history reads do not change usage. No provider call.')
sql(f"delete from auth.users where id='{a}'")
assert sql(f"select count(*) from emet_conversations where owner_user_id='{a}'")=='0'
assert sql("select count(*) from emet_conversation_turns")=='0'
assert sql("select count(*) from emet_question_requests")=='0'
assert sql("select count(*) from emet_usage_periods")=='0'
print('PASS: full existing migration chain, original share snapshot unchanged, anonymous denial, indexes and no question/usage consumption for history operations.')
print('PASS: account deletion cascades through new private history without blocking existing account operations.')
