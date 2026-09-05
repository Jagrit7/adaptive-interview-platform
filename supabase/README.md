# Supabase setup for the DSA bank

The DSA catalog is stored in hosted Supabase Postgres. The checked-in JSON is
the reviewed editorial source and local-development fallback; it is not sent
directly to browsers.

## One-time schema setup

In the Supabase SQL Editor, run these files in order:

1. `schema.sql`
2. `schema_reports.sql`
3. `schema_invitations.sql`
4. `schema_user_question_banks.sql`
5. `schema_gamification.sql`
6. `schema_dsa_question_bank.sql`

`schema_reports.sql` is also the upgrade migration for the earlier minimal
`interview_reports` table. Re-run the whole file after pulling this version. It
keeps existing JSON reports, adds indexed report projections, creates
`interview_report_scores`, backfills competency rows, and refreshes the RLS
policies. Do not delete the existing table first.

It also adds a `source` column separating reports written by a signed-in owner
running their own panel (`self`) from reports written by the backend for an
anonymous candidate on a published invite link (`published`). Existing rows are
backfilled as `published`. There is no `test` value on purpose: a test run of a
panel is never stored at all, so a column value for it could only ever be wrong.

## Who writes a report

Two writers, because the actors differ:

- A signed-in owner testing their own panel writes from the browser, under their
  own session, so Row Level Security governs the insert (`frontend/lib/reports.ts`).
- A candidate on a published invite is anonymous and has no Supabase session, so
  the browser insert is refused by `reports_insert_own` and always was. FastAPI
  writes that row instead, with the secret key, attributing it to the panel's
  owner - who remains the only person who can read it back. This needs
  `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `backend/.env`; without them the
  candidate still sees their report and the response says it was not stored.

The DSA schema can also run before `schema_reports.sql`; in that case its
optional report foreign key is omitted. Re-running the DSA schema after reports
are installed adds that foreign key safely.

The DSA schema enables RLS and revokes browser access to the runtime view that
contains hidden tests, reference solutions, and verbal rubrics.

## Who can sit an interview

`schema_invitations.sql` adds `interview_invitations`: one row per invited
candidate, holding the email it was issued to and a 256-bit token that is the
candidate's link.

There is no shared interview link any more. The previous model put one
8-character code on every published panel, which authorised anybody who had the
URL, for unlimited attempts, under whatever name they typed. An email allowlist
on its own would not have fixed that - addresses are public and guessable, so
the shared link plus a guessed address is still enough. Both halves are now
required: the token in the link, and confirmation of the address it was sent to.

The table is owner-only under RLS, with no policy for anonymous readers. That is
deliberate. Candidates never query it; they hand a token to FastAPI, which
resolves it with the secret key and enforces expiry, revocation, and the attempt
limit server-side. If the browser could read invitations by token, every one of
those checks would be advisory.

Attempts are counted when an interview *starts*, not when it finishes, so
abandoning halfway still consumes one - otherwise `max_attempts` could be
sidestepped by quitting before the last question.

## Bring-your-own question banks

`schema_user_question_banks.sql` adds `user_question_banks` and
`user_question_bank_items`: a recruiter's own questions, stored the same shape
the built-in banks use, owner-only under RLS.

Two tables rather than one jsonb column because a bank is edited item by item.
As a single document, renaming one question rewrites the whole bank and two
tabs editing it lose each other's work.

Each item carries a `kind` (`verbal`, `written`, `coding`) and a `domain`. Both
matter at runtime: `kind` decides whether the candidate is asked out loud or
given a writing pad, and an interviewer only receives questions from the domains
its role permits - so a behavioural bank attached to a DSA interviewer is
filtered away to nothing.

Selecting a bank in the builder copies its questions into the panel config
rather than storing a reference. A published interview then keeps asking what it
was published with even if the bank is later edited or deleted, and the
candidate's session never needs to read a table that is owner-only by design.

## Progression: XP, leagues, gems, trophies

`schema_gamification.sql` adds the individual-side progression system. The design
rationale, the formulas and the known gaps are in `docs/GAMIFICATION.md`.

The one thing to know here: no player-facing write policy exists on `xp_events`
or `gem_events`. Every award goes through a `SECURITY DEFINER` function that
reads the stored report and computes the amount itself, because a browser that
can POST its own XP has a leaderboard measuring devtools rather than practice.

After running it, enable Realtime on `league_members` (Database -> Replication)
so the leaderboard updates live.

To verify it works against your data, run `schema_gamification_test.sql`. It
asserts the award, limit, spend, premium and league behaviour and rolls back, so
it is safe on a database with live rows.

## Publish the reviewed bank

Add these values to `backend/.env` (do not paste them into frontend files):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_SERVER_ONLY_KEY
```

From the `backend` directory, using the same Python/Conda environment as the
API, run:

```text
python scripts/import_dsa_question_bank.py
```

The importer uses deterministic UUIDs and database upserts, so it is safe to
run again after editorial changes. Published questions require at least five
public and three hidden tests. The FastAPI backend automatically uses Supabase
when both server variables exist and uses `backend/data/dsa_question_bank.json`
as a local fallback otherwise.

The legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted, but new projects should
use `SUPABASE_SECRET_KEY`. Never expose either through a `NEXT_PUBLIC_*`
variable. Both bypass RLS and belong only in FastAPI's server environment.
