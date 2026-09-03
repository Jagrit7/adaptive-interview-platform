-- Hierarchical, versioned DSA question bank.
-- Run in the Supabase SQL Editor after supabase/schema.sql.
-- Safe to run repeatedly; seed content is loaded separately by
-- backend/scripts/import_dsa_question_bank.py.

create extension if not exists pgcrypto;

do $$ begin
  create type public.question_lifecycle as enum ('draft', 'published', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.test_case_visibility as enum ('public', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_selection_mode as enum ('topic_exact', 'topic_subtree', 'bank', 'blueprint');
exception when duplicate_object then null; end $$;

create table if not exists public.question_banks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status public.question_lifecycle not null default 'draft',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_topics (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  parent_id uuid references public.question_topics(id) on delete restrict,
  slug text not null,
  name text not null,
  skill_module_slug text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bank_id, slug),
  check (parent_id is null or parent_id <> id)
);

create index if not exists question_topics_parent_idx
  on public.question_topics (bank_id, parent_id, display_order);

create table if not exists public.dsa_questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete restrict,
  slug text not null,
  status public.question_lifecycle not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_id, slug)
);

create table if not exists public.dsa_question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.dsa_questions(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  prompt text not null,
  constraints jsonb not null default '[]'::jsonb,
  difficulty integer not null check (difficulty between 1 and 5),
  duration_seconds integer not null check (duration_seconds between 60 and 10800),
  supported_languages jsonb not null default '["python"]'::jsonb,
  starter_code jsonb not null,
  function_name text not null check (function_name ~ '^[a-z_][a-z0-9_]*$'),
  parameter_names jsonb not null default '[]'::jsonb,
  validator_key text not null,
  solution_outline text not null,
  reference_solution text not null,
  expected_time text not null,
  expected_space text not null,
  provenance_type text not null default 'original',
  source_name text not null default 'Adaptive Interview Platform editorial',
  source_url text,
  source_license text,
  attribution text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

do $$ begin
  alter table public.dsa_questions
    add constraint dsa_questions_current_version_fk
    foreign key (current_version_id) references public.dsa_question_versions(id) on delete restrict;
exception when duplicate_object then null; end $$;

create table if not exists public.dsa_question_topics (
  question_id uuid not null references public.dsa_questions(id) on delete cascade,
  topic_id uuid not null references public.question_topics(id) on delete restrict,
  is_primary boolean not null default false,
  relevance_weight numeric not null default 1 check (relevance_weight > 0),
  primary key (question_id, topic_id)
);

create unique index if not exists dsa_question_one_primary_topic_idx
  on public.dsa_question_topics (question_id) where is_primary;

create table if not exists public.dsa_test_cases (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.dsa_question_versions(id) on delete cascade,
  case_key text not null,
  label text not null,
  input jsonb not null,
  expected jsonb not null,
  visibility public.test_case_visibility not null,
  weight numeric not null default 1 check (weight > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (question_version_id, case_key)
);

create index if not exists dsa_test_cases_version_visibility_idx
  on public.dsa_test_cases (question_version_id, visibility, display_order);

create table if not exists public.dsa_followups (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references public.dsa_question_versions(id) on delete cascade,
  prompt text not null,
  ideal_answer text not null,
  rubric jsonb not null default '{}'::jsonb,
  trigger_key text not null default 'always',
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_blueprints (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete restrict,
  slug text not null,
  name text not null,
  version integer not null default 1 check (version > 0),
  status public.question_lifecycle not null default 'draft',
  question_count integer not null default 1 check (question_count > 0),
  difficulty_min integer not null default 1 check (difficulty_min between 1 and 5),
  difficulty_max integer not null default 3 check (difficulty_max between 1 and 5),
  allow_topic_repetition boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bank_id, slug, version),
  check (difficulty_min <= difficulty_max)
);

create table if not exists public.assessment_blueprint_topics (
  blueprint_id uuid not null references public.assessment_blueprints(id) on delete cascade,
  topic_id uuid not null references public.question_topics(id) on delete restrict,
  selection_scope public.question_selection_mode not null default 'topic_subtree',
  weight numeric not null check (weight > 0),
  min_questions integer not null default 0 check (min_questions >= 0),
  max_questions integer check (max_questions is null or max_questions >= min_questions),
  primary key (blueprint_id, topic_id)
);

create table if not exists public.dsa_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null unique,
  question_id uuid not null references public.dsa_questions(id) on delete restrict,
  question_version_id uuid not null references public.dsa_question_versions(id) on delete restrict,
  selection_mode public.question_selection_mode not null,
  bank_slug text not null,
  requested_topic_slug text,
  selected_topic_slug text,
  blueprint_slug text,
  selection_seed text not null,
  repeat_relaxed boolean not null default false,
  repeat_reason text,
  selected_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  finished_at timestamptz,
  submission_trigger text,
  test_summary jsonb,
  -- Kept nullable and usable even when the optional report schema has not yet
  -- been installed. A conditional FK is added immediately below when present.
  report_id uuid
);

do $$ begin
  if to_regclass('public.interview_reports') is not null then
    begin
      alter table public.dsa_attempts
        add constraint dsa_attempts_report_fk
        foreign key (report_id) references public.interview_reports(id) on delete set null;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists dsa_attempts_user_recent_idx
  on public.dsa_attempts (user_id, selected_at desc);
create index if not exists dsa_attempts_question_exposure_idx
  on public.dsa_attempts (question_id, selected_at desc);

-- Service-only runtime view. Aggregates one immutable question version with
-- topic tags, tests, and verbal rubrics so FastAPI can apply one selection
-- algorithm for both local seed data and Supabase data.
create or replace view public.dsa_question_runtime as
select
  q.id as question_id,
  q.slug,
  q.bank_id,
  b.slug as bank_slug,
  v.id as question_version_id,
  v.version,
  v.title,
  v.prompt,
  v.constraints,
  v.difficulty,
  v.duration_seconds,
  v.supported_languages,
  v.starter_code,
  v.function_name,
  v.parameter_names,
  v.validator_key,
  v.solution_outline,
  v.reference_solution,
  v.expected_time,
  v.expected_space,
  v.provenance_type,
  v.source_name,
  v.source_url,
  v.source_license,
  v.attribution,
  coalesce(topic_rows.topics, '[]'::jsonb) as topics,
  coalesce(test_rows.test_cases, '[]'::jsonb) as test_cases,
  coalesce(followup_rows.followups, '[]'::jsonb) as followups,
  coalesce(exposure_rows.exposure_count, 0) as exposure_count
from public.dsa_questions q
join public.question_banks b on b.id = q.bank_id
join public.dsa_question_versions v on v.id = q.current_version_id
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'slug', t.slug, 'name', t.name, 'parent_slug', parent.slug,
    'is_primary', qt.is_primary, 'relevance_weight', qt.relevance_weight
  ) order by qt.is_primary desc, t.display_order, t.slug) as topics
  from public.dsa_question_topics qt
  join public.question_topics t on t.id = qt.topic_id
  left join public.question_topics parent on parent.id = t.parent_id
  where qt.question_id = q.id
) topic_rows on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id', tc.id, 'case_key', tc.case_key, 'label', tc.label,
    'input', tc.input, 'expected', tc.expected, 'visibility', tc.visibility,
    'weight', tc.weight, 'display_order', tc.display_order
  ) order by tc.visibility, tc.display_order, tc.case_key) as test_cases
  from public.dsa_test_cases tc where tc.question_version_id = v.id
) test_rows on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id', f.id, 'prompt', f.prompt, 'ideal_answer', f.ideal_answer,
    'rubric', f.rubric, 'trigger_key', f.trigger_key,
    'display_order', f.display_order
  ) order by f.display_order, f.id) as followups
  from public.dsa_followups f
  where f.question_version_id = v.id and f.active
) followup_rows on true
left join lateral (
  select count(*)::integer as exposure_count
  from public.dsa_attempts a where a.question_id = q.id
) exposure_rows on true
where q.status = 'published' and b.status = 'published' and v.published_at is not null;

