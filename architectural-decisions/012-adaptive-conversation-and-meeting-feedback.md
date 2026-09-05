# ADR 012: Adaptive Conversation and Meeting Feedback

Status: Accepted — 2026-09-04

## Decision

Keep each Agora interviewer as an isolated voice persona, but give the backend
LLM orchestrator a compact, evidence-linked projection of accepted candidate
answers across all roles. The orchestrator may select only validator-approved
actions. Partial, vague, contradictory, or incorrect answers expose a bounded
probe action; configured cross-role handoffs take precedence. A probe stays on
the same authoritative bank question and does not consume another question.
The evaluator scores cumulative evidence across the original response and its
same-question follow-ups, so candidates do not need to repeat themselves.

Each specialist also owns an `assessment_satisfaction` value: the evaluator's
confidence that this role has enough evidence to assess the configured ability.
It is explicitly independent of performance score—a detailed weak answer can
raise satisfaction. A flow step may end when this confidence reaches its
configured threshold or when its question cap is reached. Per-question retries
remain bounded and cannot extend either cap indefinitely. The final report
stores both score and assessment satisfaction.

The scoring and orchestration model is Groq `openai/gpt-oss-120b`. Live voice
personas use Groq `openai/gpt-oss-20b` inside Agora Conversational AI to keep
spoken-turn latency low. The larger model writes evidence-specific transition
instructions; the voice persona expresses them in its configured role and
voice. Question identity and speaking-floor transitions remain deterministic.

After a resolved answer, the next question's target difficulty moves by at
most one level inside the agent's configured band: up after strong evidence,
down after weak evidence, and unchanged otherwise. The hydrated bank remains
session-randomized; difficulty distance ranks that randomized candidate list.

The live room initially contains no question card. A backend-selected question
is staged and revealed only when the matching Agora agent begins its turn. The
card expands with the same Meet-style easing as the terminal layout. The
candidate tile and microphone control show a local input-level signal only
while the state machine has granted the candidate the floor, making it clear
when audio is being listened to and when speech is detected.

The room stays echo-safe by default rather than publishing candidate audio
through every AI turn. While an interviewer is speaking, the microphone control
offers explicit barge-in: it interrupts the active Agora voice, atomically asks
the backend to transfer the floor for the current revision, then enables audio.
This provides interruptible conversation without returning to the prior
always-open-microphone self-talk failure mode.

Agora speaking-completion events are leased to the question revision that
observed the corresponding speaking-start event. A late completion generated
by interrupting the prior host turn is consumed but cannot yield the floor for
the next turn, preventing greetings and follow-up questions from being cut off.

Coding `Run` executes public examples only. `Submit` evaluates the complete
public-plus-hidden suite, redacts hidden inputs and outputs, and sets the exact
question score to `passed / total`.

The spoken host opening must disclose that the participant is interacting with
AI interviewers. The candidate form keeps the written disclosure as a second,
independent notice.

## Consequences

- Interviewers can acknowledge, clarify, challenge, and connect prior evidence
  without inventing or advancing authoritative questions.
- Product, customer, hiring-manager, and behavioural roles can challenge an
  answer accepted by a technical role when their configured handoff condition
  matches.
- Shared context is evidence, not shared persona memory; role boundaries and
  distinct transcripts remain intact.
- Voice activity feedback is derived from the local Agora microphone track and
  the controlled conversation floor, not from transcript guesses.

## Decision log

| Date | Decision |
|---|---|
| 2026-09-04 | Added a client-side acoustic floor keyed by the orchestrator-selected Agora UID. Concurrent tracks remain subscribed, but only the granted speaker is played; all remote audio is silenced during candidate, workspace, and evaluation phases. This prevents an autonomous provider response from overlapping the orchestrated turn even when a network interrupt arrives late. |
| 2026-09-04 | Replaced transcript-packet completion with sustained microphone-silence completion so natural pauses remain part of one answer. Specialist turns now use satisfaction-aware round robin: retries stay with the current role, while resolved questions rotate to the next role that is below its evidence-satisfaction threshold, below its question cap, and has available bank questions. |
| 2026-09-04 | Question-kind configuration is now an ordered repeating schedule rather than an unordered allow-list. A DSA step configured as `coding, verbal` opens with an executable coding contract and alternates formats, ensuring its LeetCode-style Run/public-tests and Submit/hidden-tests workspace is reachable. |
| 2026-09-04 | Added a runtime compatibility upgrade for the original RecruitPro frontend template, whose technical prompts were saved as a three-item custom bank before per-agent bank selection existed. That exact legacy set is now hydrated from the randomized DSA bank with executable contracts and public/hidden tests. Explicit modern custom banks remain custom. |
