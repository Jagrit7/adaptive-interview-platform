# ADR-010: Orchestrated specialist voice floor

- **Status:** Accepted
- **Date:** 2026-09-03
- **Scope:** Enterprise panel interviews

## Context

The enterprise interview had two independent control loops. Agora could hear a
candidate and respond autonomously, while completed transcript segments also
called the backend `/next` route. This allowed playback echo, duplicate ASR
segments, and concurrent requests to advance questions or make the panel appear
to interview itself.

Hot-swapping only the LLM prompt was also insufficient for panel personas. In
Agora Agent SDK 2.7, the running session retains a rolling conversation history
and the update schema does not document mutable TTS configuration. A nominal HR
persona could inherit technical context, while its requested voice change was
not guaranteed.

## Decision

> Superseded for enterprise panel interviews by ADR 011. This decision remains
> relevant to the individual DSA interview and legacy API sessions.

The backend orchestrator is the sole authority for the current specialist,
question, question revision, conversation floor, workspace, scoring, handoffs,
and completion.

The floor is one of `agent_speaking`, `candidate_speaking`, `workspace`,
`evaluating`, or `finished`. Agora remains the media and conversational
transport: RTC, microphone capture, VAD, transcription, TTS, turn-finished
events, and interruption. An Agora turn-finished event explicitly yields the
floor through `candidate-ready`; a transcript cannot select or advance a
question.

Every finalized answer carries `question_id`, a monotonically increasing
`question_revision`, and a stable `answer_id`. Stale revisions are rejected,
duplicate answer IDs reuse the already-created transition, and a per-session
guard prevents concurrent scoring.

Turn completion uses Agora Conversational AI semantic end-of-speech detection,
not a browser-only silence timer. Semantic pause awareness keeps listening when
the candidate signals that they are thinking, while a 650 ms base silence and a
short 350 ms transcript-coalescing window avoid stacking several fixed delays.

## Specialist isolation

Each interviewer resolves to a `SpecialistProfile` containing its domain
boundary, permitted question kinds, and voice ID. Server-owned boundaries are
added separately from builder-authored style prompts. An HR/behavioural
specialist, for example, cannot use a DSA or system-design bank and is restricted
to verbal behavioural questions.

Questions carry an explicit domain (`dsa`, `system_design`, `behavioural`,
`product`, `customer`, or `general`). Newly saved panels set it directly; a
central compatibility classifier upgrades older saved questions. Hydration
filters each private bank by both question kind and semantic domain, preventing
a verbal behavioural question from slipping through merely because a technical
agent also accepts verbal input.

The global transcript remains available for reporting, but an evaluator sees
only turns belonging to its active specialist. At a handoff, the old Agora
session is stopped and a new session starts with a fresh LLM history, new
specialist boundary, distinct RTC UID, and that specialist's resolved voice.
Only one session is active, so all panel members can stay visible without
creating several listeners or speakers that react to one another.

## Voice resolution

An interviewer may store a preferred managed `voiceId`. The backend validates
it against the panel language and avoids duplicates while unused voices remain.
Invalid, stale, missing, or duplicate preferences fall back to the next managed
voice. Languages with smaller pools reuse voices rather than failing.

## Question and workspace delivery

The orchestrator selects from the assigned server-side bank. A verbal question
is printed and spoken once. A written or coding prompt is printed, while the
agent announces only that it is visible. The workspace opens after that
announcement finishes. Running code does not advance the interview; Submit or
the explicit “I don't know” action does.

Selection and presentation are deliberately separate. The API may stage the
next authoritative question during evaluation, but the browser reveals it only
on Agora's next `AGENT_SPEAKING_CHANGED(active=true)` event. The writing/coding
Terminal remains closed until `candidate-ready` transfers the floor to the
workspace. This prevents the screen from advancing ahead of the voice.

Question banks are shuffled per session and a bounded process-local history is
kept per panel and interviewer. Recently asked items move behind unseen items
on later attempts, while per-session `asked_item_ids` still prevents repeats in
one interview. Persist this small recency ledger in Supabase or Redis when the
backend becomes multi-worker or restart-safe.

When candidate speech is finalized, the browser interrupts any autonomous
Agora response before submitting the combined answer. The orchestrator then
injects the only permitted acknowledgement and next question. Candidate audio
is muted while an interviewer speaks and while a written workspace is active.

## Consequences

- UI, speech, and progress share one authoritative state.
- DSA, system-design, and HR contexts and voices are genuinely isolated.
- Handoffs have a small session-restart delay in exchange for reliable context
  and voice separation.
- In-memory session storage still limits deployment to one backend process;
  Redis or persisted events are required before multi-worker operation.
- LLM-only legacy agents with no assigned bank retain their previous behavior.
  New RecruitPro panels persist role-filtered private question banks.

## Revision history

| Date | Change |
|---|---|
| 2026-09-03 | Added authoritative floor/revision state, idempotent answer handling, role boundaries, private specialist evaluation context, distinct voice preferences, and fresh Agora sessions at handoff. |
| 2026-09-03 | Replaced stacked fixed VAD/debounce delays with Agora semantic endpointing, lowered soft-speech detection threshold, added RTM speaking-state fallback, and enforced explicit semantic question domains per specialist. |
| 2026-09-03 | Staged visual questions until Agora begins the matching speaking turn, delayed the Terminal until floor handoff, added answer-aware acknowledgements, and avoided recently used questions across attempts. |