-- Content tables contain hidden tests and solutions. They are never directly
-- readable from a browser role. FastAPI uses a server-side service credential.
alter table public.question_banks enable row level security;
alter table public.question_topics enable row level security;
alter table public.dsa_questions enable row level security;
alter table public.dsa_question_versions enable row level security;
alter table public.dsa_question_topics enable row level security;
alter table public.dsa_test_cases enable row level security;
alter table public.dsa_followups enable row level security;
alter table public.assessment_blueprints enable row level security;
alter table public.assessment_blueprint_topics enable row level security;
alter table public.dsa_attempts enable row level security;

revoke all on public.dsa_question_runtime from anon, authenticated;
grant select on public.dsa_question_runtime to service_role;

drop policy if exists "attempts_select_own" on public.dsa_attempts;
create policy "attempts_select_own" on public.dsa_attempts
  for select to authenticated using (auth.uid() = user_id);

-- Validate minimum case counts before a question version is published.
create or replace function public.validate_dsa_question_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  public_count integer;
  hidden_count integer;
begin
  select count(*) filter (where visibility = 'public'),
         count(*) filter (where visibility = 'hidden')
  into public_count, hidden_count
  from public.dsa_test_cases where question_version_id = p_version_id;

  if public_count < 5 then
    raise exception 'A published DSA question requires at least five public tests';
  end if;
  if hidden_count < 3 then
    raise exception 'A published DSA question requires at least three hidden tests';
  end if;
end;
$$;

revoke all on function public.validate_dsa_question_version(uuid) from public;
grant execute on function public.validate_dsa_question_version(uuid) to service_role;
