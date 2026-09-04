-- Per-candidate interview invitations.
-- Run after supabase/schema.sql and supabase/schema_reports.sql.
-- Idempotent: safe to re-run.

-- Why a table rather than a list inside panels.config
-- ---------------------------------------------------
-- Invitations are written by the recruiter, read by an anonymous backend on
-- every candidate page load, and updated mid-interview (attempts, status). A
-- JSON array inside the panel config would mean rewriting the whole panel
-- document to record one attempt, with two concurrent candidates able to lose
-- each other's writes. This is relational data and belongs in a table.

create table if not exists public.interview_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  panel_id uuid not null references public.panels (id) on delete cascade,

  email text not null,
  candidate_name text not null default '',

  -- The candidate's credential. Whoever holds this token is treated as that
  -- candidate, subject to the email confirmation the backend also enforces.
  --
  -- Stored in the clear, deliberately. Hashing it would mean the link could be
  -- shown exactly once and never re-copied or re-sent, which is not how anyone
  -- actually runs a hiring process. The mitigations are that only the owner can
  -- read this table (RLS below), the anon browser key cannot reach it at all,
  -- and a leaked token is revocable and expiring rather than permanent.
  token text not null,

  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 1,
  expires_at timestamptz,

  started_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,

  session_id text,
  report_id uuid references public.interview_reports (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interview_invitations_status_check
    check (status in ('pending', 'started', 'completed', 'revoked')),
  -- Emails are compared case-insensitively everywhere, so store them folded
  -- once at write time instead of hoping every reader remembers to lower().
  constraint interview_invitations_email_lower check (email = lower(email)),
  constraint interview_invitations_email_shape check (position('@' in email) > 1),
  constraint interview_invitations_attempts_check check (attempts >= 0 and max_attempts >= 1),
  -- 32 chars is far below the 43 a 256-bit token produces; it exists to reject
  -- an obviously-truncated or hand-typed value, not to validate entropy.
  constraint interview_invitations_token_length check (char_length(token) >= 32)
);

create unique index if not exists interview_invitations_token_uidx
  on public.interview_invitations (token);
-- One live invitation per candidate per interview. Re-inviting the same address
-- updates the existing row rather than issuing a second competing link.
create unique index if not exists interview_invitations_panel_email_uidx
  on public.interview_invitations (panel_id, email);
create index if not exists interview_invitations_user_created_idx
  on public.interview_invitations (user_id, created_at desc);
create index if not exists interview_invitations_panel_status_idx
  on public.interview_invitations (panel_id, status, created_at desc);

drop trigger if exists interview_invitations_set_updated_at on public.interview_invitations;
create trigger interview_invitations_set_updated_at
  before update on public.interview_invitations
  for each row execute function public.set_updated_at();

-- The report a candidate produced, so the console can show "invited ->
-- completed -> scored" without joining through session ids.
alter table public.interview_reports add column if not exists candidate_email text not null default '';
create index if not exists interview_reports_candidate_email_idx
  on public.interview_reports (user_id, candidate_email);

alter table public.interview_invitations enable row level security;

-- Owner-only, with no policy for anonymous readers on purpose. Candidates never
-- query this table: they hold a token, and FastAPI resolves it for them with
-- the secret key. If the browser could read invitations by token, the token
-- would be checkable offline and every other control here would be advisory.
drop policy if exists "invitations_select_own" on public.interview_invitations;
create policy "invitations_select_own" on public.interview_invitations
  for select using (auth.uid() = user_id);
drop policy if exists "invitations_insert_own" on public.interview_invitations;
create policy "invitations_insert_own" on public.interview_invitations
  for insert with check (auth.uid() = user_id);
drop policy if exists "invitations_update_own" on public.interview_invitations;
create policy "invitations_update_own" on public.interview_invitations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "invitations_delete_own" on public.interview_invitations;
create policy "invitations_delete_own" on public.interview_invitations
  for delete using (auth.uid() = user_id);

select relname, relrowsecurity as rls_enabled
from pg_class where oid = 'public.interview_invitations'::regclass;
