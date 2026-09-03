# Supabase setup for the DSA bank

The DSA catalog is stored in hosted Supabase Postgres. The checked-in JSON is
the reviewed editorial source and local-development fallback; it is not sent
directly to browsers.

## One-time schema setup

In the Supabase SQL Editor, run these files in order:

1. `schema.sql`
2. `schema_reports.sql`
3. `schema_dsa_question_bank.sql`

`schema_reports.sql` is also the upgrade migration for the earlier minimal
`interview_reports` table. Re-run the whole file after pulling this version. It
keeps existing JSON reports, adds indexed report projections, creates
`interview_report_scores`, backfills competency rows, and refreshes the RLS
policies. Do not delete the existing table first.

The DSA schema can also run before `schema_reports.sql`; in that case its
optional report foreign key is omitted. Re-running the DSA schema after reports
are installed adds that foreign key safely.

The DSA schema enables RLS and revokes browser access to the runtime view that
contains hidden tests, reference solutions, and verbal rubrics.

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
