# ADR 008: Agent-owned interview scoring

Date: 2026-09-03  
Status: Accepted

## Decision

The enterprise builder no longer has a separate panel rubric step. Every AI
interviewer owns:

- a list of criteria it scores from answers to its questions; and
- a percentage weight representing its contribution to the final panel score.

Agent weights must total exactly 100% before an interview can be published. A
zero-weight agent is allowed so an observer can contribute qualitative evidence
without changing the final recommendation.

Each candidate answer continues to be scored only in the context of the active
interviewer. For each interviewer, the report takes the best-to-date score for
each of that interviewer's criteria and calculates the agent score as their
arithmetic mean. The final result is:

`overall = sum(agent score * agent weight) / sum(agent weight)`

The final report stores each agent's normalized weight and score. Criterion
results remain in the report as evidence and continue to support competency
searches, but their former global weights no longer determine the overall score.

## Compatibility

`Agent.scoring.weight` is optional at the API boundary so older saved panels and
checked-in presets remain valid. When an old panel has no agent weights, its
previous global rubric weights are summed for the criteria owned by each agent;
those sums become the legacy agent shares. If neither source exists, agents are
weighted equally.

When an older RecruitPro panel is opened in the builder, its derived agent
weights are normalized to integer percentages totalling 100 and its existing
agent criteria are retained. The obsolete `/enterprise/builder/rubric` URL
redirects to the combined AI and scoring step.

The panel-level `scorer` object and stored enterprise `rubric` field remain
read-compatible for legacy data. New RecruitPro saves write an empty global
scorer and do not write a rubric.

## Consequences

- Recruiters configure scoring where the questioning responsibility is defined.
- Adding more criteria to one interviewer does not silently increase that
  interviewer's influence.
- Reports clearly expose each interviewer's score and contribution.
- Existing saved panels do not require a Supabase migration.

## Future improvements

- Store immutable per-answer score evidence instead of only best-to-date
  criterion state, enabling average, latest, and recovery-aware policies.
- Allow questions to be assigned to specific agents rather than copying one
  selected question bank to every agent.
- Version scoring policies on published panels so editing a draft cannot change
  the interpretation of an interview already completed.
- Add calibration analytics comparing score distributions between agents.
