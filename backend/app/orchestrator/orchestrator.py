from enum import Enum
from pydantic import BaseModel

from app.schemas.panel import Agent, Panel
from app.orchestrator.state import SessionState
from app.orchestrator.scorer import ScoreResult


class ActionType(str, Enum):
    FOLLOW_UP = "follow_up"       # same agent, another question this visit -> agent_launcher.inject_followup(session, ...)
    SWITCH_AGENT = "switch_agent" # hand off to a different agent -> agent_launcher.swap_agent_persona(session, new_agent)
    END_VISIT = "end_visit"       # current agent's visit is over, go to back of queue (or done)
    FINISHED = "finished"          # whole panel is done


class OrchestratorDecision(BaseModel):
    action: ActionType
    next_agent_id: str | None = None
    reason: str = ""


PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def build_initial_queue(agents: list[Agent]) -> list[str]:
    openers = [a for a in agents if a.turnTaking.canOpen]
    if not openers:
        raise ValueError(
            "No agent has turnTaking.canOpen=True - fix this in the builder before starting a session."
        )
    openers_sorted = sorted(openers, key=lambda a: PRIORITY_ORDER.get(a.turnTaking.priority, 1))
    # openers go first, in priority order; remaining agents appended after, also by priority
    others = [a for a in agents if not a.turnTaking.canOpen]
    others_sorted = sorted(others, key=lambda a: PRIORITY_ORDER.get(a.turnTaking.priority, 1))
    return [a.id for a in openers_sorted] + [a.id for a in others_sorted]


def apply_score_result(
    state: SessionState,
    current_agent: Agent,
    result: ScoreResult,
    scorer_thresholds: dict[str, float],
) -> None:
    """Writes this turn's scores into session state. Call this before decide_next_step().
    scorer_thresholds: competency name -> threshold, from panel.scorer.competencies."""
    agent_state = state.get_agent_state(current_agent.id)
    for competency, score in result.competency_scores.items():
        existing = agent_state.competency_scores.get(competency)
        best_score = max(score, existing.score if existing else 0.0)
        threshold = scorer_thresholds.get(competency, 0.7)  # sensible default if not found
        from app.orchestrator.state import CompetencyScore
        agent_state.competency_scores[competency] = CompetencyScore(
            score=best_score,
            covered=best_score >= threshold,
        )
    state.current_visit_turn_count += 1


def decide_next_step(
    state: SessionState,
    panel: Panel,
    result: ScoreResult,
) -> OrchestratorDecision:
    """
    The locked algorithm:
    1. Cross-agent trigger match (not the current agent) -> switch immediately.
    2. Current agent's visit-turn cap reached, or 100% satisfied this visit -> end visit.
       - If now fully satisfied -> remove from queue permanently.
       - Else if visit_count hit maxVisits -> force-close, remove from queue.
       - Else -> back of queue.
    3. Otherwise -> follow-up, same agent continues.
    4. Queue empty -> finished.
    """
    agents_by_id = {a.id: a for a in panel.agents}
    current_agent = agents_by_id[state.current_agent_id]
    current_state = state.get_agent_state(current_agent.id)

    # Step 1: cross-agent trigger override
    other_triggered = [aid for aid in result.triggered_agent_ids if aid != current_agent.id]
    if other_triggered:
        target_id = other_triggered[0]  # first match wins; refine tie-break later if needed
        _end_current_visit(state, current_agent, current_state)
        return OrchestratorDecision(
            action=ActionType.SWITCH_AGENT,
            next_agent_id=target_id,
            reason=f"handoff trigger matched for agent {target_id}",
        )

    # Step 2: visit cap or full satisfaction
    visit_cap_hit = state.current_visit_turn_count >= current_agent.logic.maxTurns
    fully_satisfied_now = current_state.satisfaction() >= 1.0

    if visit_cap_hit or fully_satisfied_now:
        return _end_current_visit(state, current_agent, current_state)

    # Step 3: keep going with the same agent
    return OrchestratorDecision(
        action=ActionType.FOLLOW_UP,
        next_agent_id=current_agent.id,
        reason="visit not yet complete",
    )


def _end_current_visit(
    state: SessionState,
    current_agent: Agent,
    current_state,
) -> OrchestratorDecision:
    current_state.visit_count += 1
    state.current_visit_turn_count = 0

    if current_state.satisfaction() >= 1.0:
        # done for good - do not requeue
        pass
    elif current_state.visit_count >= current_agent.logic.maxVisits:
        current_state.force_closed = True
        # done, but not fully satisfied - do not requeue
    else:
        # back of the queue for a future revisit
        state.queue.append(current_agent.id)

    if not state.queue:
        state.is_finished = True
        return OrchestratorDecision(action=ActionType.FINISHED, reason="queue empty")

    next_agent_id = state.queue.pop(0)
    state.current_agent_id = next_agent_id
    return OrchestratorDecision(
        action=ActionType.SWITCH_AGENT,
        next_agent_id=next_agent_id,
        reason="visit ended, moving to next in queue",
    )
