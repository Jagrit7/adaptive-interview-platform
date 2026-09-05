# Progression: XP, leagues, gems and trophies

The individual (practice) side of the platform. This document is the design
rationale as much as the reference — the numbers here are choices, and a choice
you cannot explain is one nobody can safely change later.

**Files**

| Concern | Where |
|---|---|
| Tables, RLS, award functions | `supabase/schema_gamification.sql` |
| Client reads, writes, realtime | `frontend/lib/gamification.ts` |
| Player state for any screen | `frontend/hooks/usePlayer.ts` |
| Weekly league board | `frontend/app/leaderboard/page.tsx` |
| Level, gems, trophies | `frontend/app/profile/page.tsx` |

---

## The invariant everything else follows from

**A player must never be able to choose their own score.**

Every XP and gem write happens inside a `SECURITY DEFINER` Postgres function
that derives the amount itself. The browser has **no `INSERT` or `UPDATE` policy
on `xp_events` or `gem_events` at all**. `award_interview_xp` takes a *report
id* and reads the score off the stored row; it does not accept an XP number.

This is not theoretical caution. The app is a browser talking straight to
Supabase under RLS — there is no server in between to trust. A client that could
POST its own XP would turn the leaderboard into a measure of who opened
devtools.

Both ledgers are **append-only**, and `player_profiles.total_xp` / `.gems` are
denormalised running totals. That redundancy is deliberate: a balance is fast to
read, and if a bug ever corrupts a total it is re-derivable by summing the
ledger.

---

## XP — the progression currency

```
xp = base(kind) × (0.4 + 0.6 × score) × repeat_factor      floor 10
```

| Term | Value | Why |
|---|---|---|
| `base` | 250 system design · 200 technical · 150 behavioural | Harder rounds are worth more, or nobody attempts them |
| score multiplier | `0.4 + 0.6 × score` | **Never zero.** A reward that can be nothing teaches players to avoid hard questions rather than attempt them. A strong answer is still worth ~2.5× a weak one |
| `repeat_factor` | `0.5 ^ prior_attempts`, floored at `0.1` | Re-grinding one easy interview converges on nothing; a first attempt at something new always pays full |

Research consistently finds that badges and points rewarding *repetition* produce
output but not pride, while ones rewarding skill produce both. The repeat decay
is that finding, encoded.

### Levels

```
level = floor(sqrt(total_xp / 25)) + 1
```

Level 2 at 25 XP, level 5 at 400, level 10 at 2,025, level 20 at 9,025.

A square root, not a line: linear levelling makes level 30 feel exactly like
level 3, and a curve any steeper makes the *second* level feel unreachable —
which is where most players quit. Mirrored in TypeScript as `levelForXp` for
display only; the database function is the authority.

---

## Leagues — the leaderboard

Modelled on Duolingo's, which is the most-validated version of this mechanic in
production: **cohorts of 30, ranked on XP earned this week, with promotion and
demotion zones.**

**Ten tiers:** Bronze → Silver → Gold → Sapphire → Ruby → Emerald → Amethyst →
Pearl → Obsidian → Diamond.

| Tier | Promoted | Demoted | Gems on promotion |
|---|---|---|---|
| Bronze | 15 | 0 | 5 |
| Silver | 15 | 5 | 5 |
| Gold | 12 | 5 | 10 |
| Sapphire | 10 | 5 | 10 |
| Ruby | 10 | 6 | 15 |
| Emerald | 8 | 6 | 15 |
| Amethyst | 8 | 7 | 20 |
| Pearl | 7 | 7 | 25 |
| Obsidian | 5 | 8 | 30 |
| Diamond | 0 | 5 | 50 |

Promotion narrows as tiers climb, so the top is genuinely hard to reach *and*
hold. Bronze demotes nobody — a new player cannot be punished before they
understand the system.

**Weekly XP, not lifetime.** This is the single most important choice here. A
lifetime board is won once and then read by nobody, because the top is
structurally unreachable. A weekly board resets the question every Monday and
puts a player who joined today within reach of first place.

### Season lifecycle

- A season is a calendar week, created lazily by `current_season()` on first use
- `ensure_league_membership()` places a player in a cohort under 30 at their
  tier, creating one when all are full
- `close_league_season(season_id)` ranks every cohort, writes
  `promoted`/`held`/`demoted`, and pays promotion gems

**`close_league_season` is not scheduled yet** — see Known gaps.

### Realtime

`league_members` is added to the `supabase_realtime` publication, and
`subscribeToCohort()` listens with `filter: cohort_id=eq.<id>`. A player watching
the board sees someone overtake them as it happens. Polling would either lag by
the interval or hammer the database for a screen people leave open.

---

## Gems — the scarce currency, and the premium line

Standard dual-currency design: XP is the progression track that only goes up,
gems are the scarce spendable. Free players always have something to earn, paying
players have something worth buying.

