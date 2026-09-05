# ADR-004: Versioned DSA question bank and controlled-random selection

- **Status:** Accepted
- **Date:** 2026-09-02
- **Scope:** Individual DSA interviews and question authoring

## Context

The first DSA interview uses one hardcoded Two Sum object. That was useful for
proving voice, timed coding, execution, verbal follow-up, and reporting, but it
cannot support topic practice, repeat avoidance, adaptive difficulty, or safe
hidden evaluation at scale.

The live interviewer must not invent coding questions. The application needs an
authoritative, curated bank from which it can choose a question for a requested
topic or data structure, while keeping hidden tests, reference solutions, and
grading rubrics away from the browser.

## Decision

Use Supabase Postgres as the curated question catalog. Model the hierarchy as
one question bank with a topic tree, not as separate physical tables, nested
JSON datasets, or duplicated question collections. The initial bank is `dsa-core`;
its topic tree contains Arrays, Hash Maps, Stacks, Queues, Linked Lists, Trees,
Graphs, Searching, Sorting, Dynamic Programming, and their subtopics.

Selection happens in the FastAPI backend. The LLM may speak a short brief and
conduct a follow-up, but it does not choose, reconstruct, or modify the written
coding problem.

The selector supports four explicit scopes:

- `topic_exact`: questions directly tagged with one topic;
- `topic_subtree`: questions tagged with that topic or any descendant;
- `bank`: any eligible question in the DSA bank;
- `blueprint`: weighted coverage across several topics for a role interview.

Topic-based learning uses `topic_exact` or `topic_subtree`. An SDE interview
uses a versioned `blueprint`; it does not select uniformly from the entire DSA
bank, because a flat random draw can over-sample Arrays and completely miss
Trees, Graphs, or complexity analysis.

Selection is controlled randomness rather than `order by random()`. It must:

1. filter to published questions matching the requested topic and supported
   language;
2. filter to the requested difficulty band;
3. exclude questions attempted recently by that user and questions already
   used in the current session;
4. prefer under-exposed questions and questions near the user's target level;
5. use a session seed to choose from the best eligible candidates; and
6. record the selected version atomically before returning it.

If the bank is exhausted, the selector relaxes recent-attempt exclusion before
relaxing topic or language. It never silently crosses into another topic. The
API tells the UI when a repeat was necessary.

## Data model

### `public.question_banks`

Logical top-level datasets. The first row is `dsa`; later rows may represent
AI/ML, backend engineering, frontend engineering, or other skill families.

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `slug` | Stable key such as `dsa` |
| `name` | Display name |
| `status` | `draft`, `published`, or `retired` |
| `version` | Catalog version used by blueprints and reports |

### `public.question_topics`

Hierarchical catalog shared by skill paths, question selection, and reports.

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `bank_id` | Parent question bank, initially DSA |
| `slug` | Stable key such as `arrays`, `hash-maps`, `binary-search` |
| `name` | Display name |
| `parent_id` | Optional parent for groups such as Trees → BST |
| `skill_module_slug` | Links the topic to a DSA skill-path module |
| `active` / `display_order` | Catalog availability and ordering |

Example:

```text
DSA bank
|-- Arrays
|   |-- Two pointers
|   |-- Sliding window
|   `-- Prefix sums
|-- Hashing
|-- Stacks and queues
|-- Linked lists
|-- Trees
|   |-- Binary trees
|   `-- Binary search trees
`-- Graphs
    |-- BFS / DFS
    `-- Shortest paths
```

A child topic inherits membership in its ancestors for `topic_subtree`
selection. PostgreSQL resolves descendants with a recursive CTE. We do not copy
a child question onto every ancestor.

### `public.dsa_questions`

Stable identity for one problem across revisions.

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `slug` | Stable human-readable identity |
| `status` | `draft`, `published`, or `retired` |
| `current_version_id` | Published version used for new interviews |
| `created_at` / `updated_at` | Audit timestamps |

