import re
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.orchestrator.agent_launcher import inject_followup, start_session_agent
from app.schemas.panel import (
    Agent,
    Behavior,
    Identity,
    Logic,
    Scoring,
    Skills,
    TurnTaking,
)


router = APIRouter(prefix="/report-query", tags=["enterprise-reports"])
REPORT_QUERY_SESSIONS: dict[str, dict[str, Any]] = {}
REPORT_AGENT_UID = "21"


class StartReportQueryRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    language: str = Field(default="en-US", min_length=2, max_length=20)


class ReportQueryIntent(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)
    metric: Literal["overall", "competency"] = "overall"
    competency: str | None = Field(default=None, max_length=100)
    role: str | None = Field(default=None, max_length=120)


class InterpretRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1_000)


class RankedCandidate(BaseModel):
    candidate_name: str = Field(max_length=200)
    role_name: str = Field(max_length=200)
    score: float | None = Field(default=None, ge=0, le=1)
    metric: str = Field(max_length=120)


class SpeakResultsRequest(BaseModel):
    query: ReportQueryIntent
    candidates: list[RankedCandidate] = Field(default_factory=list, max_length=20)


NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}


REPORT_AGENT = Agent(
    id="report-analyst",
    identity=Identity(
        name="Rhea",
        role="Custom",
        color="#111111",
        avatar="RA",
    ),
    behavior=Behavior(
        systemPrompt=(
            "You are Rhea, RecruitPro's conversational candidate-report analyst. "
            "Be warm, concise, and natural. The application, not you, queries the report database. "
            "Never invent a candidate, score, ranking, or report fact. When the user asks for a "
            "ranking or report comparison, briefly say that you are checking the verified reports "
            "and then stop. Wait for an application-injected message beginning VERIFIED REPORT "
            "RESULTS. Only that message is authoritative. Read its ranked result naturally, retain "
            "the context for follow-up questions, and invite one concise follow-up."
        ),
        greetingMessage=(
            "Hello, I'm Rhea, your RecruitPro report analyst. Ask me for the top candidates "
            "overall, by a competency, or for a particular role."
        ),
        fallbackMessage="I didn't catch that. Please ask for a candidate ranking again.",
        scenarioBrief="Read-only analysis of verified candidate interview reports.",
    ),
    logic=Logic(
        difficultyBand=(1, 1),
        seedQuestions=[],
        followUpAggressiveness=1,
        maxTurns=100,
        maxVisits=100,
    ),
    skills=Skills(
        rolePlayMode=False,
        loopUntilSatisfied=False,
        contradictionProbing=False,
    ),
    turnTaking=TurnTaking(
        canOpen=True,
        handoffTriggers="none",
        priority="medium",
    ),
    scoring=Scoring(competencies=[]),
)


