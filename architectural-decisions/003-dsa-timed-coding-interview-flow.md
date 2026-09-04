# ADR-003: DSA timed coding and verbal follow-up flow

- **Status:** Accepted
- **Date:** 2026-09-02
- **Scope:** Individual DSA interview

## Context

The existing Agora room treats every final candidate transcript segment as an
answer and keeps the conversational agent continuously active. Its code editor
is only a scratchpad. That behavior cannot support a timed coding exercise in
which the question is read on screen, the candidate works without interruption,
and the interviewer returns only after submission or expiry.

The initial DSA interview should validate the complete interaction model with
the smallest useful assessment: one typed coding question followed by one
verbal question about the submitted code.

## Decision

The first DSA interview uses this ordered state machine:

1. `connecting` — microphone, camera self-view, Agora channel, and interviewer
   session are prepared.
2. `introduction` — the interviewer greets the candidate, asks their name and a
   small number of conversational background questions, and establishes a
   natural tone. These answers belong to the interview session transcript; they
   do not overwrite profile fields.
3. `coding_brief` — the application reveals one exact structured coding
   question. The interviewer does not read the prompt, examples, or constraints
   aloud. It gives only a short instruction such as: “Your coding question is
   on screen. You have 20 minutes. Best of luck.”
4. `coding_active` — the countdown runs and the interviewer is visibly dormant.
   The candidate's camera self-view and microphone controls remain on, but
   candidate speech cannot advance the interview or cause an agent response.
5. `coding_review` — entered by either `submitted` or `expired`. Submission is
   accepted even when the code is incomplete. The system snapshots the exact
   code, language, remaining time, trigger, and available test results.
6. `verbal_follow_up` — the interviewer becomes active and asks exactly one
   spoken question grounded in the submitted or incomplete code. The candidate
   answers verbally. A finalized candidate transcript does not itself end the
   interview: the application waits for Ari's acknowledgement and evaluation
   turn before generating the report.
7. `finished` — the interview is closed and its transcript, code snapshot,
   timing, trigger, execution evidence, and scores are available to the report.

The written question is authoritative application state. Agora supplies the
spoken interaction but must not be the source from which the UI reconstructs
the problem statement.

## Agent inactivity during coding

“Inactive” is a behavioral guarantee: the interviewer must neither speak nor
advance the interview during `coding_active`.

- Automatic posting of speech transcripts to the next-turn endpoint is disabled
  during this state.
- The candidate's local Agora audio track remains allocated but transmission is
  paused with `setMuted(true)` for the complete coding state. This keeps capture
  and the local microphone/camera controls alive while making the
  interviewer's inability to hear the candidate deterministic.
- Merely prompting the language model to remain silent is not sufficient; model
  compliance is not a deterministic pause mechanism.
- On submission or expiry, audio interaction is restored before the follow-up
  is injected.

The current camera component is a local self-view and does not upload or record
video. Keeping the camera “on” therefore means maintaining that self-view in
version 1. Recording is a separate, consent-sensitive future capability.

## Coding question contract

The initial question contains a stable ID, title, full prompt, constraints,
examples, starter code, supported language, duration, hidden evaluation data,
solution outline, and expected time/space complexity. Hidden tests and reference
solutions remain backend-only.

The timer uses a server-issued deadline so refreshes, delayed renders, and
client clock manipulation cannot extend the attempt. When the deadline passes,
the backend accepts one immutable automatic snapshot even if the editor is
empty or syntactically invalid.

## Evaluation

Code correctness and execution evidence are deterministic inputs. The verbal
follow-up evaluates whether the candidate understands their own approach,
complexity, trade-offs, or failure case. The language model may score reasoning
but cannot override failing tests as though the code were correct.

The local-practice runner validates the Python AST, rejects imports and unsafe
runtime access, supplies a minimal builtin set, and executes the solution in a
separate isolated interpreter process with a three-second wall-clock timeout.
It never evaluates candidate code inside the FastAPI process. This is a useful
development boundary, not a production sandbox. Production execution still
requires an ephemeral container with strict CPU, memory, network, filesystem,
process-count, and wall-clock limits.

The Two Sum preset exposes six distinct cases covering positive values, a pair
later in the list, duplicates, a negative complement, zeroes, and a negative
target. `Run code` is repeatable and does not submit or advance the timer. Final
submission reruns the same authoritative cases and snapshots those results.