### `public.dsa_question_versions`

Immutable content and execution contract. Editing a published problem creates a
new version so old reports remain reproducible.

| Column | Purpose |
|---|---|
| `id` / `question_id` / `version` | Version identity |
| `title`, `prompt`, `constraints` | Written problem shown to the candidate |
| `difficulty` | Integer scale, initially 1–5 |
| `duration_seconds` | Server-side attempt duration |
| `supported_languages` | Initially `['python']` |
| `starter_code` | JSON keyed by language |
| `function_name` / `validator_key` | Runner contract without executable DB code |
| `solution_outline` | Backend/admin-only reference material |
| `expected_time` / `expected_space` | Verbal grading reference |
| `published_at` | Audit and reproducibility |

### `public.dsa_question_topics`

Many-to-many mapping because a problem may primarily assess arrays while also
using hashing. It stores `question_id`, `topic_id`, `is_primary`, and an optional
`relevance_weight`. Topic membership is metadata; the actual question and tests
exist only once.

### `public.assessment_blueprints`

Versioned interview selection plans such as `sde-foundation-v1`. A blueprint
belongs to a question bank and defines interview purpose, difficulty policy,
question count, and whether topic repetition is allowed.

### `public.assessment_blueprint_topics`

Defines topic coverage for a blueprint using `blueprint_id`, `topic_id`,
`selection_scope`, `weight`, and optional `min_questions` / `max_questions`.
For example, an SDE foundation blueprint can allocate Arrays/Hashing 30%,
Stacks/Queues 15%, Trees 20%, Graphs 15%, Searching/Sorting 10%, and mixed
complexity reasoning 10%. Exact weights are product configuration, not hardcoded
interviewer behavior.

### `public.dsa_test_cases`

| Column | Purpose |
|---|---|
| `question_version_id` | Exact problem version |
| `case_key`, `label`, `display_order` | Stable test identity |
| `input` / `expected` | JSON runner payload |
| `visibility` | `public` or `hidden` |
| `weight` | Optional scoring weight |

Every publishable coding question requires at least five distinct public test
cases and at least three hidden cases. Public cases are visible in the LeetCode-
style workspace. Hidden cases are loaded only by the backend runner during final
submission and are never included in a browser response.

### `public.dsa_followups`

Question-specific verbal prompts and grading material:

- `question_version_id`;
- `prompt`;
- `ideal_answer`;
- competency/rubric JSON;
- optional trigger such as `always`, `failed_edge_case`, or `all_tests_passed`;
- `active` and `display_order`.

The first release chooses one eligible follow-up. Later releases may choose a
follow-up based on code behavior or missed test categories.

### `public.dsa_attempts`

One immutable record per selected question:

- `id`, `user_id`, `session_id`;
- `question_id` and exact `question_version_id`;
- requested/selected topic and difficulty;
- selection seed and repeat-relaxation reason;
- selected, started, submitted, and finished timestamps;
- submission trigger, test summary, and report reference.

This table powers repeat avoidance, progress, exposure analytics, and report
reproducibility. Full source code and transcript remain in the report document
unless a later retention decision deliberately separates them.

## API lifecycle

1. The candidate starts an interview with a selection request:
   `{ mode, bank_slug, topic_slug?, blueprint_slug?, difficulty_band }`.
2. FastAPI verifies the Supabase access token and derives `user_id`; the client
   cannot nominate another user's identity.
3. At `begin-coding`, a repository/service resolves the requested exact topic,
   subtree, whole bank, or blueprint and atomically selects and records one
   published question version.
4. The API returns only public question fields and public test cases.
5. `Run code` uses the selected version's public cases and does not advance the
   interview.
6. `Submit` runs public plus hidden cases, snapshots the result, and selects a
   question-specific verbal follow-up.
7. The report stores the exact question/version IDs, topic, test evidence, and
   selection reason.

