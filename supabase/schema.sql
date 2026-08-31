-- Supabase schema for the panels table.
--
-- Safe to run more than once, and safe to run against the table you already
-- created in steps 1-12: every statement is IF NOT EXISTS or DROP-then-CREATE.
-- Run it in the Supabase dashboard under SQL Editor -> New query.
--
-- Run this even if you believe the table is already correct. The most common
-- way this setup fails is a table with RLS enabled but only a SELECT policy, so
-- reads work, saves fail, and the error surfaces as an empty result rather than
-- a permission message.

-- 1. Table ------------------------------------------------------------------

create table if not exists public.panels (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  project_name text not null default 'Untitled panel',
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Columns that may be missing if the table was created earlier from the
-- original four-column sketch.
alter table public.panels add column if not exists updated_at timestamptz not null default now();
alter table public.panels add column if not exists config jsonb not null default '{}'::jsonb;

-- Listing is always "my panels, newest first".
create index if not exists panels_user_id_updated_at_idx
  on public.panels (user_id, updated_at desc);

-- 2. Keep updated_at honest --------------------------------------------------
-- Done in the database rather than the client so a panel's timestamp cannot be
-- forged or forgotten.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists panels_set_updated_at on public.panels;
create trigger panels_set_updated_at
  before update on public.panels
  for each row execute function public.set_updated_at();

-- 3. Row Level Security ------------------------------------------------------
-- This is the actual security boundary of the whole app. The login screen is
-- only UX: the publishable key ships in the browser bundle by design, so
-- anything these policies allow is allowed to anyone. Everything below is
-- scoped to auth.uid().

alter table public.panels enable row level security;

drop policy if exists "panels_select_own" on public.panels;
create policy "panels_select_own"
  on public.panels for select
  using (auth.uid() = user_id);

drop policy if exists "panels_insert_own" on public.panels;
create policy "panels_insert_own"
  on public.panels for insert
  with check (auth.uid() = user_id);

-- USING controls which rows you may target; WITH CHECK controls what they may
-- become. Both are needed, or a user could reassign a panel to someone else.
drop policy if exists "panels_update_own" on public.panels;
create policy "panels_update_own"
  on public.panels for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "panels_delete_own" on public.panels;
create policy "panels_delete_own"
  on public.panels for delete
  using (auth.uid() = user_id);

-- 4. Verify ------------------------------------------------------------------
-- Expect: rls_enabled = true, and exactly four policies.

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.panels'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'panels'
order by policyname;