**Faucets** — daily first activity (+5, doubled for premium), trophies (+10 to
+40), league promotion (+5 to +50), premium monthly stipend (+150).

**Sinks** — every one buys a *premium action*, which is what makes gems the
bridge between the tiers rather than decoration:

| Sink | Cost | What it buys |
|---|---|---|
| Full-value retry | 20 | Retake without the repeat XP penalty |
| Deep-dive report | 25 | Full transcript analysis on a past interview |
| Streak freeze | 30 | Protects a streak for one missed day |
| Premium question set | 40 | One session with the harder curated bank |

Prices come from `public.gem_prices()` in a single call — `GEM_SINKS` in
TypeScript carries only labels, so there is no second copy of a price to drift.

`spend_gems(source, ref)` refuses rather than allowing a negative balance, takes
a row lock, and records what the spend bought.

**It does not accept a price.** An earlier signature took `p_amount` from the
caller — the browser sent the right number, but nothing stopped a crafted RPC
call buying a 40-gem item for one. `public.gem_price()` is now the only source
of a price, and the client reads it rather than declaring it.

### Free vs premium

| | Free | Premium |
|---|---|---|
| Interviews per day | 1 | Unlimited |
| Gem earn rate | 1× | 2× |
| Monthly stipend | — | 150 gems |
| Report depth | Summary | Full transcript + per-competency |
| Curated hard banks | 40 gems per session | Included |
| **Leagues** | **All ten** | **All ten** |

**Premium never buys XP, and never buys league position.** A paying player earns
gems faster and sees more of their own report; they do not out-rank a free
player who practised more. The moment money moves the board, the board stops
measuring practice — and the board is the thing people return for.

The conversion path is the gem sink: a free player can occasionally buy one
premium action, feel what it is worth, and decide.

---

## Trophies — six, not sixty

Guidance across achievement design is consistent: start with 5–10 meaningful
awards, target 30–60% completion on the core ones, and prefer skill over
repetition. A collection every veteran holds identically stops being worth
looking at.

| Trophy | Condition | Reward | Layer |
|---|---|---|---|
| First Round | Complete one interview | 50 XP · 10 💎 | Day one — reachable by anyone who engages |
| Week Warrior | 7-day streak | 150 XP · 25 💎 | Commitment |
| Sharp Shooter | Score ≥ 90 once | 200 XP · 30 💎 | Skill |
| System Thinker | Score ≥ 80 on system design | 200 XP · 30 💎 | Domain depth |
| Polyglot | Interviews in 3 languages | 250 XP · 40 💎 | Breadth |
| Promoted | Win promotion from any league | 100 XP · 20 💎 | Competitive |

Deliberately layered so two veterans can hold different sets. `evaluate_trophies()`
runs after every award and on daily activity, grants only newly-met conditions,
and returns the codes granted so the UI celebrates exactly those — **immediately,
on the results screen**, because a reward that arrives later on a different
screen breaks the link to the action that earned it.

---

## Streaks

`touch_daily_activity()` — yesterday continues the streak, any older gap restarts
it at 1. Idempotent within a day. Called by `usePlayer({ touchDaily: true })`,
which `PracticeShell` does once per session rather than per page.

---

## Data model

```
player_profiles   user_id PK, total_xp, gems, streak_days, longest_streak,
                  last_active_on, is_premium, premium_until
xp_events         append-only; unique (user_id, source, ref_id)
gem_events        append-only, signed; same unique index
league_tiers      static: 10 rows
league_seasons    one per week
league_cohorts    season × tier, ≤30 members
league_members    cohort × user, weekly_xp, result
trophies          static: 6 rows
user_trophies     user × trophy, earned_at
```

The unique index on `(user_id, source, ref_id)` is what makes awarding
**idempotent**: calling `award_interview_xp` twice for one report is a no-op, not
a double payout. That matters because the client retries it on a flaky
connection.

### RLS

- `player_profiles`, `league_*`, `trophies`, `user_trophies` — readable by any
  authenticated user. A leaderboard nobody else can read is not a leaderboard.
  `player_profiles` holds no email or personal data beyond a chosen display name.
- `xp_events`, `gem_events` — **own rows only**. Your balance is nobody else's
  business.
- No player-facing write policy on either ledger.

---

## Setup

Run in the Supabase SQL Editor after `schema.sql` and `schema_reports.sql`:

```
supabase/schema_gamification.sql
```

Then confirm Realtime is on for `league_members` (Database → Replication).

---

## Operational behaviour

### League rollover — no scheduler required

`current_season()` closes any week that has ended and was never closed, on the
first activity of the new week. A `pg_cron` job is *also* registered when the
extension is present, but only so promotion lands on Monday morning rather than
on first activity.

The lazy path is the one correctness depends on. A cron job that silently stops
would freeze the league with nobody promoted and the `promoted` trophy
permanently unearnable, and nothing in the product would surface that it had
happened.

### Day boundaries are UTC