def _clean_phrase(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(
        r"\b(score|scores|performance|candidate|candidates|applicant|applicants|role)\b",
        " ",
        value,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(?:instead|please|now)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,?!")
    return cleaned[:120] or None


def parse_report_query(
    text: str,
    previous: ReportQueryIntent | None = None,
) -> ReportQueryIntent:
    """Translate speech into a small allow-listed query shape, never SQL."""
    normalized = re.sub(r"\s+", " ", text.strip())
    lower = normalized.lower()

    numeric_limit = re.search(r"\btop\s+(\d{1,2})\b", lower)
    word_limit = re.search(
        r"\btop\s+(" + "|".join(NUMBER_WORDS) + r")\b",
        lower,
    )
    if numeric_limit:
        limit = int(numeric_limit.group(1))
    elif word_limit:
        limit = NUMBER_WORDS[word_limit.group(1)]
    elif previous:
        limit = previous.limit
    else:
        limit = 5
    limit = max(1, min(20, limit))

    role_match = re.search(
        r"\b(?:for|among|in)\s+(?:the\s+)?(.+?)(?:\s+(?:role|candidates?|applicants?))?(?=\s+(?:based\s+on|ranked?\s+by|by)\b|$)",
        normalized,
        flags=re.IGNORECASE,
    )
    role = _clean_phrase(role_match.group(1)) if role_match else None
    if not role and previous and re.search(r"\b(now|instead|what about|how about|same role)\b", lower):
        role = previous.role

    metric_match = re.search(
        r"\b(?:based\s+on|ranked?\s+by|by)\s+(.+?)(?=\s+(?:for|among|in)\b|$)",
        normalized,
        flags=re.IGNORECASE,
    )
    metric_phrase = _clean_phrase(metric_match.group(1)) if metric_match else None
    explicit_overall = bool(re.search(r"\b(overall|total|final)\b", lower))
    if explicit_overall or (not metric_phrase and not previous):
        metric: Literal["overall", "competency"] = "overall"
        competency = None
    elif metric_phrase:
        metric = "overall" if metric_phrase.lower() in {"overall", "total", "final"} else "competency"
        competency = None if metric == "overall" else metric_phrase
    else:
        metric = previous.metric if previous else "overall"
        competency = previous.competency if previous else None

    return ReportQueryIntent(
        limit=limit,
        metric=metric,
        competency=competency,
        role=role,
    )


def _get_session(session_id: str) -> dict[str, Any]:
    session = REPORT_QUERY_SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Report-query voice session not found")
    return session


@router.post("/sessions/start")
def start_report_query_session(body: StartReportQueryRequest):
    session_id = str(uuid.uuid4())
    try:
        agora_agent_id, agora_session = start_session_agent(
            REPORT_AGENT,
            channel=body.channel,
            remote_uid=body.remote_uid,
            language=body.language,
            patient_turn_taking=True,
            agent_uid=REPORT_AGENT_UID,
            remote_uids=[body.remote_uid],
            idle_timeout=900,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Agora report analyst could not start: {exc}") from exc

    REPORT_QUERY_SESSIONS[session_id] = {
        "agora_session": agora_session,
        "last_query": None,
    }
    return {
        "session_id": session_id,
        "agora_agent_id": agora_agent_id,
        "agent_uid": REPORT_AGENT_UID,
    }


@router.post("/interpret", response_model=ReportQueryIntent)
def interpret_report_query(body: InterpretRequest):
    return parse_report_query(body.text)


@router.post("/sessions/{session_id}/interpret", response_model=ReportQueryIntent)
def interpret_session_report_query(session_id: str, body: InterpretRequest):
    session = _get_session(session_id)
    intent = parse_report_query(body.text, session["last_query"])
    session["last_query"] = intent
    return intent


@router.post("/sessions/{session_id}/respond")
def speak_report_query_results(session_id: str, body: SpeakResultsRequest):
    session = _get_session(session_id)
    descriptor = (
        "overall score"
        if body.query.metric == "overall"
        else f"{body.query.competency or 'requested competency'} score"
    )
    role = f" for the {body.query.role} role" if body.query.role else ""
    if body.candidates:
        rows = "; ".join(
            f"rank {index}: {candidate.candidate_name}, {round((candidate.score or 0) * 100)} out of 100"
            for index, candidate in enumerate(body.candidates, start=1)
        )
        result_text = f"{rows}."
    else:
        result_text = "No matching completed candidate reports were found."
    inject_followup(
        session["agora_session"],
        (
            f"VERIFIED REPORT RESULTS. The user requested the top {body.query.limit} by {descriptor}{role}. "
            f"{result_text} Speak only these verified results in a concise, natural response. "
            "Do not add candidates or alter scores."
        ),
    )
    return {"status": "speaking"}


@router.post("/sessions/{session_id}/end")
def end_report_query_session(session_id: str):
    session = REPORT_QUERY_SESSIONS.pop(session_id, None)
    if session is None:
        return {"status": "already_ended"}
    stop = getattr(session["agora_session"], "stop", None)
    if callable(stop):
        try:
            stop()
        except Exception as exc:
            print(f"[report query] failed to stop session {session_id}: {exc}")
    return {"status": "ended"}
