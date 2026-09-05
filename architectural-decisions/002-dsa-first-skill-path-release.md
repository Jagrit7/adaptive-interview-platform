# ADR-002: DSA-first skill-path release and reusable page contract

- **Status:** Accepted
- **Date:** 2026-09-02
- **Scope:** Individual skills and interview presets

## Context

The individual Skills page currently presents several paths as if they are
usable, although their curriculum and interview experiences do not exist. This
creates dead ends and makes partial mock progress look like completed product
work. We need one end-to-end reference path before multiplying the format.

## Decision

Data Structures & Algorithms (`dsa`) is the only available skill path in the
initial individual release. All other catalog entries remain visible for
roadmap discovery but use the product availability state `coming_soon` and are
not navigable.

Product availability is catalog state. It must not be stored in
`user_skill_progress` and must not be expressed as an XP or level prerequisite.
Future prerequisite locks are a separate learner-specific concern.

Every skill detail page uses the same content-driven page contract:

- skill hero and outcome;
- level, available-module count, and estimated duration;
- ordered roadmap of module cards with explicit states;
- preconfigured interviewer summary and action;
- availability/release note.

The DSA path is the first implementation of that contract. Its initial
curriculum makes arrays and complexity, stacks and queues, and binary search
available. Hashing/linked lists and trees/graphs remain `coming_soon` within
the DSA path.

The DSA interviewer is an immutable application preset rather than a user-owned
enterprise panel. Version 1 uses one timed Two Sum coding challenge and one
code-specific verbal follow-up, and scores DSA fundamentals, complexity
analysis, and reasoning clarity. Its individual interview lifecycle is governed
by ADR-003.

## Consequences

- The Skills overview has one honest, functional destination rather than
  several dead links.
- Future skills can reuse the same detail component and substitute structured
  content.
- A visible `coming_soon` state can later be changed without rewriting a user's
  progress records.
- Interview integration must load the immutable preset into an individual
  session; it must not create or mutate an enterprise `panels` row.

## Design handoff

The canonical Google Stitch instruction is
`design-prompts/google-stitch/dsa-skill-page.md`. It defines both the DSA
reference content and the reusable visual/state contract for future skills.

## Revision history

| Date | Change |
|---|---|
| 2026-09-02 | Initial DSA-first release decision, page contract, and interviewer-preset boundary. |
| 2026-09-02 | Linked the initial DSA preset to the timed coding and verbal follow-up flow in ADR-003. |
