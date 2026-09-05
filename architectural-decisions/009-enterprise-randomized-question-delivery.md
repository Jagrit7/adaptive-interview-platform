# ADR-009: Per-agent randomized banks and question-specific workspaces

- **Status:** Accepted
- **Date:** 2026-09-03
- **Scope:** Enterprise panel interviews

## Decision

Every enterprise interviewer owns a `questionBank` choice: `dsa`,
`system-design`, or `custom`. A saved panel stores that reference; FastAPI
hydrates it at session start and creates a deterministic random order from the
session and agent IDs. This keeps retries reproducible, avoids repeats within a
session, and keeps hidden answers and tests out of panel JSON in the browser.

The DSA choice reuses up to 30 executable problems from the existing
Supabase-backed DSA runtime catalog and fills the pool to exactly 50 with
project-authored conceptual verbal questions. Production obtains its larger
coding catalog from Supabase; the checked-in offline fallback has ten coding
problems plus 40 verbal questions. The System Design choice has 50
project-authored items:
25 verbal discussions and 25 written architecture exercises. Custom uses the
reviewed questions in the enterprise builder and is randomized in the same
way. Further subject banks use the same `bankId` boundary rather than new panel
schemas.

Question delivery is typed as `verbal`, `written`, or `coding`:

- every active question is printed from the backend's authoritative question
  object; verbal questions are also asked aloud and keep the agents and
  candidate camera in the centered conversation layout;
- written questions open a writing pad in the center;
- coding questions open a LeetCode-style prompt, public examples, editor, Run
  action, and final Submit action with hidden tests;
- the voice agent announces a written/coding question but never reads it.

The desktop room always has three stable layout regions. Before a workspace is
needed, its center column is collapsed. When a written question arrives, CSS
grid-column transitions move the panel left, reveal the workspace in the
middle, and move the candidate self-view right.

The live room is constrained to one viewport (`100dvh`) with fixed status and
control bars. Page-level scrolling is disabled. Only the coding terminal,
writing pad, and their contained test output may scroll.

The conversational voice model does not receive the full question bank or
reference answers. The backend is the only question-state authority and sends
one typed control instruction for the active question. Verbal control messages
contain exactly the question to ask; written/coding messages deliberately omit
the prompt, making it impossible for the agent to read it. Subsequent control
messages override stale model output, while the first question appends after
the greeting. Patient voice activity detection waits through natural pauses.

Transcript ownership is determined by Agora's typed metadata
(`USER_TRANSCRIPTION` versus `AGENT_TRANSCRIPTION`), never by assuming every
UID other than the expected agent UID is the candidate. Unknown sources fail
closed. Candidate-labelled transcript received during agent audio playback, or
during its short acoustic tail, is treated as speaker echo and is not submitted
as an answer.

Every answer and code execution request carries the active question ID. The
backend rejects stale IDs before changing session state. A question is exposed
as executable `coding` only when the backend holds its private runner contract
(signature, tests, and validator); a custom recruiter prompt merely labelled
Coding is delivered as a written-pad response instead of opening unusable
Run/Submit controls.

## Answer progression and scoring

A completed answer is one attempt. It always advances to the next controlled
question; correctness is no longer a lock. The scorer records a 0–1
`question_score` proportional to reference-answer coverage. Coding submissions
use passed tests divided by total public and hidden tests. Explicit phrases such
as “I don't know,” “no clue,” “I can't answer,” “skip,” and “move on” record a
zero for the current agent's criteria and advance immediately.

Per-question scores are retained on transcript evidence for reporting. Existing
agent competency rollups remain best-observed scores, and the final panel score
continues to use the configured per-agent weights from ADR-008.

## Future improvements

- Move System Design content into the generalized Supabase question/version
  tables once the cross-skill migration in ADR-004 is implemented.
- Grow the checked-in executable DSA fallback beyond ten so offline development
  can exercise a wider variety of coding tasks within the existing 50-item mix.
- Add calibrated weighted test cases and partial semantic scoring for diagrams.
- Persist deterministic session question plans so backend restarts can resume.
- Add recruiter filters for difficulty mix, verbal/written ratio, and topic
  coverage within each selected bank.

## Revision history

| Date | Change |
|---|---|
| 2026-09-03 | Added per-agent bank references, 50 System Design items, DSA catalog reuse, typed workspace delivery, proportional per-question scoring, and explicit give-up advancement. |
| 2026-09-03 | Printed verbal and written questions from one backend state, constrained the room to one viewport, removed the full bank from the voice prompt, omitted written prompts from voice control messages, and added stale-response override plus patient turn detection. |
| 2026-09-03 | Fixed agent self-conversation by preserving Agora transcript source metadata, rejecting unknown sources, and suppressing user-labelled acoustic echo during agent playback. |
| 2026-09-03 | Bound answers and executions to active question IDs and restricted executable coding UI to questions with real backend runner contracts, eliminating stale-answer advancement and contractless 409 errors. |
| 2026-09-03 | ADR-010 superseded transcript-driven advancement and prompt-only persona swapping with an explicit conversation floor, revisioned turns, and isolated Agora specialist sessions. |
| 2026-09-03 | Added explicit question domains and per-specialist domain filtering so technical banks cannot receive behavioural questions even when both are verbal. |