The report weights deterministic code correctness at 45%, verbal complexity
analysis at 30%, and reasoning clarity at 25%. The backend generates it only
after the complete verbal answer and Ari's response. It contains per-test
results, the code snapshot, the spoken answer, competency scores, feedback,
strengths, improvements, timing, and the transcript. The finished screen shows
the report immediately and keeps a session-scoped browser copy; durable report
persistence remains a future step while DSA sessions use the in-memory store.

Transcript identity is allow-listed, not inferred by exclusion. A candidate
turn must carry the exact RTC UID generated by that browser, and an interviewer
turn must carry Ari's configured agent UID. Agora service/control entries use
other UIDs and are excluded from the displayed transcript and all phase
transitions. The finish endpoint independently rejects the injected follow-up
instruction if a faulty client submits it as a verbal answer.

## Visual decision

The individual DSA interview uses the approved dark “Futuristic AI Arena”
direction from `frontend-improv`. The available references provide:

- a desktop and mobile dark “Futuristic AI Arena” pre-flight lobby;
- a mobile dark live-interview console;
- no generated desktop live-interview screen.

The desktop implementation therefore adapts the mobile live reference into a
focused three-area workspace: written problem, dominant code editor, and a
compact interviewer/candidate rail. Normal light individual navigation is
hidden during the interview. Ari's rail card is visibly dimmed and labelled
`Waiting for submission` during `coding_active`, then becomes active for the
verbal follow-up. The flow returns to the light individual experience after the
session.

The frontend route now uses the shared Agora RTC/RTM voice client and the
dedicated `/dsa/sessions` backend lifecycle. The backend starts one Ari agent,
keeps that Agora session alive across phases, and injects the coding brief and
verbal follow-up with the SDK session's `think` operation. Ending the interview
uses the SDK's native `stop` operation.

The introduction marks itself ready after two finalized candidate speech turns
(name and one background answer), then waits for Ari's conversational
acknowledgement to finish before injecting the coding brief. A manual
`Begin coding now` fallback remains. During
coding, candidate audio publication is disabled. Submission or expiry restores
audio before exactly one follow-up is injected. Agora turn detection uses a
longer 1.8-second end-of-speech silence window, preserves speech that starts
while Ari finishes, and disables mid-response interruption so incidental noise
cannot cut a question short. The initial implementation stores lifecycle state,
test evidence, and the generated report in an in-memory backend map; this is
suitable only for a single-process prototype.

## Future improvements and additions

- Multiple coding and verbal questions with adaptive difficulty.
- Candidate clarification requests during coding, implemented as an explicit
  “Ask interviewer” action rather than continuous agent listening.
- Additional languages after the Python execution path is reliable.
- Autosaved code drafts and reconnect/resume behavior.
- Plagiarism/similarity signals and suspicious-paste telemetry with clear user
  disclosure.
- Full video/audio recording only after consent, retention, access, and deletion
  policies are implemented.
- Accessibility alternatives: typed follow-up, captions, extended-time
  accommodations, keyboard-only editor use, and reduced-motion mode.
- Production session persistence instead of the current in-memory backend map.
- Production container sandboxing, hidden tests, and richer performance and
  memory feedback.

## Revision history

| Date | Change |
|---|---|
| 2026-09-02 | Initial greeting, timed coding, deterministic inactivity, submission/expiry, and verbal follow-up decision. |
| 2026-09-02 | Approved the dark arena direction and recorded the desktop problem/editor/side-rail composition. |
| 2026-09-02 | Connected the dark room to Agora RTC/RTM and dedicated DSA session routes; selected local-track publication disablement for deterministic coding silence and native session stop for teardown. |
| 2026-09-02 | Replaced timer-based verbal completion with acknowledgement-driven completion, tuned VAD/interruption behavior, added six repeatable code tests in a separate worker process, and generated an inline scored DSA report. |
| 2026-09-02 | Fixed premature verbal completion by allow-listing candidate and Ari RTC UIDs, ignoring Agora control transcript entries, and rejecting control instructions at the report boundary. |
| 2026-09-02 | Hardened silent-input handling: private DSA rooms use Agora's remote-user wildcard, temporary coding silence uses track muting rather than capture disablement, speech uses a mono STT profile, and the UI exposes mic signal/listening/error state. |
| 2026-09-02 | Split interview bootstrap diagnostics so an unreachable backend/token endpoint is no longer reported as a microphone failure. Added explicit messages for insecure contexts, denied permission, missing devices, and microphones busy in another application. |
