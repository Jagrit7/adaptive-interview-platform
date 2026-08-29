from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid

from app.schemas.panel import Panel
from app.orchestrator.state import SessionState, TranscriptTurn
from app.orchestrator.orchestrator import build_initial_queue, apply_score_result, decide_next_step, ActionType
from app.orchestrator.scorer import score_turn
from app.orchestrator.agent_launcher import start_session_agent, swap_agent_persona, inject_followup

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


class NextTurnRequest(BaseModel):
    answer_text: str


class NextTurnResponse(BaseModel):
    action: ActionType
    current_agent_id: str | None
    is_finished: bool


def _scorer_thresholds(panel: Panel) -> dict[str, float]:
    return {c.name: c.threshold for c in panel.scorer.competencies}


@router.post("/sessions/start", response_model=StartSessionResponse)
def start_session(body: StartSessionRequest):
    try:
        queue = build_initial_queue(body.panel.agents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    opening_agent_id = queue.pop(0)
    agents_by_id = {a.id: a for a in body.panel.agents}
    opening_agent = agents_by_id[opening_agent_id]

    agora_agent_id, agora_session = start_session_agent(opening_agent, body.channel, body.remote_uid)

    state = SessionState(
        session_id=str(uuid.uuid4()),
        panel_project_name=body.panel.projectName,
        current_agent_id=opening_agent_id,
        queue=queue,
    )

    SESSIONS[state.session_id] = {
        "state": state,
        "panel": body.panel,
        "agora_session": agora_session,
    }

    return StartSessionResponse(
        session_id=state.session_id,
        agent_id=opening_agent_id,
        agora_agent_id=agora_agent_id,
    )


@router.post("/sessions/{session_id}/next", response_model=NextTurnResponse)
async def next_turn(session_id: str, body: NextTurnRequest):
    session_data = SESSIONS.get(session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="Session not found")

    state: SessionState = session_data["state"]
    panel: Panel = session_data["panel"]
    agora_session = session_data["agora_session"]

    if state.is_finished:
        return NextTurnResponse(action=ActionType.FINISHED, current_agent_id=None, is_finished=True)

    agents_by_id = {a.id: a for a in panel.agents}
    current_agent = agents_by_id[state.current_agent_id]

    transcript_so_far = "\n".join(
        f"{t.speaker} ({t.agent_id}): {t.text}" for t in state.transcript
    )

    # record the candidate's turn before scoring
    turn_number = len(state.transcript) + 1
    state.transcript.append(TranscriptTurn(
        turn_number=turn_number,
        agent_id=current_agent.id,
        speaker="candidate",
        text=body.answer_text,
    ))

    result = await score_turn(current_agent, panel.agents, transcript_so_far, body.answer_text)

    # write flags onto the transcript turn we just added
    state.transcript[-1].flags = result.flags

    apply_score_result(state, current_agent, result, _scorer_thresholds(panel))
    decision = decide_next_step(state, panel, result)

    if decision.action == ActionType.SWITCH_AGENT:
        new_agent = agents_by_id[decision.next_agent_id]
        swap_agent_persona(agora_session, new_agent)
    elif decision.action == ActionType.FOLLOW_UP:
        # simple generic nudge for now - could be made more specific using
        # result.flags (e.g. "the candidate's last answer was vague, ask them
        # to clarify" vs a plain "ask a natural follow-up question")
        nudge = "Ask a natural follow-up question based on the candidate's last answer."
        if "vague" in result.flags:
            nudge = "The candidate's last answer was vague. Ask them to be more specific."
        elif "contradiction" in result.flags:
            nudge = "The candidate's last answer contradicts something they said earlier. Point it out and ask them to clarify."
        inject_followup(agora_session, nudge)

    return NextTurnResponse(
        action=decision.action,
        current_agent_id=state.current_agent_id,
        is_finished=state.is_finished,
    )
