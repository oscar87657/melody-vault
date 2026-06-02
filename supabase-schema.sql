-- Run this in your Supabase SQL Editor

create table if not exists folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table folders enable row level security;

drop policy if exists "Users can manage their own folders" on folders;
create policy "Users can manage their own folders"
  on folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists folders_user_id_idx on folders(user_id);

create table if not exists patterns (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  folder_id    uuid references folders(id) on delete set null,
  name         text not null default '새 패턴',
  type         text not null check (type in ('chord', 'melody', 'drum')),
  tags         text[] not null default '{}',
  notes        jsonb not null default '[]',
  bpm          integer not null default 120,
  measures     integer not null default 4,
  share_token  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- For existing tables (idempotent migration)
alter table patterns add column if not exists share_token uuid;
alter table patterns add column if not exists folder_id uuid references folders(id) on delete set null;
-- Update type check to allow 'drum'
alter table patterns drop constraint if exists patterns_type_check;
alter table patterns add constraint patterns_type_check check (type in ('chord', 'melody', 'drum'));

-- Row-level security: users can only see/edit their own patterns
alter table patterns enable row level security;

create policy "Users can manage their own patterns"
  on patterns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anonymous read for patterns with a share_token (read-only public sharing)
drop policy if exists "Anyone can read shared patterns" on patterns;
create policy "Anyone can read shared patterns"
  on patterns for select
  to anon, authenticated
  using (share_token is not null);

-- Indexes
create index if not exists patterns_user_id_idx on patterns(user_id);
create index if not exists patterns_updated_at_idx on patterns(updated_at desc);
create index if not exists patterns_folder_id_idx on patterns(folder_id);
create unique index if not exists patterns_share_token_idx on patterns(share_token) where share_token is not null;
