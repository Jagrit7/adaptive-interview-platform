-- Leaderboard, XP, gems and trophies for the individual (practice) side.
-- Run after supabase/schema.sql and supabase/schema_reports.sql. Idempotent.
--
-- The one rule this schema is built around
-- ----------------------------------------
-- A player must never be able to choose their own score. Everything else here
-- follows from that. XP and gems are written only by SECURITY DEFINER functions
-- that read the finished report and compute the award themselves; the RLS
-- policies below give the browser no INSERT or UPDATE on any ledger or on the
-- profile columns that matter. A client that can POST its own XP has a
-- leaderboard that measures willingness to open devtools.

-- ---------------------------------------------------------------- profile ----

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  -- Denormalised running totals. Both are re-derivable from the ledgers below,
  -- which is the point: if a bug ever corrupts them the truth is recoverable.
  total_xp integer not null default 0 check (total_xp >= 0),
  gems integer not null default 0 check (gems >= 0),
  streak_days integer not null default 0 check (streak_days >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_active_on date,
  is_premium boolean not null default false,
  premium_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Shown on other players' leaderboards, so it is bounded here rather than
  -- trusted from the browser that sets it.
  constraint player_profiles_display_name_length check (char_length(display_name) <= 40)
);

alter table public.player_profiles drop constraint if exists player_profiles_display_name_length;
alter table public.player_profiles
  add constraint player_profiles_display_name_length check (char_length(display_name) <= 40);

drop trigger if exists player_profiles_set_updated_at on public.player_profiles;
create trigger player_profiles_set_updated_at
  before update on public.player_profiles
  for each row execute function public.set_updated_at();

-- Level from cumulative XP: level = floor(sqrt(total_xp / 25)) + 1.
--
-- A square-root curve rather than a linear one so early levels arrive quickly
-- (level 2 at 25 XP, level 5 at 400) and later ones take real work (level 20 at
-- 9,025). Linear levelling makes level 30 feel identical to level 3; a curve
-- that is too steep makes the second level feel unreachable and is where most
-- players quit.
create or replace function public.level_for_xp(xp integer)
returns integer language sql immutable parallel safe
as $$ select greatest(1, floor(sqrt(greatest(xp, 0)::numeric / 25))::integer + 1) $$;

create or replace function public.xp_for_level(level integer)
returns integer language sql immutable parallel safe
as $$ select (greatest(level, 1) - 1) * (greatest(level, 1) - 1) * 25 $$;

-- ---------------------------------------------------------------- ledgers ----

-- Append-only. Never updated, never deleted: a balance you cannot explain is a
-- balance you cannot defend when a player says the number is wrong.
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  source text not null,
  -- The report or attempt that earned it, so the same event cannot be counted
  -- twice - see the unique index below.
  ref_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint xp_events_source_check
    check (source in ('interview', 'trophy', 'streak', 'league_promotion', 'daily_first', 'adjustment'))
);

create unique index if not exists xp_events_source_ref_uidx
  on public.xp_events (user_id, source, ref_id) where ref_id is not null;
create index if not exists xp_events_user_time_idx
  on public.xp_events (user_id, created_at desc);

create table if not exists public.gem_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Signed: faucets are positive, sinks negative. One table so a balance is a
  -- single sum and an audit is a single scan.
  amount integer not null check (amount <> 0),
  source text not null,
  ref_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gem_events_source_check
    check (source in (
      'daily_first', 'trophy', 'league_promotion', 'streak_milestone', 'premium_stipend', 'purchase',
      'spend_retry', 'spend_streak_freeze', 'spend_premium_bank', 'spend_report_deepdive', 'adjustment'
    ))
);

create unique index if not exists gem_events_source_ref_uidx
  on public.gem_events (user_id, source, ref_id) where ref_id is not null;
create index if not exists gem_events_user_time_idx
  on public.gem_events (user_id, created_at desc);

-- ---------------------------------------------------------------- leagues ----

-- Ten tiers, promotion and demotion each week, cohorts of thirty. Weekly XP
-- rather than lifetime is what makes this a competition rather than a wall of
-- veterans: a player who joins today can win their cohort this week.
create table if not exists public.league_tiers (
  tier smallint primary key check (tier between 1 and 10),
  name text not null unique,
  -- How many are promoted and demoted out of a cohort of 30. Promotion narrows
  -- as the tiers climb, so the top is genuinely hard to reach and hold.
  promote_count smallint not null check (promote_count >= 0),
  demote_count smallint not null check (demote_count >= 0),
  promotion_gems smallint not null default 0,
  min_premium boolean not null default false
);

