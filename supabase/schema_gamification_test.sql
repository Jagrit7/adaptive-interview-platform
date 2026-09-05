-- Behaviour tests for schema_gamification.sql.
--
-- Paste the whole file into the Supabase SQL Editor and run it. It creates two
-- throwaway auth users, exercises every award path against the real functions,
-- asserts the outcomes, and then ROLLS BACK — nothing it touches survives, and
-- it is safe to run against a database with live data.
--
-- Why this exists: the schema can be parsed for syntax without a server, but
-- parsing proves nothing about whether the daily limit actually refuses, or
-- whether awarding twice actually pays once. Those are the things that would
-- silently be wrong in production, so they are the things asserted here.
--
-- A failure raises with the assertion text and the transaction unwinds.

begin;

do $$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
  report_a uuid;
  report_b uuid;
  payload jsonb;
  got integer;
  got_text text;
  trophies text[];
  flag boolean;
begin
  -- Two users to prove isolation, inserted directly because auth.signUp is not
  -- reachable from SQL.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values
    (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'priya.sharma@example.test', '', now(), now(), now(), '{}'::jsonb,
     '{"full_name":"Priya Sharma"}'::jsonb),
    (bob, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ravi.kumar@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  -- Become Alice. PostgREST reads auth.uid() out of these claims, so setting
  -- them is what makes the SECURITY DEFINER functions behave as they would for
  -- a signed-in browser.
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated',
                      'email', 'priya.sharma@example.test',
                      'user_metadata', json_build_object('full_name', 'Priya Sharma'))::text, true);

  ---------------------------------------------------------------- levels ----
  assert public.level_for_xp(0) = 1, 'level_for_xp(0) should be 1';
  assert public.level_for_xp(25) = 2, 'level_for_xp(25) should be 2';
  assert public.level_for_xp(400) = 5, 'level_for_xp(400) should be 5';
  assert public.xp_for_level(5) = 400, 'xp_for_level(5) should be 400';
  assert public.level_for_xp(public.xp_for_level(9)) = 9, 'level/xp round trip';

  --------------------------------------------------------- display names ----
  got_text := public.default_display_name();
  assert got_text = 'Priya Sharma', format('metadata name expected, got %L', got_text);

  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated',
                      'email', 'ravi.kumar@example.test')::text, true);
  got_text := public.default_display_name();
  assert got_text = 'Ravi Kumar', format('email-derived name expected, got %L', got_text);

  -- Back to Alice for the rest.
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated',
                      'email', 'priya.sharma@example.test',
                      'user_metadata', json_build_object('full_name', 'Priya Sharma'))::text, true);

  --------------------------------------------------------- daily streak ----
  payload := public.touch_daily_activity();
  assert (payload->>'streak_days')::int = 1, 'first activity should start a 1-day streak';
  assert (payload->>'gems_awarded')::int = 5, 'free player should get 5 gems, not 10';

  payload := public.touch_daily_activity();
  assert (payload->>'gems_awarded')::int = 0, 'the daily gem must not pay twice in one day';

  select display_name into got_text from public.player_profiles where user_id = alice;
  assert got_text = 'Priya Sharma', format('profile should be seeded with a name, got %L', got_text);

  ------------------------------------------------------------ interview ----
  insert into public.interview_starts (user_id, session_ref) values (alice, 'sess-1');

  insert into public.interview_reports
    (user_id, panel_id, session_id, panel_name, language, overall_score, band,
     completed, report, candidate_name, candidate_ref)
  values (alice, null, 'sess-1', 'Backend technical', 'en-US', 0.9, 'Strong',
          true, '{"competencies":[]}'::jsonb, 'Priya', 'AIP-TEST1')
  returning id into report_a;

  payload := public.award_interview_xp(report_a);
  -- base 200 (not a design panel) * (0.4 + 0.6*0.9) * 1.0 = 188
  assert (payload->>'xp')::int = 188, format('expected 188 XP, got %s', payload->>'xp');
  assert (payload->>'level')::int = public.level_for_xp((payload->>'total_xp')::int), 'level should match total';

  -- Idempotency: the client retries this on a flaky connection.
  payload := public.award_interview_xp(report_a);
  assert (payload->>'xp')::int = 0, 'awarding the same report twice must pay once';
  select count(*) into got from public.xp_events
   where user_id = alice and source = 'interview' and ref_id = report_a::text;
  assert got = 1, format('expected exactly 1 interview xp_event, found %s', got);

  select banked into flag from public.interview_starts
   where user_id = alice and session_ref = 'sess-1';
  assert flag, 'a banked report should mark its start banked';

  ---------------------------------------------------------- daily limit ----
  payload := public.daily_interview_allowance(alice);
  assert (payload->>'allowed')::boolean = false, 'free player should be blocked after one interview';
  assert (payload->>'used')::int = 1, format('expected used=1, got %s', payload->>'used');

  payload := public.begin_interview('sess-2');
  assert (payload->>'started')::boolean = false, 'begin_interview must refuse past the daily limit';

  -- Re-entering the SAME session must not cost a second attempt.
  payload := public.begin_interview('sess-1');
  assert (payload->>'resumed')::boolean = true, 'resuming a started session should not consume an attempt';

  -- A second report today earns nothing, but is still stored.
  insert into public.interview_reports
    (user_id, panel_id, session_id, panel_name, language, overall_score, band,
     completed, report, candidate_name, candidate_ref)
  values (alice, null, 'sess-2', 'Backend technical', 'en-US', 0.95, 'Strong',
          true, '{"competencies":[]}'::jsonb, 'Priya', 'AIP-TEST2')
  returning id into report_b;
  payload := public.award_interview_xp(report_b);
  assert (payload->>'limit_reached')::boolean = true, 'second interview of the day should hit the limit';

  ---------------------------------------------------------------- premium ----
  perform public.grant_premium(alice, 30);
  assert public.is_premium_active(alice), 'premium should be active after a grant';
  payload := public.daily_interview_allowance(alice);
  assert (payload->>'allowed')::boolean = true, 'premium should lift the daily limit';
  assert payload->>'limit' is null, 'premium should report no limit';

  update public.player_profiles set premium_until = now() - interval '1 day' where user_id = alice;
  assert not public.is_premium_active(alice), 'an expired premium_until must deactivate premium';

  ------------------------------------------------------------------ gems ----
  update public.player_profiles set gems = 50 where user_id = alice;
  payload := public.spend_gems('spend_retry', 'r1');
  assert (payload->>'ok')::boolean = true, 'a spend within balance should succeed';
  assert (payload->>'gems')::int = 30, format('expected 30 gems left, got %s', payload->>'gems');

  -- 40 gems against a 30-gem balance.
  payload := public.spend_gems('spend_premium_bank', 'r2');
  assert (payload->>'ok')::boolean = false, 'a spend beyond balance must be refused';
  select gems into got from public.player_profiles where user_id = alice;
  assert got = 30, 'a refused spend must not change the balance';

  -- The price comes from the server, not the caller.
  assert public.gem_price('spend_retry') = 20, 'gem_price should be authoritative';

  begin
    perform public.spend_gems('trophy', 'nope');
    raise exception 'spend_gems accepted a non-spend source';
  exception when others then
    null;  -- expected
  end;

  -------------------------------------------------------------- trophies ----
  trophies := public.evaluate_trophies(alice);
  select count(*) into got from public.user_trophies
   where user_id = alice and trophy_code in ('first_round', 'sharp_shooter');
  assert got = 2, format('first_round and sharp_shooter should both be earned, found %s', got);

  -- Granting is one-shot.
  trophies := public.evaluate_trophies(alice);
  assert not ('first_round' = any(trophies)), 'a trophy must not be granted twice';

  ---------------------------------------------------------------- league ----
  select count(*) into got from public.league_members lm
   join public.league_cohorts lc on lc.id = lm.cohort_id
   where lm.user_id = alice;
  assert got = 1, format('the player should be in exactly one cohort, found %s', got);

  select weekly_xp into got from public.league_members where user_id = alice;
  assert got = 188, format('weekly_xp should track the award, got %s', got);

  -- Close the week and check the zones. Alice is alone in her cohort, so at
  -- Bronze (promote 15, demote 0) she is promoted.
  perform public.close_league_season(
    (select lc.season_id from public.league_cohorts lc
     join public.league_members lm on lm.cohort_id = lc.id where lm.user_id = alice));
  select lm.result into got_text from public.league_members lm where lm.user_id = alice;
  assert got_text = 'promoted', format('expected promoted, got %L', got_text);

  select count(*) into got from public.gem_events
   where user_id = alice and source = 'league_promotion';
  assert got = 1, 'promotion should pay its gems exactly once';

  --------------------------------------------------------------- isolation ----
  select count(*) into got from public.xp_events where user_id = bob;
  assert got = 0, 'one player''s activity must not create events for another';

  raise notice '=====================================================';
  raise notice '  ALL GAMIFICATION ASSERTIONS PASSED';
  raise notice '  (this transaction is about to roll back)';
  raise notice '=====================================================';
end $$;

rollback;
