# Architectural decisions

This directory records product and engineering decisions that should remain
stable across implementation work. Each decision describes its context, the
chosen design, ownership boundaries, consequences, and revision history.

## Maintenance rule

When a later change affects an existing decision:

1. Update the relevant decision document in the same change.
2. Add a dated entry to its **Revision history** explaining what changed and why.
3. If the old decision is no longer valid, mark it `Superseded` and link to the
   replacement decision rather than silently rewriting its history.

## Decisions

| ID | Decision | Status |
|---|---|---|
| [ADR-001](./001-individual-profile-data-model.md) | Individual profile and progress data ownership | Accepted |
| [ADR-002](./002-dsa-first-skill-path-release.md) | DSA-first skill-path release and reusable page contract | Accepted |
| [ADR-003](./003-dsa-timed-coding-interview-flow.md) | DSA timed coding and verbal follow-up flow | Accepted |
| [ADR-004](./004-dsa-question-bank-and-selection.md) | Versioned DSA question bank and controlled-random selection | Accepted |
| [ADR-005](./005-concurrent-by-job-panels.md) | Concurrent By Job panels with coordinated verbal and written stages | Accepted |
| [ADR-006](./006-enterprise-information-architecture.md) | RecruitPro enterprise information architecture and unified interview builder | Accepted |
| [ADR-007](./007-enterprise-report-storage-and-query.md) | Enterprise report storage and Agora voice querying | Accepted |
| [ADR-008](./008-agent-owned-interview-scoring.md) | Agent-owned criteria, weights, and final-score aggregation | Accepted |
| [ADR-009](./009-enterprise-randomized-question-delivery.md) | Per-agent randomized banks and question-specific workspaces | Accepted |
| [ADR-010](./010-orchestrated-specialist-voice-floor.md) | Orchestrated specialist voice floor and isolated personas | Accepted |
