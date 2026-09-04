# ADR 007: Enterprise report storage and voice querying

Date: 2026-09-03  
Status: Accepted

## Decision

Candidate evaluations are persisted in `public.interview_reports`. The complete
versioned backend report remains in `report jsonb` as the immutable evidence
document. Fields needed by list, filter, and ranking screens are projected into
typed columns: candidate identity, panel, role, score, band, recommendation,
summary, strengths, growth areas, lifecycle timestamps, and completion state.

Competency scores are projected by a database trigger into
`public.interview_report_scores`. Its `(user_id, competency_key, score)` index
supports ranked queries such as “top five candidates by system design” without
scanning or sorting JSON documents. A report update replaces its score rows, so
the projection cannot drift from the canonical report document.

Both tables use Supabase Row Level Security scoped to the authenticated owner.
The current product has no persisted organization-membership model, so pretending
to provide organization-wide access would be unsafe. Organization-scoped RLS is
a separate migration once organizations and memberships become authoritative.

## Report presentation

The live candidate report keeps the approved mock-report anatomy: candidate and
role header, recommendation, overall score, interviewer scores, executive
summary, strengths, growth areas, interview details, and skill radar. All values
come from the stored report. Older rows missing the new presentation projection
receive deterministic client fallbacks from their canonical competency data.

## Voice query boundary

`Ask Reports` accepts voice or text. Voice uses a dedicated Agora Conversational
AI session: the browser publishes microphone audio over Agora RTC, Agora STT
delivers completed transcript turns over RTM, and an Agora-backed analyst speaks
the verified result over the same channel. Browser `SpeechRecognition` is not
used.

The backend converts each utterance into a constrained `ReportQuery` containing
only `limit`, `overall|competency`, optional competency, and optional role. It
retains that small intent per live session so conversational follow-ups such as
“now top two by communication” can reuse the previous role. The authenticated
client executes parameterized Supabase filters under Row Level Security and
returns only display-safe candidate names, roles, metrics, and scores for speech.
Natural-language text is never executed as SQL.

The voice agent is deliberately not the database authority. For a ranking
request it briefly acknowledges that it is checking, then waits for an injected
`VERIFIED REPORT RESULTS` message. Its prompt forbids invented candidates,
scores, and rankings. A typed query uses the same constrained backend parser;
when an Agora session is active, typed results are spoken too.

Voice sessions currently live in process memory and are stopped explicitly when
the user ends the analyst or leaves the page. This matches the existing
single-process interview-session deployment but is not suitable for horizontally
scaled workers.

## Consequences

- Existing reports survive the migration and are backfilled.
- One report document remains the audit source of truth.
- Ranking a named competency is indexed and scalable.
- Test-mode interviews continue not to create candidate records.
- Browsers do not need a vendor-specific speech-recognition implementation;
  they only need microphone access and WebRTC support.

## Future improvements

- Add organizations, organization memberships, invitations, and organization-id
  RLS before sharing reports across recruiters.
- Generate evidence-cited narrative summaries server-side and version their
  prompt/model metadata.
- Add date ranges, multiple competency filters, thresholds, and saved queries.
- Add server-side pagination and a database RPC for compound ranking at larger
  report volumes.
- Move report-query session state to Redis and add abandoned-session expiry
  before deploying multiple backend workers.
- Validate Supabase access tokens on report-query lifecycle endpoints and move
  database querying server-side when organization membership becomes
  authoritative. Today report data remains protected by client-side Supabase
  RLS; the voice service receives only the ranked display projection.
- Add explicit clarification turns for ambiguous competency and role names, plus
  synonym resolution against the organization's actual competency catalogue.
- Add explicit retention, legal hold, redaction, and candidate deletion flows.