insert into public.league_tiers (tier, name, promote_count, demote_count, promotion_gems, min_premium) values
  (1,  'Bronze',    15, 0,  5,  false),
  (2,  'Silver',    15, 5,  5,  false),
  (3,  'Gold',      12, 5,  10, false),
  (4,  'Sapphire',  10, 5,  10, false),
  (5,  'Ruby',      10, 6,  15, false),
  (6,  'Emerald',   8,  6,  15, false),
  (7,  'Amethyst',  8,  7,  20, false),
  (8,  'Pearl',     7,  7,  25, false),
  (9,  'Obsidian',  5,  8,  30, false),
  (10, 'Diamond',   0,  5,  50, false)
on conflict (tier) do update set
  name = excluded.name, promote_count = excluded.promote_count,
  demote_count = excluded.demote_count, promotion_gems = excluded.promotion_gems;

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null unique,
  ends_on date not null,
  closed_at timestamptz,
  check (ends_on > starts_on)
);

create table if not exists public.league_cohorts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons (id) on delete cascade,
  tier smallint not null references public.league_tiers (tier),
  created_at timestamptz not null default now()
);

create index if not exists league_cohorts_season_tier_idx
  on public.league_cohorts (season_id, tier);

create table if not exists public.league_members (
  cohort_id uuid not null references public.league_cohorts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  -- Filled when the season closes: 'promoted' | 'held' | 'demoted'.
  result text,
  joined_at timestamptz not null default now(),
  primary key (cohort_id, user_id),
  constraint league_members_result_check check (result is null or result in ('promoted', 'held', 'demoted'))
);

-- Let PostgREST embed the profile when reading the board.
--
-- Both tables pointed at auth.users and never at each other, so
-- `league_members.select(...player_profiles!inner(...))` failed with "Could not
-- find a relationship between 'league_members' and 'player_profiles' in the
-- schema cache" and the leaderboard rendered an error instead of rankings.
--
-- The foreign key is also the honest statement of the invariant: a league
-- member is a player, and every path that creates a membership creates the
-- profile first.
insert into public.player_profiles (user_id)
select distinct lm.user_id from public.league_members lm
where not exists (select 1 from public.player_profiles p where p.user_id = lm.user_id)
on conflict (user_id) do nothing;

alter table public.league_members drop constraint if exists league_members_player_fk;
alter table public.league_members
  add constraint league_members_player_fk
  foreign key (user_id) references public.player_profiles (user_id) on delete cascade;

-- PostgREST caches the schema; without this the new relationship is not visible
-- until the next reload.
notify pgrst, 'reload schema';

-- The leaderboard read: every query is "this cohort, ordered by weekly XP".
create index if not exists league_members_board_idx
  on public.league_members (cohort_id, weekly_xp desc, joined_at);
create index if not exists league_members_user_idx
  on public.league_members (user_id);

-- --------------------------------------------------------------- trophies ----

-- Six, not sixty. A small set of earned-feeling awards beats a wall of
-- participation icons: repetition badges produce output but not pride, and a
-- collection every veteran holds identically stops being worth looking at.
-- Layered on purpose - one reachable on day one, one that needs a week, two
-- that need skill, one that needs breadth, one that needs beating other people.
create table if not exists public.trophies (
  code text primary key,
  name text not null,
  description text not null,
  hint text not null default '',
  xp_reward integer not null default 0 check (xp_reward >= 0),
  gem_reward integer not null default 0 check (gem_reward >= 0),
  display_order smallint not null default 0
);

insert into public.trophies (code, name, description, hint, xp_reward, gem_reward, display_order) values
  ('first_round',    'First Round',    'Complete your first interview.',
   'Finish any interview from start to end.', 50, 10, 1),
  ('week_warrior',   'Week Warrior',   'Practise seven days in a row.',
   'A seven-day streak.', 150, 25, 2),
  ('sharp_shooter',  'Sharp Shooter',  'Score 90 or above in any interview.',
   'Ninety out of a hundred, once.', 200, 30, 3),
  ('system_thinker', 'System Thinker', 'Score 80 or above in a system design interview.',
   'Design something well under questioning.', 200, 30, 4),
  ('polyglot',       'Polyglot',       'Complete interviews in three different languages.',
   'Three languages, three finished interviews.', 250, 40, 5),
  ('promoted',       'Promoted',       'Win promotion out of any league.',
   'Finish a week inside your cohort''s promotion zone.', 100, 20, 6)