`date_trunc('day', now())` runs in the database's timezone, which on Supabase is
UTC. A player in IST gets their daily reset at 05:30 local, not midnight. That is
a deliberate simplification, not an oversight — per-user timezones would need a
stored offset and would make "today" ambiguous across a move — but it is worth
knowing before somebody reports it as a bug.

### Free daily allowance — counted on starts, with a grace window

`begin_interview(session_ref)` claims one of the day's attempts before the
interview begins, so a free player is told up front rather than after sitting a
full round.

Counting **starts** rather than banked reports closes the obvious hole — begin
five, bank the best. Done naively that creates a worse one: a dropped connection
would burn somebody's only attempt. So a start counts only if it produced a
report **or** is less than thirty minutes old:

```sql
where banked or started_at > now() - interval '30 minutes'
```

A crash costs half an hour, not the day, and nothing has to sweep the table for
that to be true. Re-entering the same `session_ref` returns `resumed: true` and
costs nothing, so a refresh or reconnect is free.

`award_interview_xp` still refuses past the limit, because the award is the one
chokepoint every client passes through. A blocked interview **keeps its report**
— the player loses the XP, not the feedback.

Only the practice paths claim an attempt. An invited candidate is sitting a
recruiter's interview, and a test run is an author checking their own panel;
neither is practice.

### Display names

`default_display_name()` resolves, in order: the `full_name` captured at signup,
then a title-cased email local part (`priya.sharma@…` → "Priya Sharma"), then
"Learner". Seeded whenever a profile is created and backfilled on activity for
profiles that predate it, so no migration script is needed.

Editable in Settings, capped at 40 characters by a `CHECK` constraint — it is
shown on other players' leaderboards, so it is bounded in the database rather
than trusted from the browser.

### Premium lifecycle

`is_premium_active(user)` is what every benefit asks — it checks `premium_until`,
so a lapsed subscription stops paying out without a sweeper job.

`grant_premium(user, days)` extends rather than truncates an existing
subscription, so renewing early never costs paid-for time. It is **revoked from
`authenticated` and `anon`**: only the service key can call it, which is where a
billing webhook would live. `SECURITY DEFINER` without that revoke would have
let any signed-in player grant themselves a subscription.

### Monthly stipend

Paid on the first activity of each month, keyed on `YYYY-MM` as the ledger
`ref_id`. The unique index on `(user_id, source, ref_id)` makes a second call
that month a no-op — the same idempotency trick the XP award uses.

---

## Testing

`supabase/schema_gamification_test.sql` is a self-asserting harness. Paste it
into the SQL Editor and run it: it creates two throwaway auth users, fakes an
authenticated session with `request.jwt.claims`, exercises the real functions,
asserts the outcomes, and **rolls back**. Safe against a database with live data.

It asserts the things that would otherwise be silently wrong in production —
that the XP formula produces 188 for a 0.9 score, that awarding twice pays once,
that the daily limit actually refuses, that an over-balance spend is rejected,
that an expired `premium_until` deactivates premium, that a trophy grants once,
and that one player's activity creates nothing for another.

Every statement in the schema is also parsed against PostgreSQL 18.4's real
grammar via `libpg_query`, including all fourteen PL/pgSQL bodies.

---

## Known gaps

1. **No payment provider.** The entitlement plumbing is complete and locked
   down — `grant_premium` is revoked from `authenticated`, so only a service-key
   holder such as a billing webhook can call it. What is missing is the provider
   decision (Stripe vs Razorpay), an account, and the webhook that calls it. The
   profile page says "Coming soon" rather than showing a button that does
   nothing.
2. **The harness has not been run.** It is written and parses; running it needs
   your database. Two runtime-only defects have already been found by review
   that parsing could not catch — an ambiguous identifier that would have thrown
   on the first trophy grant, and internal functions left callable by any signed-in
   user — so this remains the highest-value unrun check in the project.
3. **Day boundaries are UTC**, as above.
4. **The daily gem and the streak are recorded once per tab per day**, guarded
   in `sessionStorage`. A player using two browsers gets two calls; both are
   idempotent server-side, so this costs a round-trip, not a double payout.

## Sources

- [Duolingo Leagues — Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/leagues)
- [Duolingo Leagues guide — Duoplanet](https://duoplanet.com/duolingo-leagues-the-essential-guide-everything-you-need-to-know/)
- [Game Economy Design: IAP, Hybrid, and D2C — Unity](https://unity.com/resources/game-economy-design-guide)
- [What Makes Achievement Systems Work — Trophy](https://trophy.so/blog/what-makes-achievement-systems-work)
- [Designing Achievements for Optimal User Engagement — Trophy](https://trophy.so/blog/designing-achievements-for-optimal-user-engagement)
- [Badge Gamification: Why Most Achievement Badges Fail — Yu-kai Chou](https://yukaichou.com/gamification-study/badge-gamification-guide/)
- [Gamification Strategy in 2026 — Minders](https://minders.io/resource/gamification-strategy-playbook-2026/)
