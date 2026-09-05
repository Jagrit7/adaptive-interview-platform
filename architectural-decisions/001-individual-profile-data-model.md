# ADR-001: Individual profile and progress data ownership

- **Status:** Accepted
- **Date:** 2026-09-02
- **Scope:** Individual experience

## Context

The individual frontend currently reads user information from multiple mock
objects. Those objects disagree: for example, the same user has different
streak, XP, and gem values depending on the page. Connecting each page directly
to a similarly broad Supabase row would preserve those inconsistencies and mix
user-editable identity with system-earned progress.

The data model therefore needs clear ownership boundaries before the profile,
settings, sidebar, leaderboard, achievements, and practice flows are connected
to Supabase.

## Decision

Use one common profile table, one individual-specific profile/preferences table,
and separate domain tables for earned or transactional data.

Email remains owned by Supabase Auth. It is displayed through the authenticated
user object and is not duplicated in `public.profiles`.

### 1. `public.profiles`

Common identity shared by the individual and future enterprise experiences.

| Column | Type | Ownership and purpose |
|---|---|---|
| `user_id` | `uuid` | Primary key and FK to `auth.users(id)` with cascade delete |
| `display_name` | `text` | User-editable name shown throughout the application |
| `avatar_url` | `text null` | User-editable Supabase Storage asset URL/path |
| `primary_experience` | `text` | `individual` or `enterprise`; routing preference only, not authorization |
| `created_at` | `timestamptz` | Database-managed creation time |
| `updated_at` | `timestamptz` | Database-managed modification time |

`primary_experience` must never grant enterprise access. Enterprise authorization
will come from organization membership and role tables when that part of the
product is implemented.

### 2. `public.individual_profiles`

Candidate-specific career context and user-controlled preferences.

| Column | Type | Ownership and purpose |
|---|---|---|
| `user_id` | `uuid` | Primary key and FK to `profiles(user_id)` |
| `headline` | `text` | Public-facing profile headline |
| `target_role` | `text` | Role the user is preparing for |
| `career_goal` | `text` | `faang`, `product_management`, `system_design`, or `general` |
| `track_slug` | `text null` | Selected learning-track identifier |
| `interview_language` | `text` | Default interview language code |
| `default_mode` | `text` | `practice` or `exam` |
| `interviewer_manner` | `text` | `supportive`, `balanced`, or `strict` |
| `camera_on_default` | `boolean` | Local self-view preference |
| `streak_reminders` | `boolean` | Notification preference |
| `report_ready_notifications` | `boolean` | Notification preference |
| `league_notifications` | `boolean` | Notification preference |
| `product_updates` | `boolean` | Notification preference |
| `leaderboard_visible` | `boolean` | Opt-in control for public leaderboard presence |
| `timezone` | `text` | IANA timezone used for streak boundaries and reminders |
| `onboarding_completed_at` | `timestamptz null` | Determines onboarding versus dashboard routing |
| `updated_at` | `timestamptz` | Database-managed modification time |

Do not add date of birth, gender, phone number, physical location, or other
sensitive demographic fields unless a concrete product requirement appears and
its privacy implications are reviewed.

### 3. `public.individual_progress`

System-managed aggregate progress. Users may read this row but may not update it
directly from the browser.

| Column | Type | Ownership and purpose |
|---|---|---|
| `user_id` | `uuid` | Primary key and FK to `profiles(user_id)` |
| `total_xp` | `integer` | Canonical accumulated XP |
| `gem_balance` | `integer` | Current spendable reward balance |
| `current_streak` | `integer` | Current consecutive active-day count |
| `longest_streak` | `integer` | Historical best streak |
| `last_practice_date` | `date null` | Canonical input to streak calculation |
| `interviews_completed` | `integer` | Completed individual practice sessions |
| `updated_at` | `timestamptz` | Last server-side recalculation |

The following values are derived and must not be stored independently in the
profile row:

- `level` and progress to next level: calculated from `total_xp` and XP rules.
- `global_rank`: calculated from eligible leaderboard entries.
- `trophy_count`: counted from `user_achievements`.
- `readiness_score`: calculated from recent completed interview results.
- `readiness_label`: calculated from readiness-score thresholds.

## Ownership of data that does not belong in a profile

### `public.learning_tracks`

Catalog of available learning tracks. Stores track name, slug, description,
display order, publication state, and any prerequisites. The user profile stores
only the selected `track_slug`.

### `public.skill_paths`

