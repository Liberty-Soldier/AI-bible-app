begin;

select plan(8);

insert into auth.users (id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

select ok(
  not has_table_privilege('anon', 'public.reader_libraries', 'select,insert,update,delete'),
  'anonymous visitors have no reader library privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.reader_libraries', 'select,insert,update')
    and not has_table_privilege('authenticated', 'public.reader_libraries', 'delete'),
  'authenticated users receive only the required privileges'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.reader_libraries (user_id)
    values ('11111111-1111-4111-8111-111111111111')$$,
  'a user can create their own library'
);

select throws_ok(
  $$insert into public.reader_libraries (user_id)
    values ('22222222-2222-4222-8222-222222222222')$$,
  '42501',
  null,
  'a user cannot create another user library'
);

select results_eq(
  $$select user_id::text from public.reader_libraries order by user_id$$,
  array['11111111-1111-4111-8111-111111111111'],
  'a user sees only their own library'
);

select lives_ok(
  $$update public.reader_libraries set revision = 1
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'a user can update their own library'
);

reset role;
insert into public.reader_libraries (user_id)
values ('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select results_eq(
  $$select count(*)::bigint from public.reader_libraries$$,
  array[1::bigint],
  'another user library remains hidden'
);

select is(
  (select revision from public.reader_libraries where user_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'the authorized update was saved'
);

select * from finish();
rollback;