on conflict (code) do update set
  name = excluded.name, description = excluded.description, hint = excluded.hint,
  xp_reward = excluded.xp_reward, gem_reward = excluded.gem_reward,
  display_order = excluded.display_order;

create table if not exists public.user_trophies (
  user_id uuid not null references auth.users (id) on delete cascade,
  trophy_code text not null references public.trophies (code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, trophy_code)
);

create index if not exists user_trophies_user_idx on public.user_trophies (user_id, earned_at desc);

-- ------------------------------------------------------ awarding functions ----

-- Premium is a state with an end date, not a flag somebody forgot to clear.
-- Everything that grants a premium benefit asks this, so a lapsed subscription
-- stops paying out without a sweeper job having to run first.
create or replace function public.is_premium_active(p_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select p.is_premium and (p.premium_until is null or p.premium_until > now())
     from public.player_profiles p where p.user_id = p_user), false)
$$;


-- Granting premium is deliberately not something a player can call: the
-- function is revoked from `authenticated` below, so only the service key (and
-- therefore only a server holding it, e.g. a billing webhook) can run it.
create or replace function public.grant_premium(p_user uuid, p_days integer)
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare
  ends_at timestamptz;
begin
  if p_days <= 0 then raise exception 'A grant must be a positive number of days'; end if;
  insert into public.player_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  -- Extends an existing subscription rather than truncating it, so renewing
  -- early never costs the player the time they already paid for.
  update public.player_profiles set
    is_premium = true,
    premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days)
  where user_id = p_user
  returning premium_until into ends_at;
  return ends_at;
end;
$$;


create or replace function public.current_season()
returns public.league_seasons language plpgsql security definer set search_path = public
as $$
declare
  monday date := (current_date - ((extract(isodow from current_date)::integer - 1)));
  season public.league_seasons;
begin
  select * into season from public.league_seasons where starts_on = monday;
  if not found then
    insert into public.league_seasons (starts_on, ends_on) values (monday, monday + 7)
    on conflict (starts_on) do nothing;
    select * into season from public.league_seasons where starts_on = monday;

    -- Settle every week that has ended and was never closed.
    --
    -- Rolling over lazily, on the first activity of a new week, rather than
    -- relying only on a scheduler: a cron job that silently stops leaves the
    -- league frozen with nobody promoted and the 'promoted' trophy permanently
    -- unearnable, and nothing in the product would show it had happened. The
    -- optional pg_cron job at the bottom of this file still runs it on time for
    -- players who do not open the app on a Monday; this is the backstop that
    -- makes the scheduler an optimisation rather than a dependency.
    perform public.close_league_season(prior.id)
    from public.league_seasons prior
    where prior.closed_at is null and prior.ends_on <= current_date;
  end if;
  return season;
end;
$$;

-- Place a player in a cohort of at most 30 at their current tier, creating one
-- when every existing cohort is full.
create or replace function public.ensure_league_membership(p_user uuid, p_tier smallint default 1)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  season public.league_seasons := public.current_season();
  v_cohort_id uuid;
begin
  select lm.cohort_id into v_cohort_id
  from public.league_members lm
  join public.league_cohorts lc on lc.id = lm.cohort_id
  where lm.user_id = p_user and lc.season_id = season.id;
  if v_cohort_id is not null then return v_cohort_id; end if;

  select lc.id into v_cohort_id
  from public.league_cohorts lc
  where lc.season_id = season.id and lc.tier = p_tier
    and (select count(*) from public.league_members m where m.cohort_id = lc.id) < 30
  order by lc.created_at
  limit 1;

  if v_cohort_id is null then
    insert into public.league_cohorts (season_id, tier) values (season.id, p_tier) returning id into v_cohort_id;
  end if;

  insert into public.league_members (cohort_id, user_id) values (v_cohort_id, p_user)
  on conflict (cohort_id, user_id) do nothing;
  return v_cohort_id;
end;
$$;