The selected question is immutable for the session. Refresh, retry, reconnect,
or repeated `begin-coding` calls return the same selection rather than drawing
again.

## Selection strategy

The selector creates an eligible pool and ranks it using:

- difficulty closeness to the requested or inferred target;
- recency penalty for the user's previous attempts;
- global exposure balancing so a few popular rows do not dominate;
- optional weakness boost from topic proficiency; and
- a deterministic hash of `(session_id, question_version_id)` as the random
  tiebreaker.

The deterministic tiebreaker makes retries reproducible while still distributing
different sessions across the bank. The exact weights belong in backend config
and must be covered by selection tests rather than hidden in SQL literals.

Version 1 uses a user-selected topic and a fixed difficulty band. Adaptive
difficulty based on past attempts is a later policy layer over the same selector.

For a multi-question SDE interview, the backend first creates a session coverage
plan from the blueprint, then fills each slot independently. This prevents later
random choices from accidentally violating the intended topic distribution.

## Security and publishing rules

- Supabase service credentials exist only in FastAPI environment variables.
- Browser RLS policies may expose published topic and prompt metadata, but never
  hidden tests, solution outlines, ideal answers, or rubrics.
- DSA session endpoints must verify the user's Supabase JWT before per-user
  selection and attempt writes are enabled.
- The database stores data and validator identifiers, never arbitrary executable
  validator code.
- Publishing validates topic assignment, supported runner signature, unique test
  case keys, minimum test counts, and that a reference solution passes every
  public and hidden case.
- Retiring a question prevents new selection but does not invalidate historical
  attempts or reports.

## Authoring and rollout

Initial authoring uses a reviewed CSV/JSON import or SQL seed. An admin question
editor can follow after the schema and validation pipeline are stable.

### Question sourcing and provenance

The first release contains ten project-authored questions in
`backend/data/dsa_question_bank.json`. Their wording, examples, tests,
reference solutions, and verbal grading targets were written for this project
from standard algorithmic patterns. We do not scrape or paraphrase proprietary
LeetCode or Codeforces statements.

Every version stores `provenance_type`, `source_name`, `source_url`,
`source_license`, and `attribution`. A future external import is accepted only
after statement-level provenance and redistribution rights are reviewed:

- Microsoft Python Programming Puzzles is MIT-licensed and is a candidate for a
  reviewed import, but individual puzzle derivations still need inspection:
  <https://github.com/microsoft/PythonProgrammingPuzzles>.
- IBM Project CodeNet provides a large research corpus under CDLA-Permissive-2.0,
  but its problem origins include third-party judges, so the dataset license is
  not treated as blanket permission to republish every statement:
  <https://github.com/IBM/Project_CodeNet>.
- AtCoder's first-party dataset program is a possible licensed commercial source
  if scale later justifies it: <https://datasets.atcoder.jp/>.

Imported content must retain attribution, pass editorial review, and satisfy
the same five-public/three-hidden reference-solution validation as original
content.

### Implemented first slice

- `supabase/schema_dsa_question_bank.sql` defines the hierarchy, immutable
  versions, blueprints, protected tests/rubrics, attempts, RLS, and publish
  validation.
- `backend/scripts/import_dsa_question_bank.py` idempotently publishes the
  checked-in bank using deterministic UUIDs and a server-only service role.
- FastAPI selects by exact topic, topic subtree, bank, or weighted blueprint;
  avoids recent user attempts; balances exposure; and uses a deterministic
  session hash as the tiebreaker.
- The setup page chooses Topic Practice or SDE Core before opening the existing
  dark interview room. Public runs and hidden final submission use the selected
  question's generic execution contract.

Recommended rollout:

1. Create question-bank, hierarchical-topic, blueprint, question, version, test,
   follow-up, attempt, constraint, index, and RLS definitions.
2. Add a backend question repository and JWT verification.
3. Import 10–20 reviewed questions across Arrays, Hash Maps, Stacks, Queues, and
   Binary Search, each meeting the public/hidden test requirement.
