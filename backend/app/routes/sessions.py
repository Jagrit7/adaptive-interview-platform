from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid

from app.config.voice_profiles import get_profile
from app.knowledge.store import pick_next_question
from app.schemas.panel import Agent, Panel
from app.orchestrator.state import SessionState, TranscriptTurn
from app.orchestrator.orchestrator import (
    ActionType,
    apply_score_result,
    build_initial_queue,
    decide_next_step,
    seed_agent_states,
)
from app.orchestrator.scorer import score_turn
from app.orchestrator.agent_launcher import (
    inject_followup,
    resolve_panel_voices,
    start_session_agent,
    swap_agent_persona,
)

router = APIRouter()

# In-memory session store. NOT production-safe (lost on restart, no multi-worker
# support) - fine for a hackathon single-process backend. Move to Redis or a DB
# table before this needs to survive a restart or run on more than one worker.
SESSIONS: dict[str, dict] = {}


class StartSessionRequest(BaseModel):
    panel: Panel
    channel: str
    remote_uid: str


class StartSessionResponse(BaseModel):
    session_id: str
    agent_id: str            # which PanelAgent is speaking (e.g. "tech-dsa")
    agora_agent_id: str      # the Agora instance ID, for status/stop calls
    language: str
    voice_id: str            # resolved from the language registry, not user input


class NextTurnRequest(BaseModel):
    answer_text: str


class NextTurnResponse(BaseModel):
    action: ActionType
    current_agent_id: str | None
    is_finished: bool
    coverage: float | None = None          # vs the knowledge-base reference answer
    missing_points: list[str] = []
    questions_asked: int = 0               # progress through the current agent's bank
    questions_total: int = 0


def _scorer_thresholds(panel: Panel) -> dict[str, float]:
    return {c.name: c.threshold for c in panel.scorer.competencies}


def _ask_from_bank(session_data: dict, agent: Agent, state: SessionState) -> bool:
    """Hands the agent its next unasked knowledge-base question.

    This is what makes "stick to the knowledge base" a guarantee rather than a
    request. The question is selected here, in Python, from the items the user
    uploaded, and pushed into the running agent via session.think(). The model
    never chooses what to ask next; it only decides how to phrase it.

    Returns False when the bank is spent, so the caller can mark the agent
    exhausted before the orchestrator makes its decision.
    """
    if not agent.knowledge.is_active():
        return False

    agent_state = state.get_agent_state(agent.id)
    item = pick_next_question(agent.knowledge.items, set(agent_state.asked_item_ids))
    if item is None:
        agent_state.bank_exhausted = True
        return False

    agent_state.mark_asked(item.id)
    inject_followup(
        session_data["agora_session"],
        "Ask the candidate this next question. Deliver it naturally in your own voice and "
        "style, but do not change what is being asked, and do not ask anything else "
        f"alongside it:\n\n{item.question}",
    )
    return True


