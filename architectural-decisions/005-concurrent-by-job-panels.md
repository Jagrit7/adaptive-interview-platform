# ADR-005: Concurrent By Job interview panels

- **Status:** Accepted
- **Date:** 2026-09-02

## Context

The product needs a **By Job** section containing prebuilt interview experiences
such as SDE and, later, UPSC. An SDE interview must feel like one real panel call:
the candidate sees and hears three distinct interviewers—DSA, system design, and
HR/communication—and receives both spoken questions and a written coding task.

The existing generic panel backend runs one Agora Conversational AI instance and
hot-swaps its persona. That is useful for user-built lightweight panels, but it
cannot produce three simultaneous RTC participants or reliably preserve distinct
voices. Starting three unrestricted listening agents is also invalid: every
candidate utterance would trigger all three LLMs and they would talk over one
another.

Agora binds `remote_uids` when an agent joins. The runtime update contract does
not provide a supported way to repeatedly mute, unmute, or retarget an agent's
audio subscription. This makes prompt-only floor control too fragile.

## Decision

### Server-owned, versioned presets

Job panels are backend-owned presets identified by `slug` and `version`. The
frontend selects `sde`; it does not submit or mutate the interviewer prompts,
weights, stage order, or tool access. Catalog and detail endpoints expose the
safe preset metadata needed by the By Job UI.

The initial SDE preset has exactly three stages and agents:

1. **Ari — DSA and coding:** controlled-random written DSA question followed by
   one verbal analysis question.
2. **Maya — system design:** one verbal design problem and adaptive follow-ups.
3. **Rhea — HR and communication:** a behavioural prompt and adaptive follow-ups.

The scoring allocation is 45% DSA, 35% system design, and 20% communication.

### Three concurrent RTC participants with one speaking floor

Starting a panel launches all three Agora agent sessions concurrently into the
same channel. They have stable, distinct RTC UIDs (`11`, `12`, and `13`) and
separately assigned voices. All successful launches are kept together; if any
agent fails to join, every successfully launched sibling is stopped and the
start request fails atomically.

The agents subscribe to a reserved, unused relay UID instead of the candidate's
raw audio. The client continues publishing microphone and camera media normally,
but it sends each **finalized candidate transcript** to the backend. The panel
coordinator relays that text only to the interviewer who owns the speaking floor.
This prevents cross-talk while keeping all three interviewer participants present
in one RTC call.

The UI must treat `transcript_relay_required: true` as a hard capability flag.
Partial/interim ASR text must not be posted as a complete answer. During the timed
coding phase there is no active speaking floor, and candidate utterances are not
relayed to any interviewer.

### Interview state machine

The first backend flow is:

`introduction -> dsa_ready -> coding -> dsa_follow_up -> handoff_pending -> system_design -> handoff_pending -> hr -> completed`

Handoffs are explicit. The frontend calls `advance` after the outgoing agent's
final speech event completes, preventing two agents from speaking at once.

The written DSA task is selected from the versioned DSA question bank through the
`sde-core` blueprint. Selection avoids recent attempts when possible, uses the
requested difficulty range, returns only public prompt/test fields, and keeps
hidden tests server-side. System-design and behavioural opening questions use a
stable controlled-random choice from each preset's reviewed seed list; their
follow-ups respond to the candidate's relayed answer.

## Consequences

- A panel costs three concurrent Agora Conversational AI sessions rather than
  one; quotas and per-minute costs must be monitored before production rollout.
- Candidate utterance ingestion becomes part of the correctness boundary. The
  frontend must deduplicate finalized transcripts and attach them to the current
  backend phase.
- This design provides distinct visible participants and voices without relying
  on unsupported runtime subscription changes.
- In-memory session state remains development-only. Production must persist the
  panel run, stage events, transcripts, attempts, and final report, and must add
  idempotency keys for start, utterance, submit, advance, and end operations.
- The generic single-instance persona-swap panel remains available for custom
  panels; By Job presets use this concurrent architecture.

## Future improvements

- Server-side ASR/event ingestion so finalized utterances do not depend on a
  browser relay.
- Webhook-confirmed speech completion and automatic, race-free handoff instead
  of the frontend calling `advance`.
- An explicit moderator/coordinator participant for panel introductions and
  closing summaries when product testing justifies a fourth voice.
- A generic cross-skill question catalog for system design, HR, UPSC, and future
  job families, replacing small preset-local verbal seed lists.
- Persisted aggregate reports with per-agent rubrics, evidence citations, and
  calibrated scores.
- Resume/reconnect support and distributed coordination through Postgres/Redis.

## Revision history

| Date | Change |
|---|---|
| 2026-09-02 | Accepted server-owned By Job presets and the initial SDE composition. Chose three concurrent Agora participants with transcript-relay speaking-floor control, a DSA blueprint-selected written task, explicit verbal handoffs, and atomic cleanup on partial launch failure. |
| 2026-09-02 | Added the individual-facing `/job-panels` entry under the clearer label **Job interviews**. Removed Profile from the left rail because Profile remains available in the top navigation; the new page presents SDE as available and UPSC as a planned preset. |
