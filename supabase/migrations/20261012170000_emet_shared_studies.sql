create table if not exists public.emet_shared_studies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_hash text not null,
  question text not null check (char_length(question) between 1 and 800),
  answer text not null check (char_length(answer) between 1 and 50000),
  citations jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, snapshot_hash)
);

create index if not exists emet_shared_studies_public_idx
  on public.emet_shared_studies (id) where published_at is not null;

alter table public.emet_shared_studies enable row level security;
revoke all on table public.emet_shared_studies from public, anon, authenticated;
grant all on table public.emet_shared_studies to service_role;
