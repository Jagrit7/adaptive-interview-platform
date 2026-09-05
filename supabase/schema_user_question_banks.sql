-- Per-user question banks: a recruiter's own questions, stored the same way the
-- built-in banks are, and visible only to them.
-- Run after supabase/schema.sql. Idempotent.

-- Why two tables rather than one jsonb column
-- -------------------------------------------
-- A bank is edited item by item - rename one question, drop another, add ten
-- from a CSV. As a single jsonb document every one of those rewrites the whole
-- bank, and two tabs editing the same bank silently lose each other's work.
-- Rows also let the item list be paged and counted without loading every
-- question, which the picker in the builder needs.

create table if not exists public.user_question_banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Mirrors QuestionDomain in backend/app/schemas/panel.py. The orchestrator
  -- refuses to give an interviewer a question outside its domain, so a bank
  -- whose domain does not match the interviewer using it would be filtered
  -- away to nothing at session start - the dead-air failure again.
  domain text not null default 'general',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_question_banks_name_length check (char_length(trim(name)) between 1 and 120),
  constraint user_question_banks_domain_check
    check (domain in ('dsa', 'system_design', 'behavioural', 'product', 'customer', 'general'))
);

-- One bank per name per user, so re-importing a CSV updates rather than
-- quietly creating a second bank with the same label.
create unique index if not exists user_question_banks_owner_name_uidx
  on public.user_question_banks (user_id, lower(trim(name)));
create index if not exists user_question_banks_owner_idx
  on public.user_question_banks (user_id, updated_at desc);

create table if not exists public.user_question_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.user_question_banks (id) on delete cascade,
  -- Denormalised from the parent so RLS on this table is a single-column
  -- comparison rather than a subquery on every row read.
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  ideal_answer text not null default '',
  -- Written vs verbal is not cosmetic: a written question is rendered into the
  -- candidate's editor and a verbal one is only spoken, and the interviewer is
  -- restricted to the kinds its role allows.
  kind text not null default 'verbal',
  domain text not null default 'general',
  difficulty integer,
  tags jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint user_question_bank_items_question_length check (char_length(trim(question)) between 1 and 4000),
  constraint user_question_bank_items_kind_check check (kind in ('coding', 'written', 'verbal')),
  constraint user_question_bank_items_domain_check
    check (domain in ('dsa', 'system_design', 'behavioural', 'product', 'customer', 'general')),
  constraint user_question_bank_items_difficulty_check
    check (difficulty is null or difficulty between 1 and 10),
  constraint user_question_bank_items_tags_array check (jsonb_typeof(tags) = 'array')
);

create index if not exists user_question_bank_items_bank_idx
  on public.user_question_bank_items (bank_id, position, created_at);
create index if not exists user_question_bank_items_owner_idx
  on public.user_question_bank_items (user_id, bank_id);

drop trigger if exists user_question_banks_set_updated_at on public.user_question_banks;
create trigger user_question_banks_set_updated_at
  before update on public.user_question_banks
  for each row execute function public.set_updated_at();

alter table public.user_question_banks enable row level security;
alter table public.user_question_bank_items enable row level security;

-- Owner-only, both tables, all four verbs. These banks are the recruiter's own
-- material and nobody else's business - including other recruiters in the same
-- organisation, who get their own.
drop policy if exists "user_banks_select_own" on public.user_question_banks;
create policy "user_banks_select_own" on public.user_question_banks
  for select using (auth.uid() = user_id);
drop policy if exists "user_banks_insert_own" on public.user_question_banks;
create policy "user_banks_insert_own" on public.user_question_banks
  for insert with check (auth.uid() = user_id);
drop policy if exists "user_banks_update_own" on public.user_question_banks;
create policy "user_banks_update_own" on public.user_question_banks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_banks_delete_own" on public.user_question_banks;
create policy "user_banks_delete_own" on public.user_question_banks
  for delete using (auth.uid() = user_id);

drop policy if exists "user_bank_items_select_own" on public.user_question_bank_items;
create policy "user_bank_items_select_own" on public.user_question_bank_items
  for select using (auth.uid() = user_id);
drop policy if exists "user_bank_items_insert_own" on public.user_question_bank_items;
create policy "user_bank_items_insert_own" on public.user_question_bank_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "user_bank_items_update_own" on public.user_question_bank_items;
create policy "user_bank_items_update_own" on public.user_question_bank_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_bank_items_delete_own" on public.user_question_bank_items;
create policy "user_bank_items_delete_own" on public.user_question_bank_items
  for delete using (auth.uid() = user_id);

select relname, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.user_question_banks'::regclass, 'public.user_question_bank_items'::regclass)
order by relname;