-- The only writer of XP. SECURITY DEFINER so it can insert into the ledger the
-- caller has no INSERT policy on, and it derives the amount from the stored
-- report rather than accepting one.
--
-- XP = base(difficulty) * (0.4 + 0.6 * score) * repeat_factor
--
-- The 0.4 floor keeps a poor-but-honest attempt worth doing - a reward that can
-- be zero teaches players to avoid the hard thing rather than attempt it - and
-- the 0.6 span still makes a strong answer worth roughly two and a half weak
-- ones. repeat_factor halves for each retake of the same panel, floored at 0.1,
-- so grinding one easy interview converges on nothing while a first attempt at
-- something new always pays full.
create or replace function public.award_interview_xp(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  report public.interview_reports;
  prior integer;
  base integer;
  score numeric;
  repeat_factor numeric;
  xp integer;
  profile public.player_profiles;
  cohort uuid;
  awarded_trophies text[] := '{}';
begin
  select * into report from public.interview_reports where id = p_report_id;
  if not found then raise exception 'No such report'; end if;
  -- The caller may only bank their own interview.
  if report.user_id <> auth.uid() then raise exception 'That report belongs to someone else'; end if;
  if not report.completed then return jsonb_build_object('xp', 0, 'reason', 'interview not completed'); end if;

  -- Idempotent: the unique index on (user_id, source, ref_id) makes a second
  -- call a no-op rather than a second payout, which matters because the client
  -- retries this on a flaky connection.
  if exists (select 1 from public.xp_events where user_id = report.user_id
             and source = 'interview' and ref_id = p_report_id::text) then
    return jsonb_build_object('xp', 0, 'reason', 'already awarded');
  end if;

  -- Was this interview authorised when it started?
  --
  -- begin_interview already made that decision and recorded a start row, and a
  -- player cannot forge one: interview_starts has no INSERT policy, so the only
  -- writer is that SECURITY DEFINER function.
  --
  -- Re-running the *allowance* here instead was wrong in the worst possible
  -- way. The allowance counts today's starts, and by the time the award runs,
  -- this interview's own start is one of them - so a free player's first and
  -- only interview of the day found used = 1, concluded the limit was reached,
  -- and paid nothing. Every free user, every interview, zero XP.
  --
  -- The allowance check still applies when no start was recorded, which covers
  -- a client that never called begin_interview.
  if not exists (
    select 1 from public.interview_starts
    where user_id = report.user_id and session_ref = report.session_id
  ) and not (public.daily_interview_allowance(report.user_id)->>'allowed')::boolean then
    return jsonb_build_object('xp', 0, 'reason', 'daily limit reached',
                              'limit_reached', true);
  end if;

  select count(*) into prior from public.interview_reports r
  where r.user_id = report.user_id
    and r.completed and r.created_at < report.created_at
    and (
      case
        when report.panel_id is not null then r.panel_id = report.panel_id
        -- No panel means a skill-path round, where panel_name carries the
        -- question. Grouping those by "panel_id is null" would make every DSA
        -- problem a retake of the previous one.
        else r.panel_id is null and r.panel_name = report.panel_name
      end
    );

  score := coalesce(report.overall_score, 0);
  base := case
    when score >= 0 and report.panel_name ilike '%design%' then 250
    when report.panel_name ilike '%behav%' then 150
    else 200
  end;
  repeat_factor := greatest(0.1, power(0.5, least(prior, 4)));
  xp := greatest(10, round(base * (0.4 + 0.6 * score) * repeat_factor)::integer);

  insert into public.xp_events (user_id, amount, source, ref_id, detail)
  values (report.user_id, xp, 'interview', p_report_id::text,
          jsonb_build_object('score', score, 'base', base, 'repeat_factor', repeat_factor));

  -- A start that produced a report counts for the rest of the day, not just for
  -- the grace window.
  update public.interview_starts set banked = true
  where user_id = report.user_id and session_ref = report.session_id;

  insert into public.player_profiles (user_id, total_xp, display_name)
  values (report.user_id, xp, public.default_display_name())
  on conflict (user_id) do update set total_xp = public.player_profiles.total_xp + xp;

  -- Weekly league standing moves with the same event.
  cohort := public.ensure_league_membership(report.user_id,
    least(10, public.level_for_xp((select total_xp from public.player_profiles where user_id = report.user_id)))::smallint);
  update public.league_members set weekly_xp = weekly_xp + xp
  where cohort_id = cohort and user_id = report.user_id;

  select * into profile from public.player_profiles where user_id = report.user_id;
  awarded_trophies := public.evaluate_trophies(report.user_id);

  return jsonb_build_object(
    'xp', xp, 'total_xp', profile.total_xp, 'level', public.level_for_xp(profile.total_xp),
    'gems', profile.gems, 'trophies', to_jsonb(awarded_trophies));
end;
$$;

-- A readable name for a player who never set one.
--
-- Falls back through the signup metadata to the email's local part, which is
-- the last thing available that is still recognisably about this person:
-- "priya.sharma@acme.com" becomes "Priya Sharma". Derived inside a SECURITY
-- DEFINER function because the browser cannot read auth.users, and seeded on
-- first activity so existing players pick a name up without a backfill.
create or replace function public.default_display_name()
returns text language sql stable security definer set search_path = public
as $$
  select left(coalesce(
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(initcap(replace(replace(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '.', ' '), '_', ' ')), ''),
    'Learner'
  ), 40)
$$;


-- Every interview a player opens, whether or not it produced a report.
--
-- The allowance used to count interviews *banked*, which left the hole of
-- starting several and banking only the best. Counting starts closes it, but
-- naively it creates a worse problem: a dropped connection would burn
-- somebody's only attempt of the day.
--
-- The grace window below is the fix. A start counts if it produced a report, or
-- if it is still recent enough to plausibly be in progress. A session abandoned
-- to a crash stops counting after thirty minutes, and nothing has to sweep the
-- table for that to happen.
create table if not exists public.interview_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_ref text not null,
  banked boolean not null default false,
  started_at timestamptz not null default now()
);