4. Replace `TWO_SUM_QUESTION` lookup at `begin-coding` while retaining Two Sum as
   a seeded database question.
5. Add topic selection to the preflight page and display the chosen topic in the
   report.
6. Add authoring validation and selection-distribution tests before expanding
   the bank.

## Future improvements

- Adaptive difficulty using per-topic proficiency and recent outcomes.
- Multi-question interviews with coverage targets across several topics.
- Localized prompt versions without duplicating question identity.
- Calibrated question statistics after enough attempts: completion rate,
  discrimination, median duration, and failure categories.
- Review workflow with author, reviewer, approval, and change history.
- Similarity detection to prevent near-duplicate questions in the same bank.

## Scale target and cross-skill reuse

The initial editorial target is 170 distinct DSA questions: ten questions whose
primary topic is each of the 17 assessable DSA topics. The catalog must support
at least 1,000 published questions without a schema redesign, and future banks
for AI/ML, backend engineering, frontend engineering, system design, and other
skills must reuse the same catalog concepts.

The database therefore uses rows and relationships, not a table per bank or
topic. `question_banks` is the skill-family boundary; hierarchical topics,
immutable versions, topic mappings, blueprints, attempts, and provenance scale
by adding rows. DSA-specific execution fields remain an implementation subtype
for coding questions rather than a reason to duplicate the catalog for every
skill.

Before non-DSA banks are published, the currently DSA-prefixed content tables
will be generalized through a forward migration to `questions`,
`question_versions`, `question_topics`, `question_test_cases`, and
`question_followups`. A `question_kind` discriminator will support coding,
verbal, multiple-choice, and system-design content, with kind-specific execution
or grading contracts stored separately. Browser access remains forbidden for
hidden tests, reference solutions, and rubrics.

At this scale the content catalog is not the expected bottleneck. Attempts,
reports, transcripts, and recordings grow per user and require separate
retention policies. Selection queries must remain indexed and paginated;
exposure counts should move from per-request aggregation to maintained summary
statistics before attempt volume becomes large. Binary assets and recordings
belong in object storage, with only metadata and paths in Postgres.

## Revision history

| Date | Change |
|---|---|
| 2026-09-02 | Proposed the versioned Supabase DSA bank, deterministic controlled-random selection, public/hidden tests, attempts, and question-specific follow-ups. |
| 2026-09-02 | Added a logical parent bank, hierarchical topic tree, exact/subtree/bank selection scopes, and weighted assessment blueprints for broad SDE interviews. |
| 2026-09-02 | Accepted and implemented the first vertical slice: ten original questions, Supabase schema/importer, protected hidden tests, generic runner, deterministic selector, attempt tracking, and topic/SDE setup UI. Added explicit provenance policy for future sources. |
| 2026-09-02 | Removed the DSA schema's hard ordering dependency on `interview_reports`; `dsa_attempts.report_id` is always created and receives its foreign key conditionally when the reports table exists. |
| 2026-09-02 | Added support for Supabase's recommended `sb_secret_...` backend keys while retaining legacy `service_role` compatibility; secret keys are sent only through the `apikey` header. |
| 2026-09-02 | Set the first editorial target to 170 distinct DSA questions across 17 primary topics and the catalog target to 1,000+ cross-skill questions. Chose shared bank/topic/version tables, a future generic naming migration, typed question contracts, and separate scaling treatment for high-volume attempts and media. |
| 2026-09-02 | Reused the `sde-core` blueprint as the written coding stage of the server-owned SDE By Job panel. The panel keeps the same recent-attempt avoidance, deterministic controlled-random tie-break, public/hidden test boundary, and immutable question-version provenance. |
| 2026-09-02 | Removed a duplicated `trees` topic from the local editorial seed and made both the backend catalog and setup UI deduplicate by stable topic slug. This preserves the one-slug/one-topic identity contract and prevents duplicate React keys. |