@router.post("/sessions/start", response_model=StartSessionResponse)
def start_session(body: StartSessionRequest):
    try:
        queue = build_initial_queue(body.panel.agents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    opening_agent_id = queue.pop(0)
    agents_by_id = {a.id: a for a in body.panel.agents}
    opening_agent = agents_by_id[opening_agent_id]

    # Speech config is derived, never taken from the request body. A panel saved
    # before the provider change carries stale voice.provider/voiceId fields;
    # they are ignored rather than trusted.
    profile = get_profile(body.panel.language)
    voices = resolve_panel_voices(body.panel)
    opening_voice = voices[opening_agent_id]

    agora_agent_id, agora_session = start_session_agent(
        opening_agent,
        body.channel,
        body.remote_uid,
        language=profile.code,
        voice_id=opening_voice,
    )

    state = SessionState(
        session_id=str(uuid.uuid4()),
        panel_project_name=body.panel.projectName,
        language=profile.code,
        current_agent_id=opening_agent_id,
        queue=queue,
    )

    # Competencies are seeded to 0/uncovered up front - see seed_agent_states.
    seed_agent_states(state, body.panel)

    session_data = {
        "state": state,
        "panel": body.panel,
        "agora_session": agora_session,
        "voices": voices,
    }
    SESSIONS[state.session_id] = session_data

    # In knowledge-base mode the opening agent needs its first question now -
    # the greeting message alone would leave it to improvise an opener, which is
    # exactly what the bank exists to prevent.
    if opening_agent.knowledge.is_active():
        _ask_from_bank(session_data, opening_agent, state)

    return StartSessionResponse(
        session_id=state.session_id,
        agent_id=opening_agent_id,
        agora_agent_id=agora_agent_id,
        language=profile.code,
        voice_id=opening_voice,
    )


@router.post("/sessions/{session_id}/next", response_model=NextTurnResponse)
async def next_turn(session_id: str, body: NextTurnRequest):
    session_data = SESSIONS.get(session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    state: SessionState = session_data["state"]
    panel: Panel = session_data["panel"]
    agora_session = session_data["agora_session"]
    voices: dict[str, str] = session_data["voices"]

    if state.is_finished:
        return NextTurnResponse(action=ActionType.FINISHED, current_agent_id=None, is_finished=True)

    agents_by_id = {a.id: a for a in panel.agents}
    current_agent = agents_by_id[state.current_agent_id]
    current_state = state.get_agent_state(current_agent.id)

    transcript_so_far = "\n".join(
        f"{t.speaker} ({t.agent_id}): {t.text}" for t in state.transcript
    )

    # The question this answer is a reply to, captured before scoring overwrites it.
    answered_item_id = current_state.pending_item_id

    # record the candidate's turn before scoring
    turn_number = len(state.transcript) + 1
    state.transcript.append(TranscriptTurn(
        turn_number=turn_number,
        agent_id=current_agent.id,
        speaker="candidate",
        text=body.answer_text,
        knowledge_item_id=answered_item_id,
    ))

    result = await score_turn(
        current_agent,
        panel.agents,
        transcript_so_far,
        body.answer_text,
        asked_item_id=answered_item_id,
    )

    # write flags and coverage onto the transcript turn we just added
    state.transcript[-1].flags = result.flags
    state.transcript[-1].coverage = result.coverage

    apply_score_result(state, current_agent, result, _scorer_thresholds(panel))

    # decide_next_step reads bank_exhausted, so it has to be accurate BEFORE the
    # decision is made - not discovered afterwards when we go to inject.
    if current_agent.knowledge.is_active():
        has_more = pick_next_question(
            current_agent.knowledge.items, set(current_state.asked_item_ids)
        ) is not None
        current_state.bank_exhausted = not has_more

    decision = decide_next_step(state, panel, result)

    if decision.action == ActionType.SWITCH_AGENT:
        new_agent = agents_by_id[decision.next_agent_id]
        swap_agent_persona(agora_session, new_agent, voices.get(new_agent.id))
        # The incoming agent gets its first bank question straight away, same
        # reason as the opening agent above.
        _ask_from_bank(session_data, new_agent, state)

    elif decision.action == ActionType.FOLLOW_UP:
        asked = _ask_from_bank(session_data, current_agent, state)
        if not asked:
            # Either this agent isn't in knowledge-base mode, or it is in
            # non-strict mode with a spent bank - both fall back to the original
            # free-form nudge, shaped by whatever the scorer flagged.
            nudge = "Ask a natural follow-up question based on the candidate's last answer."
            if "vague" in result.flags:
                nudge = "The candidate's last answer was vague. Ask them to be more specific."
            elif "contradiction" in result.flags:
                nudge = ("The candidate's last answer contradicts something they said earlier. "
                         "Point it out and ask them to clarify.")
            elif result.missing_points:
                # A partially-covered reference answer is the most useful thing
                # to probe on - it names exactly what is still missing.
                gaps = "; ".join(result.missing_points[:3])
                nudge = (
                    "The candidate's answer was incomplete. Without telling them the answer, "
                    f"probe on what they did not cover: {gaps}"
                )
            inject_followup(agora_session, nudge)

    active_agent = agents_by_id.get(state.current_agent_id)
    active_state = state.get_agent_state(state.current_agent_id) if active_agent else None

    return NextTurnResponse(
        action=decision.action,
        current_agent_id=state.current_agent_id,
        is_finished=state.is_finished,
        coverage=result.coverage,
        missing_points=result.missing_points,
        questions_asked=len(active_state.asked_item_ids) if active_state else 0,
        questions_total=len(active_agent.knowledge.items) if active_agent else 0,
    )