create index if not exists interview_starts_user_day_idx
  on public.interview_starts (user_id, started_at desc);
create unique index if not exists interview_starts_session_uidx
  on public.interview_starts (user_id, session_ref);

-- SECURITY DEFINER with a caller-supplied uuid meant any signed-in user could
-- read anyone else's usage and premium status. The argument stays for the
-- internal callers, which always pass the acting user, but a mismatch is now
-- refused rather than answered.
create or replace function public.daily_interview_allowance(p_user uuid default auth.uid())
returns jsonb language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is not null and p_user is distinct from auth.uid()
      then jsonb_build_object('error', 'not your allowance')
    else jsonb_build_object(
    'premium', public.is_premium_active(p_user),
    'used', used.count,
    'limit', case when public.is_premium_active(p_user) then null else 1 end,
    'allowed', public.is_premium_active(p_user) or used.count < 1
  ) end
  from (
    select count(*)::integer as count
    from public.interview_starts
    where user_id = p_user
      and started_at >= date_trunc('day', now())
      and (banked or started_at > now() - interval '30 minutes')
  ) used
$$;


-- Claim one of the day's attempts. Called before an interview begins, so a
-- player is told up front rather than after sitting a full round for nothing.
create or replace function public.begin_interview(p_session_ref text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  allowance jsonb;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  insert into public.player_profiles (user_id, display_name)
  values (uid, public.default_display_name())
  on conflict (user_id) do nothing;

  -- Re-entering the same session (a refresh, a reconnect) must not cost a
  -- second attempt, which is what the unique index on (user_id, session_ref)
  -- guarantees.
  if exists (select 1 from public.interview_starts
             where user_id = uid and session_ref = p_session_ref) then
    return public.daily_interview_allowance(uid) || jsonb_build_object('resumed', true);
  end if;

  allowance := public.daily_interview_allowance(uid);
  if not (allowance->>'allowed')::boolean then
    return allowance || jsonb_build_object('started', false);
  end if;

  insert into public.interview_starts (user_id, session_ref) values (uid, p_session_ref);
  return public.daily_interview_allowance(uid) || jsonb_build_object('started', true);
end;
$$;


-- Checks every trophy condition and grants the ones newly met. Returns the
-- codes granted on this call so the UI can celebrate exactly those.
create or replace function public.evaluate_trophies(p_user uuid)
returns text[] language plpgsql security definer set search_path = public
as $$
declare
  granted text[] := '{}';
  -- Prefixed because an unprefixed `code` collides with trophies.code, and
  -- PL/pgSQL resolves that as an ambiguous column reference at runtime rather
  -- than at definition time.
  v_code text;
  profile public.player_profiles;
begin
  select * into profile from public.player_profiles where user_id = p_user;
  if not found then return granted; end if;

  for v_code in
    select t.code from public.trophies t
    where not exists (select 1 from public.user_trophies ut
                      where ut.user_id = p_user and ut.trophy_code = t.code)
  loop
    if (v_code = 'first_round' and exists (
          select 1 from public.interview_reports where user_id = p_user and completed))
    or (v_code = 'week_warrior' and profile.streak_days >= 7)
    or (v_code = 'sharp_shooter' and exists (
          select 1 from public.interview_reports where user_id = p_user and completed and overall_score >= 0.9))
    or (v_code = 'system_thinker' and exists (
          select 1 from public.interview_reports where user_id = p_user and completed
            and overall_score >= 0.8 and panel_name ilike '%design%'))
    or (v_code = 'polyglot' and (
          select count(distinct language) from public.interview_reports
          where user_id = p_user and completed and language <> '') >= 3)
    or (v_code = 'promoted' and exists (
          select 1 from public.league_members where user_id = p_user and result = 'promoted'))
    then
      insert into public.user_trophies (user_id, trophy_code) values (p_user, v_code)
      on conflict do nothing;
      granted := granted || v_code;

      insert into public.xp_events (user_id, amount, source, ref_id, detail)
      select p_user, t.xp_reward, 'trophy', t.code, jsonb_build_object('trophy', t.code)
      from public.trophies t where t.code = v_code and t.xp_reward > 0;

      insert into public.gem_events (user_id, amount, source, ref_id, detail)
      select p_user, t.gem_reward, 'trophy', t.code, jsonb_build_object('trophy', t.code)
      from public.trophies t where t.code = v_code and t.gem_reward > 0;

      update public.player_profiles p set
        total_xp = p.total_xp + t.xp_reward,
        gems     = p.gems     + t.gem_reward
      from public.trophies t
      where t.code = v_code and p.user_id = p_user;
    end if;
  end loop;

  return granted;
end;
$$;

-- Daily streak plus the once-a-day gem faucet. Called on any meaningful
-- activity; safe to call repeatedly within a day.
create or replace function public.touch_daily_activity()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  profile public.player_profiles;
  gems_awarded integer := 0;
  premium_multiplier integer;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  insert into public.player_profiles (user_id, display_name)
  values (uid, public.default_display_name())
  on conflict (user_id) do nothing;
  -- Backfill for players whose profile predates name seeding.
  update public.player_profiles set display_name = public.default_display_name()
  where user_id = uid and coalesce(trim(display_name), '') = '';
  select * into profile from public.player_profiles where user_id = uid;

  if profile.last_active_on is null or profile.last_active_on < current_date then
    -- Yesterday continues the streak; any older gap restarts it at 1.
    update public.player_profiles set
      streak_days = case when profile.last_active_on = current_date - 1 then profile.streak_days + 1 else 1 end,
      longest_streak = greatest(profile.longest_streak,
        case when profile.last_active_on = current_date - 1 then profile.streak_days + 1 else 1 end),
      last_active_on = current_date
    where user_id = uid;

    -- Premium earns gems at double rate. This is the deliberate free/premium
    -- split: both can earn, one earns faster, and neither is locked out.
    premium_multiplier := case when public.is_premium_active(uid) then 2 else 1 end;
    gems_awarded := 5 * premium_multiplier;
    insert into public.gem_events (user_id, amount, source, ref_id, detail)
    values (uid, gems_awarded, 'daily_first', current_date::text,
            jsonb_build_object('premium', public.is_premium_active(uid)))
    on conflict do nothing;
    -- Only credit the balance if the ledger row was actually written. Without
    -- this guard a same-day replay adds gems while `on conflict do nothing`
    -- silently skips the ledger, and the balance stops being re-derivable from
    -- the ledger - which is the one property the whole append-only design
    -- exists to give.
    if found then
      update public.player_profiles set gems = gems + gems_awarded where user_id = uid;
    else
      gems_awarded := 0;
    end if;
  end if;

  -- Monthly premium stipend, paid on first activity of the month rather than by
  -- a scheduled job. ref_id is the year-month, so the unique index on
  -- (user_id, source, ref_id) makes a second call in the same month a no-op -
  -- the same idempotency trick the XP award uses, for the same reason.
  if public.is_premium_active(uid) then
    insert into public.gem_events (user_id, amount, source, ref_id, detail)
    values (uid, 150, 'premium_stipend', to_char(current_date, 'YYYY-MM'),
            jsonb_build_object('month', to_char(current_date, 'YYYY-MM')))
    on conflict (user_id, source, ref_id) do nothing;
    if found then
      update public.player_profiles set gems = gems + 150 where user_id = uid;
      gems_awarded := gems_awarded + 150;
    end if;
  end if;

  perform public.evaluate_trophies(uid);
  select * into profile from public.player_profiles where user_id = uid;
  return jsonb_build_object('streak_days', profile.streak_days, 'gems', profile.gems,
                            'gems_awarded', gems_awarded);
end;
$$;

-- Spend gems. Refuses rather than allowing a negative balance, and records what
-- the spend bought so the ledger explains the balance.
create or replace function public.gem_price(p_source text)
returns integer language sql immutable parallel safe
as $$
  select case p_source
    when 'spend_retry' then 20
    when 'spend_streak_freeze' then 30
    when 'spend_premium_bank' then 40
    when 'spend_report_deepdive' then 25
  end
$$;


-- All four prices in one call. loadGemPrices() was making a round-trip per sink
-- to render a four-row list.
create or replace function public.gem_prices()
returns jsonb language sql immutable parallel safe
as $$
  select jsonb_object_agg(source, public.gem_price(source))
  from unnest(array['spend_retry', 'spend_streak_freeze',
                    'spend_premium_bank', 'spend_report_deepdive']) as source
$$;


-- The old three-argument form let the caller name its own price; drop it so no
-- stale client can keep calling it.
drop function if exists public.spend_gems(text, integer, text);

create or replace function public.spend_gems(p_source text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  balance integer;
  p_amount integer;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_source not like 'spend_%' then raise exception 'Not a spend source'; end if;
  p_amount := public.gem_price(p_source);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Unknown spend: %', p_source;
  end if;

  select gems into balance from public.player_profiles where user_id = uid for update;
  if balance is null then raise exception 'No player profile yet'; end if;
  if balance < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'not enough gems', 'gems', balance);
  end if;

  insert into public.gem_events (user_id, amount, source, ref_id) values (uid, -p_amount, p_source, p_ref);
  update public.player_profiles set gems = gems - p_amount where user_id = uid;
  return jsonb_build_object('ok', true, 'gems', balance - p_amount);
end;
$$;

-- Close a finished week: rank every cohort, mark promoted/held/demoted, pay the
-- promotion gems. Run from a scheduled job once the season's end date passes.
create or replace function public.close_league_season(p_season uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  affected integer := 0;
begin
  with ranked as (
    select lm.cohort_id, lm.user_id, lc.tier, t.promote_count, t.demote_count, t.promotion_gems,
           row_number() over (partition by lm.cohort_id order by lm.weekly_xp desc, lm.joined_at) as position,
           count(*) over (partition by lm.cohort_id) as cohort_size
    from public.league_members lm
    join public.league_cohorts lc on lc.id = lm.cohort_id
    join public.league_tiers t on t.tier = lc.tier
    where lc.season_id = p_season
  )
  update public.league_members lm set result = case
      when r.position <= r.promote_count then 'promoted'
      when r.position > r.cohort_size - r.demote_count then 'demoted'
      else 'held'
    end
  from ranked r
  where lm.cohort_id = r.cohort_id and lm.user_id = r.user_id;

  get diagnostics affected = row_count;

  insert into public.gem_events (user_id, amount, source, ref_id)
  select lm.user_id, t.promotion_gems, 'league_promotion', lm.cohort_id::text
  from public.league_members lm
  join public.league_cohorts lc on lc.id = lm.cohort_id
  join public.league_tiers t on t.tier = lc.tier
  where lc.season_id = p_season and lm.result = 'promoted' and t.promotion_gems > 0
  on conflict do nothing;

  update public.player_profiles p set gems = p.gems + t.promotion_gems
  from public.league_members lm
  join public.league_cohorts lc on lc.id = lm.cohort_id
  join public.league_tiers t on t.tier = lc.tier
  where lc.season_id = p_season and lm.result = 'promoted' and lm.user_id = p.user_id;

  update public.league_seasons set closed_at = now() where id = p_season and closed_at is null;
  return affected;
end;
$$;

-- -------------------------------------------------------------------- RLS ----

alter table public.player_profiles enable row level security;
alter table public.interview_starts enable row level security;
alter table public.xp_events enable row level security;
alter table public.gem_events enable row level security;
alter table public.league_members enable row level security;
alter table public.league_cohorts enable row level security;
alter table public.league_seasons enable row level security;
alter table public.league_tiers enable row level security;
alter table public.trophies enable row level security;
alter table public.user_trophies enable row level security;

-- A leaderboard nobody else can read is not a leaderboard. Profiles and league
-- rows are readable by any signed-in player; note that player_profiles holds no
-- email or personal data beyond a display name chosen for this purpose.
drop policy if exists "profiles_read_all" on public.player_profiles;
create policy "profiles_read_all" on public.player_profiles for select to authenticated using (true);

-- Deliberately no INSERT or UPDATE policy for players. Every write goes through
-- the SECURITY DEFINER functions above, which is what stops a player from
-- setting their own XP.
drop policy if exists "profiles_update_own_name" on public.player_profiles;
create policy "profiles_update_own_name" on public.player_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Own rows only, and read-only: claiming an attempt goes through
-- begin_interview, so a player cannot delete a start to refund themselves one.
drop policy if exists "interview_starts_read_own" on public.interview_starts;
create policy "interview_starts_read_own" on public.interview_starts
  for select using (auth.uid() = user_id);

drop policy if exists "xp_events_read_own" on public.xp_events;
create policy "xp_events_read_own" on public.xp_events for select using (auth.uid() = user_id);
drop policy if exists "gem_events_read_own" on public.gem_events;
create policy "gem_events_read_own" on public.gem_events for select using (auth.uid() = user_id);

drop policy if exists "league_members_read_all" on public.league_members;
create policy "league_members_read_all" on public.league_members for select to authenticated using (true);
drop policy if exists "league_cohorts_read_all" on public.league_cohorts;
create policy "league_cohorts_read_all" on public.league_cohorts for select to authenticated using (true);
drop policy if exists "league_seasons_read_all" on public.league_seasons;
create policy "league_seasons_read_all" on public.league_seasons for select to authenticated using (true);
drop policy if exists "league_tiers_read_all" on public.league_tiers;
create policy "league_tiers_read_all" on public.league_tiers for select to authenticated using (true);

drop policy if exists "trophies_read_all" on public.trophies;
create policy "trophies_read_all" on public.trophies for select to authenticated using (true);
drop policy if exists "user_trophies_read_all" on public.user_trophies;
create policy "user_trophies_read_all" on public.user_trophies for select to authenticated using (true);

-- Internal machinery, not an API.
--
-- These are SECURITY DEFINER because the functions that call them need to write
-- past RLS - but they were also left callable by any signed-in user, which meant
-- anybody could place themselves (or somebody else) into the Diamond league via
-- ensure_league_membership, or close the current season early with
-- close_league_season and trigger promotions and gem payouts at a moment of
-- their choosing. Revoking does not affect the internal calls, which run as the
-- function owner.
revoke all on function public.ensure_league_membership(uuid, smallint) from public, authenticated, anon;
revoke all on function public.close_league_season(uuid) from public, authenticated, anon;
revoke all on function public.evaluate_trophies(uuid) from public, authenticated, anon;
revoke all on function public.current_season() from public, authenticated, anon;

-- grant_premium is for a billing webhook holding the service key, never for a
-- player. SECURITY DEFINER would otherwise let anyone signed in award
-- themselves a subscription.
revoke all on function public.grant_premium(uuid, integer) from public, authenticated, anon;

-- Optional: settle finished weeks on time even if nobody opens the app. The
-- lazy rollover in current_season() already covers correctness; this only makes
-- promotion land on Monday morning rather than on first activity. Safe to skip
-- if pg_cron is not enabled on your project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('close-league-seasons', '5 0 * * 1', $cron$
      select public.close_league_season(id) from public.league_seasons
      where closed_at is null and ends_on <= current_date;
    $cron$);
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%). The lazy rollover still settles seasons.', sqlerrm;
end $$;

-- Realtime: the leaderboard updates as cohort members finish interviews.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.league_members;
  end if;
exception when duplicate_object then null;
end $$;

select relname, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.player_profiles'::regclass, 'public.xp_events'::regclass,
              'public.gem_events'::regclass, 'public.league_members'::regclass,
              'public.user_trophies'::regclass)
order by relname;