Catalog of skills or learning paths such as frontend, backend, algorithms,
system design, databases, communication, behavioural, and machine learning.
It also owns product availability (`available` or `coming_soon`), which is
separate from a learner's progress or prerequisite state. See ADR-002.

### `public.user_skill_progress`

One row per user and skill path. Stores completed units, skill XP, current skill
level, last activity time, and unlock state. This supplies the Skills page and
skill-proficiency cards without adding repeated columns to a profile.

Suggested key: `(user_id, skill_path_id)`.

### `public.achievements`

Achievement catalog. Stores the stable achievement key, name, description,
icon, rule type, rule threshold, and whether the achievement is active.

### `public.user_achievements`

One row for each achievement earned by a user. Stores `user_id`,
`achievement_id`, `earned_at`, and optional evidence metadata. Locked trophies
are determined by comparing the achievement catalog with this table; they are
not copied into the user's profile.

Suggested key: `(user_id, achievement_id)`.

### `public.individual_interview_sessions`

One row per individual practice attempt. Owns the selected interview, mode,
difficulty, language, interviewer manner, lifecycle status, start/end times,
score summary, XP awarded, and links to detailed transcript/report data.

This is the source for interview history and the raw evidence used to calculate
readiness. Interview scores must not be stored as profile attributes.

### `public.individual_interview_reports`

Stores the immutable or versioned evaluation produced for a completed practice
session: competency scores, feedback, transcript references, strengths, growth
areas, and report-generation metadata. A report belongs to a session, not to a
profile.

### `public.notifications`

One row per delivered in-app notification. Stores user, notification kind,
title, body, related resource, creation time, read time, and optional expiry.
Notification preferences stay in `individual_profiles`; notification instances
belong here.

### `public.subscription_accounts`

Stores provider/customer references, plan, subscription status, period dates,
and cancellation state. Billing data is server-managed and must not be editable
as part of the profile form. Payment instruments remain with the billing
provider and are not stored in this database.

### `public.leaderboard_entries` view

A restricted view derived from `profiles`, `individual_profiles`, and
`individual_progress`. It exposes only users with `leaderboard_visible = true`
and only the public fields required by the leaderboard: display name, avatar,
track, XP, streak, level, and calculated rank. It must never expose email or
private settings.

## Data flow into the current frontend

| Frontend area | Source |
|---|---|
| Sidebar identity | `profiles` + `individual_profiles` + `individual_progress` |
| Profile header | `profiles` + `individual_profiles` |
| XP, level, streak, gems | `individual_progress` plus XP calculation rules |
| Readiness card | completed sessions/reports, calculated server-side |
| Trophy cabinet | `achievements` + `user_achievements` |
| Skills page | `skill_paths` + `user_skill_progress` |
| Leaderboard | restricted `leaderboard_entries` view |
| Settings: profile | `profiles` + `individual_profiles` |
| Settings: notifications/practice | `individual_profiles` |
| Settings: account plan | `subscription_accounts` |
| Notification inbox | `notifications` |

## Security and lifecycle

- `profiles` and `individual_profiles` use Row Level Security so users can read
  and update only their own rows.
- `individual_progress`, session awards, achievements, readiness, and billing
  state are updated only through trusted server-side code.
- A signup trigger should create the common and individual profile rows with
  safe defaults. It should use the signup metadata only to seed display name and
  routing preference, never to grant authorization.
- Account deletion cascades through user-owned records, subject to any future
  legal retention requirements for billing or enterprise hiring records.

## Consequences

- The frontend receives one consistent identity and progress source instead of
  page-specific mock objects.
- Editable profile fields cannot forge XP, ranks, achievements, or readiness.
- More tables and joins are required, but ownership and RLS policies remain
  understandable.
- A composed query, database view, or backend endpoint will eventually assemble
  the sidebar/profile dashboard payload efficiently.

## Implementation order

1. Create `profiles`, `individual_profiles`, and `individual_progress` with RLS,
   defaults, update triggers, and signup provisioning.
2. Connect the profile header, sidebar identity, and editable settings.
3. Add skill progress and achievement catalogs.
4. Add individual interview sessions and reports.
5. Calculate readiness, XP awards, streaks, and leaderboard entries from real
   activity.
6. Add notifications and subscription integration.

## Revision history

| Date | Change |
|---|---|
| 2026-09-02 | Initial decision defining individual identity, preferences, progress, and domain-data ownership. |
| 2026-09-02 | Clarified that skill-path product availability belongs to the catalog and is not user progress. |

