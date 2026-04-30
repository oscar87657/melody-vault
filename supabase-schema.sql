-- Run this in your Supabase SQL Editor

create table if not exists patterns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '새 패턴',
  type        text not null check (type in ('chord', 'melody')),
  tags        text[] not null default '{}',
  notes       jsonb not null default '[]',
  bpm         integer not null default 120,
  measures    integer not null default 4,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row-level security: users can only see/edit their own patterns
alter table patterns enable row level security;

create policy "Users can manage their own patterns"
  on patterns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast user lookups
create index if not exists patterns_user_id_idx on patterns(user_id);
create index if not exists patterns_updated_at_idx on patterns(updated_at desc);
