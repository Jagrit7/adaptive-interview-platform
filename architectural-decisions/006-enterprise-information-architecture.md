# ADR-006: RecruitPro enterprise information architecture

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

The enterprise design archive contains a complete premium-professional console,
but also contains alternate dashboard and interview-builder generations. The
product needs one coherent route model before those designs can become a usable
frontend. The individual experience remains visually and navigationally
separate.

## Decision

### Enterprise identity

The enterprise product is branded **RecruitPro**. Its visual system uses a light
neutral workspace, white bordered cards, black primary controls, serif display
headings, and compact sans-serif operational text.

### Canonical dashboard and navigation

`/enterprise` is the Enterprise Analytics dashboard. The persistent enterprise
navigation contains Dashboard, Interviews, Candidates, Live Sessions, Reports,
Team, Support, and Settings. Templates and builder routes belong to Interviews;
invitations, comparison, and profiles belong to Candidates.

The previous URLs `/enterprise/pipeline` and `/enterprise/report` remain visual
aliases during migration so existing bookmarks and links continue to work.

### Canonical interview builder

The approved builder is a seven-stage journey:

1. Basics
2. Structure
3. Questions
4. AI Configuration
5. Rubric
6. Candidate Settings
7. Review & Publish

Publishing ends on a dedicated success screen with invitation actions. The
builder is implemented as one shared flow component so the progress indicator,
back/continue behavior, and visual system cannot drift between stages.

### Page ownership

The enterprise frontend exposes distinct screens for interview templates,
interview management/detail, candidate pipeline/profile/invitations/comparison,
live monitoring, reports/evaluation, team management, organization settings,
roles, integrations, billing, audit log, support, notifications, onboarding,
and publish success. The empty pipeline is a state of the candidate pipeline,
not a second route. Reports Center and Candidate Evaluation Report remain
separate list/detail views.

## Consequences

- All enterprise pages share a single shell and reusable cards, controls,
  tables, statuses, and builder primitives.
- The current pages use realistic local fixture content; backend connections can
  replace those fixtures without changing the approved routes or page anatomy.
- The catch-all enterprise route keeps the large design surface centralized for
  now. Data-heavy screens should move to feature-specific route modules as their
  backend integrations become live.
- Product-wide marketing can retain its own information architecture, but the
  enterprise landing and onboarding surfaces use the RecruitPro name.

## Future improvements

- Persist builder drafts and validate stage completion server-side.
- Replace fixture tables with paginated Supabase queries and explicit empty,
  loading, permission-denied, and error states.
- Add organization-aware authorization for every enterprise route.
- Add chart semantics and accessible tab behavior before production analytics.
- Add screenshot regression coverage at the reference desktop viewport.

## Revision history

| Date | Change |
|---|---|
| 2026-09-03 | Accepted Enterprise Analytics as the root dashboard, RecruitPro branding, the unified seven-stage builder, the enterprise route map, and compatibility aliases for the earlier report and pipeline URLs. |
| 2026-09-03 | Added desktop-only completion states: an empty candidate pipeline, candidate activity timelines, report/export history, enterprise loading, access-denied, and error views. Candidate evaluation reports are now addressed by candidate slug and carry role-specific scores, skills, summaries, strengths, and growth areas. Mobile-specific work is explicitly out of scope at the user's request. |
| 2026-09-03 | Completed the custom interview authoring workflow. RecruitPro drafts persist locally between builder routes, then save and publish through the existing RLS-protected `panels` table. Stable runtime fields remain in `PanelConfig`; evolving RecruitPro fields—role, stages, reviewed questions, rubric, candidate settings, lifecycle status, publish timestamp, and invitation code—live in the configuration JSONB. Templates initialize the same canonical draft, published panels appear in the authenticated interview list, and saved panels can be reopened for editing. |
| 2026-09-03 | Added recruiter interview testing. Every saved interview detail exposes **Test interview**, which opens a dedicated window and loads that exact panel from Supabase into the same `InterviewRoomLive` component used by candidates. Test sessions exercise the real backend and Agora flow, but `testMode` prevents rehearsal reports from being persisted into candidate analytics. |
| 2026-09-03 | Made interview testing discoverable in both the interview table and interview-detail header. The seeded Frontend Architect interview now previews the canonical locally persisted draft configuration, while saved interviews continue to load their exact Supabase panel configuration. |
| 2026-09-03 | Separated written-question delivery from agent speech in the enterprise candidate experience. Reviewed RecruitPro questions are normalized into a deterministic runtime knowledge bank, returned to the client as structured question data, and rendered in the arena with category and difficulty. The voice agent only announces that the question is onscreen and must not recite or paraphrase it. |
| 2026-09-03 | Removed the visible live transcript from the enterprise candidate experience. Speech-to-text remains internal to orchestration and scoring. The coding terminal is now conditional on the backend-classified question kind and is absent during introductions and verbal questions. |
| 2026-09-03 | Made the backend pending-question id the synchronization authority for written UI and voice follow-ups. Scored answers now resolve as `retry`, `correct`, or `skipped`: incorrect, partial, or vague answers retain the same pending question and do not consume the interviewer turn cap; only an accepted answer or a short explicit give-up phrase (`I don't know`, `skip`, or `pass`) permits advancement. Reference-backed answers additionally require at least 70% coverage. |
| 2026-09-03 | Added destructive panel management to the authenticated interview list and detail view. Deletion requires explicit browser confirmation, executes against the RLS-protected Supabase `panels` table, verifies that a row was actually returned by the delete operation, and only then removes it from the UI. Candidate reports are preserved because their `panel_id` foreign key uses `ON DELETE SET NULL`. |
| 2026-09-03 | Made panel lifecycle navigation operational. All, Draft, Published, and Archived tabs now filter live Supabase-backed panel summaries and display counts; text search filters within the selected lifecycle. Publishing remains behind full builder validation. Management screens can archive a draft or published panel and restore it to its prior state, with `archivedFrom` retained in panel JSONB and every transition verified through an RLS-protected Supabase update. Invitation actions are shown only for published panels. |
| 2026-09-03 | Removed the standalone Rubric stage from the RecruitPro builder. AI Configuration is now **AI & Scoring**, where every interviewer owns its scoring criteria and final-score percentage. The six-stage builder validates that every agent has criteria and that agent weights total 100%; the scoring model and compatibility policy are recorded in ADR 008. |
| 2026-09-03 | Fixed published invitation startup. `/interview-room?panel=…&invite=…` now resolves the saved panel instead of falling back to the unrelated local builder store. FastAPI validates the capability code and published lifecycle using the Supabase service credential, returns only safe panelist metadata to the pre-interview UI, and loads the private prompts, scoring configuration, and question bank server-side when starting the session. Draft, archived, missing, and incorrectly coded invitations are rejected without exposing whether a private panel exists. |
