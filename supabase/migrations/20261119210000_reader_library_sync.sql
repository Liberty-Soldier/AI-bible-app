create table public.reader_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  library jsonb not null default '{"bookmarks":[],"highlights":[],"notes":[],"highlightCollections":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reader_libraries_library_object
    check (jsonb_typeof(library) = 'object'),
  constraint reader_libraries_library_size
    check (pg_column_size(library) <= 2000000)
);

alter table public.reader_libraries enable row level security;

revoke all on table public.reader_libraries from anon, authenticated;
grant select, insert, update on table public.reader_libraries to authenticated;

create policy "Users can read their own reader library"
on public.reader_libraries
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own reader library"
on public.reader_libraries
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own reader library"
on public.reader_libraries
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
