# ADR 011: LLM host with concurrently present specialists

**Status:** Accepted for implementation  
**Date:** 2026-09-04

## Decision

An interview has one candidate, one LLM host/orchestrator, and `n` specialist
agents. The host is the `+1` agent: it has its own persona, voice, context,
transcript and meeting tile. It greets the candidate, gathers introductory
details, plans validated handoffs and closes the meeting.

The orchestration LLM does not directly mutate runtime state. It returns a
structured proposal. A small deterministic controller validates the proposal
against the panel-authored flow before committing it. This makes the
orchestrator conversational without allowing it to activate two speakers,
exceed retry limits, select a forbidden question type or skip required steps.

```text
                              panel-authored FlowPlan
                                       │
candidate audio ──Agora ASR──► LLM HOST / ORCHESTRATOR
                                       │ structured proposal
                                       ▼
                              deterministic validator
                         ┌─────────────┼──────────────┐
                         │             │              │
                    question bank   floor lock    session state
                         │             │              │
                         └──────► active specialist ◄─┘
                                      │
                               Agora voice output
                                      │
                                  candidate

Meeting roster: [Host] [Specialist 1] ... [Specialist n] [Candidate]
Speaking floor: exactly one agent UID at a time
```

## Runtime model

Every agent is represented in the meeting for the full session and owns a
separate context/transcript. Exactly one agent owns the speaking floor.
Inactive specialists do not autonomously consume candidate turns. Candidate
transcript text is routed by the controller only to the active specialist;
this prevents agents from hearing one another and recreating the self-talk
failure.

The backend state machine has these phases:

1. `host_intake`: host greets, asks the candidate's preferred name and the
   configured introductory fields.
2. `host_planning`: orchestration LLM proposes the next flow action.
3. `agent_speaking`: one selected specialist acknowledges/transitions and asks
   or announces exactly one assigned question.
4. `candidate_speaking` or `workspace`: the candidate owns the floor.
5. `evaluating`: the answer is scored and vague/retry/handoff facts are added
   to state.
6. Steps 2–5 repeat until the plan is complete.
7. `host_closing`: host gives a short conversational close; then `finished`.

## User-authored flow

The saved panel gains a versioned `flow` object:

```json
{
  "version": 1,
  "host": {
    "name": "RecruitPro Host",
    "systemPrompt": "Warm, concise interview host",
    "introFields": ["preferred_name", "current_role"],
    "openingMessage": "",
    "closingInstruction": "Thank the candidate and explain next steps"
  },
  "steps": [
    {
      "id": "dsa-round",
      "agentId": "dsa-agent-id",
      "questionKinds": ["verbal", "coding"],
      "questionCount": 3,
      "maxRetriesPerQuestion": 1,
      "vagueProbe": true,
      "handoffCondition": "after three resolved questions"
    }
  ]
}
```

The LLM may choose only among actions made legal by the current step:
`ask_intro`, `activate_agent`, `ask_question`, `retry`, `handoff`, and `close`.
Question selection stays backend-owned: the controller filters the active
agent's private bank by the step's allowed kinds, domain and difficulty, then
chooses a randomized non-recent item. The LLM never invents or substitutes the
authoritative question.

## Agora boundary

Agora remains the live meeting transport for RTC, ASR events, TTS, speaking
state and interruption. The orchestration LLM runs in the backend so its
structured output can be validated locally and does not require an
internet-reachable tool callback into a developer's localhost. Each voice
participant has a stable Agora UID. The client correlates speaking events and
transcripts by UID instead of treating every agent event as the same persona.

## Room layout

Without a written/coding question, the host, specialists and candidate occupy
a centered Meet-style tile grid. When the workspace floor opens, a single CSS
layout-state transition moves agent tiles into a compact left rail, expands the
Terminal in the center and moves the candidate tile to the right. Only the
Terminal scrolls. Transform, grid-template and opacity transitions use the
same 300 ms easing curve and respect `prefers-reduced-motion`.

## Compatibility and migration

Panels without `flow.version` are upgraded in memory: the host receives safe
defaults and one step is generated for each existing agent in current priority
order using its `maxTurns`, existing handoff trigger and compatible bank kinds.
No Supabase migration is needed because panel configuration is stored in a
JSONB column. New saves persist the versioned flow.

## Consequences

- Conversation planning is LLM-driven, but state and safety invariants are
  deterministic and testable.
- All visible agents retain distinct personas, voices and histories.
- Inactive agents cannot respond to candidate speech or to another agent.
- The flow builder becomes the source of truth for order, counts, retries,
  probing and handoff rules.
- A multi-agent session costs one Agora voice session per visible AI
  participant; production must enforce panel-size and timeout limits.

## Implementation record

On 2026-09-04 the versioned flow schema, legacy in-memory upgrade, structured
Groq host planner, action allow-list validation, bounded retries, question-kind
filtering, stable `n + 1` Agora sessions, per-UID speaking-event correlation,
meeting teardown, host configuration, agent ordering controls and animated room
layout were implemented. The host is the sole candidate-audio subscriber;
inactive specialists subscribe to no candidate UID and receive only the routed
text for turns where they own the floor. Their absent subscription target is
the reserved UID `2147483647`, which stays within Agora's signed 32-bit numeric
RTC UID range; using an unsigned 32-bit sentinel causes session creation to be
rejected with HTTP 400.
