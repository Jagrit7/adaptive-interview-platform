from datetime import datetime, timedelta, timezone
from typing import Any, Literal
import re
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.dsa.code_runner import UnsafeCodeError, run_candidate_code
from app.dsa.evaluator import VerbalEvaluation, evaluate_verbal_answer
from app.dsa.preset import DSA_PANEL
from app.dsa.question_bank import QUESTION_BANK, public_question
from app.orchestrator.agent_launcher import AGENT_UID, inject_followup, start_session_agent


router = APIRouter(prefix="/dsa/sessions", tags=["individual-dsa"])
DSA_SESSIONS: dict[str, dict] = {}


class StartDsaSessionRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    mode: Literal["topic_exact", "topic_subtree", "bank", "blueprint"] = "bank"
    topic_slug: str | None = None
    blueprint_slug: str | None = None
    difficulty_min: int = Field(default=1, ge=1, le=5)
    difficulty_max: int = Field(default=3, ge=1, le=5)


class StartDsaSessionResponse(BaseModel):
    session_id: str
    agora_agent_id: str
    agent_uid: str
    agent_id: str
    phase: Literal["introduction"]


class CodingQuestionResponse(BaseModel):
    session_id: str
    phase: Literal["coding"]
    deadline: str
    question: dict


class RunCodeRequest(BaseModel):
    code: str = Field(max_length=100_000)
    language: Literal["python"] = "python"


class TestCaseResult(BaseModel):
    id: str
    label: str
    input: str
    expected: str
    actual: str | None = None
    passed: bool
    error: str | None = None


class TestRunResponse(BaseModel):
    passed: int
    total: int
    runtime_error: str | None = None
    results: list[TestCaseResult] = Field(default_factory=list)


class SubmitCodeRequest(RunCodeRequest):
    trigger: Literal["submitted", "expired"] = "submitted"


class FollowUpResponse(BaseModel):
    session_id: str
    phase: Literal["follow_up"]
    trigger: Literal["submitted", "expired"]
    follow_up: str
    test_run: TestRunResponse


class TranscriptItem(BaseModel):
    who: Literal["agent", "candidate"]
    text: str = Field(min_length=1, max_length=10_000)


class FinishDsaSessionRequest(BaseModel):
    transcript: list[TranscriptItem] = Field(default_factory=list, max_length=100)
    verbal_answer: str = Field(default="", max_length=20_000)
    candidate_name: str = Field(default="", max_length=120)


class DsaReportResponse(BaseModel):
    session_id: str
    phase: Literal["finished"]
    report: dict[str, Any]


class PhaseResponse(BaseModel):
    session_id: str
    phase: Literal["ended"]


def _get_session(session_id: str) -> dict:
    session_data = DSA_SESSIONS.get(session_id)
    if session_data is None:
        raise HTTPException(status_code=404, detail="DSA session not found")
    return session_data


def _require_phase(session_data: dict, expected: str) -> None:
    if session_data["phase"] != expected:
        raise HTTPException(
            status_code=409,
            detail=f"Session is in {session_data['phase']!r}, expected {expected!r}",
        )


def _execute(code: str, question: dict[str, Any], include_hidden: bool) -> dict[str, Any]:
    test_cases = [
        case for case in question["test_cases"]
        if include_hidden or case["visibility"] == "public"
    ]
    try:
        result = run_candidate_code(
            code, test_cases, question["function_name"], question["parameter_names"],
            question["validator_key"],
        )
        if include_hidden:
            hidden_ids = {str(case["id"]) for case in test_cases if case["visibility"] == "hidden"}
            for item in result["results"]:
                if item["id"] in hidden_ids:
                    item.update({"label": "Hidden test", "input": "Hidden", "expected": "Hidden", "actual": None})
        return result
    except UnsafeCodeError as exc:
        return {
            "passed": 0,
            "total": len(test_cases),
            "runtime_error": str(exc),
            "results": [],
        }


def _candidate_name(written: str, transcript: list[TranscriptItem]) -> str:
    if written.strip():
        return written.strip()
    first = next((item.text for item in transcript if item.who == "candidate"), "")
    cleaned = re.sub(
        r"^(?:hi[,!]?\s*)?(?:my name is|i am|i'm|you can call me|call me)\s+",
        "",
        first.strip(),
        flags=re.IGNORECASE,
    ).strip(" .,!?")
    return cleaned[:80] or "Individual candidate"


def _is_control_instruction(text: str) -> bool:
    lowered = text.strip().lower()
    return lowered.startswith("the coding period is over. ask exactly this one verbal follow-up")


def _band(score: float) -> str:
    if score >= 0.85:
        return "Strong"
    if score >= 0.70:
        return "Solid"
    if score >= 0.50:
        return "Developing"
    return "Needs work"


def _build_report(session_id: str, session_data: dict) -> dict[str, Any]:
    test_run = session_data["test_run"]
    evaluation: VerbalEvaluation = session_data["verbal_evaluation"]
    code_score = test_run["passed"] / test_run["total"] if test_run["total"] else 0.0
    overall = (code_score * 0.45) + (evaluation.complexity_score * 0.30) + (evaluation.clarity_score * 0.25)
    submitted_at: datetime | None = session_data.get("submitted_at")
    deadline: datetime | None = session_data.get("deadline")
    seconds_used = None
    if submitted_at and deadline:
        started_coding = deadline - timedelta(seconds=session_data["question"]["duration_seconds"])
        seconds_used = max(0, round((submitted_at - started_coding).total_seconds()))

    return {
        "session_id": session_id,
        "candidate_name": session_data["candidate_name"],
        "panel_name": DSA_PANEL.projectName,
        "question_id": str(session_data["question"]["question_id"]),
        "question_version_id": str(session_data["question"]["question_version_id"]),
        "question_title": session_data["question"]["title"],
        "selection": session_data["selection_metadata"],
        "language": session_data.get("language", "python"),
        "started_at": session_data["created_at"].isoformat(),
        "finished_at": session_data["finished_at"].isoformat(),
        "submission_trigger": session_data["trigger"],
        "seconds_used": seconds_used,
        "overall_score": round(overall, 3),
        "band": _band(overall),
        "competencies": [
            {"name": "DSA fundamentals", "score": round(code_score, 3), "weight": 45},
            {"name": "Complexity analysis", "score": round(evaluation.complexity_score, 3), "weight": 30},
            {"name": "Reasoning clarity", "score": round(evaluation.clarity_score, 3), "weight": 25},
        ],
        "code": session_data["code"],
        "test_run": test_run,
        "verbal_question": session_data["verbal_follow_up"],
        "verbal_answer": session_data["verbal_answer"],
        "feedback": evaluation.feedback,
        "strengths": evaluation.strengths,
        "improvements": evaluation.improvements,
        "transcript": [item.model_dump() for item in session_data["transcript"]],
    }


@router.post("/start", response_model=StartDsaSessionResponse)
def start_dsa_session(body: StartDsaSessionRequest, authorization: str | None = Header(default=None)):
    if body.difficulty_min > body.difficulty_max:
        raise HTTPException(status_code=422, detail="difficulty_min cannot exceed difficulty_max")
    try:
        user_id = QUESTION_BANK.user_id_from_token(authorization)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not verify your Supabase session") from exc
    agent = DSA_PANEL.agents[0]
    try:
        agora_agent_id, agora_session = start_session_agent(
            agent, body.channel, body.remote_uid, language=DSA_PANEL.language,
            patient_turn_taking=True,
            listen_to_all_remote_users=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The voice interviewer could not connect to Agora. Please try again.",
        ) from exc

    session_id = str(uuid.uuid4())
    DSA_SESSIONS[session_id] = {
        "phase": "introduction",
        "agora_session": agora_session,
        "agora_agent_id": agora_agent_id,
        "channel": body.channel,
        "remote_uid": body.remote_uid,
        "deadline": None,
        "code": None,
        "trigger": None,
        "test_run": None,
        "report": None,
        "created_at": datetime.now(timezone.utc),
        "selection_request": body.model_dump(exclude={"channel", "remote_uid"}),
        "selection_metadata": None,
        "question": None,
        "user_id": user_id,
    }
    return StartDsaSessionResponse(
        session_id=session_id, agora_agent_id=agora_agent_id, agent_uid=AGENT_UID,
        agent_id=agent.id, phase="introduction",
    )


@router.post("/{session_id}/begin-coding", response_model=CodingQuestionResponse)
def begin_coding(session_id: str):
    session_data = _get_session(session_id)
    if session_data["phase"] == "coding" and session_data.get("question"):
        return CodingQuestionResponse(
            session_id=session_id, phase="coding", deadline=session_data["deadline"].isoformat(),
            question=public_question(session_data["question"]),
        )
    _require_phase(session_data, "introduction")
    try:
        question, selection_metadata = QUESTION_BANK.select(
            session_id=session_id,
            recent_question_ids=QUESTION_BANK.recent_question_ids(session_data.get("user_id")),
            **session_data["selection_request"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    deadline = datetime.now(timezone.utc) + timedelta(seconds=question["duration_seconds"])
    session_data["phase"] = "coding"
    session_data["deadline"] = deadline
    session_data["question"] = question
    session_data["selection_metadata"] = selection_metadata
    session_data["verbal_follow_up"] = question["followups"][0]["prompt"]
    try:
        QUESTION_BANK.record_attempt(
            session_id=session_id, user_id=session_data.get("user_id"),
            question=question, metadata=selection_metadata,
        )
        QUESTION_BANK.update_attempt(session_id, {"started_at": datetime.now(timezone.utc).isoformat()})
    except Exception as exc:
        session_data["phase"] = "introduction"
        raise HTTPException(status_code=502, detail="Could not reserve the selected question") from exc
    inject_followup(
        session_data["agora_session"],
        "Say exactly this, naturally, and say nothing after it: "
        f'"Your coding question is now on screen. You have {max(1, question["duration_seconds"] // 60)} minutes to solve it. '
        'Submit whatever you have when you are ready. Best of luck."',
    )
    return CodingQuestionResponse(
        session_id=session_id, phase="coding", deadline=deadline.isoformat(), question=public_question(question),
    )


@router.post("/{session_id}/run", response_model=TestRunResponse)
def run_code(session_id: str, body: RunCodeRequest):
    session_data = _get_session(session_id)
    _require_phase(session_data, "coding")
    result = _execute(body.code, session_data["question"], include_hidden=False)
    session_data["last_test_run"] = result
    return TestRunResponse(**result)


@router.post("/{session_id}/submit", response_model=FollowUpResponse)
def submit_code(session_id: str, body: SubmitCodeRequest):
    session_data = _get_session(session_id)
    _require_phase(session_data, "coding")
    now = datetime.now(timezone.utc)
    deadline: datetime = session_data["deadline"]
    trigger: Literal["submitted", "expired"] = (
        "expired" if now >= deadline or body.trigger == "expired" else "submitted"
    )
    test_run = _execute(body.code, session_data["question"], include_hidden=True)
    session_data.update({
        "code": body.code, "language": body.language, "trigger": trigger,
        "submitted_at": now, "phase": "follow_up", "test_run": test_run,
    })
    QUESTION_BANK.update_attempt(session_id, {
        "submitted_at": now.isoformat(), "submission_trigger": trigger,
        "test_summary": {"passed": test_run["passed"], "total": test_run["total"]},
    })
    inject_followup(
        session_data["agora_session"],
        "The coding period is over. Ask exactly this one verbal follow-up. Listen to the "
        "candidate's complete answer, then acknowledge one correct point, correct one important "
        f"issue if necessary, and thank them without asking another question: {session_data['verbal_follow_up']}",
    )
    return FollowUpResponse(
        session_id=session_id, phase="follow_up", trigger=trigger,
        follow_up=session_data["verbal_follow_up"], test_run=TestRunResponse(**test_run),
    )


@router.get("/catalog", response_model=dict[str, Any])
def get_dsa_catalog():
    return QUESTION_BANK.catalog()


@router.post("/{session_id}/finish", response_model=DsaReportResponse)
async def finish_dsa_session(session_id: str, body: FinishDsaSessionRequest):
    session_data = _get_session(session_id)
    _require_phase(session_data, "follow_up")
    if not body.verbal_answer.strip() or _is_control_instruction(body.verbal_answer):
        raise HTTPException(
            status_code=422,
            detail="No candidate verbal answer was captured yet. Keep the microphone on and answer Ari before finishing.",
        )
    test_run = session_data["test_run"]
    try:
        evaluation = await evaluate_verbal_answer(
            session_data["code"], body.verbal_answer, test_run["passed"], test_run["total"],
            question_title=session_data["question"]["title"],
            question_prompt=session_data["question"]["prompt"],
            expected_time=session_data["question"]["expected_time"],
            expected_space=session_data["question"]["expected_space"],
            follow_up=session_data["verbal_follow_up"],
        )
    except Exception:
        evaluation = VerbalEvaluation(
            complexity_score=0,
            clarity_score=0,
            feedback="The verbal grader was temporarily unavailable. Code-test results are still included.",
            improvements=["Retry report generation when the grading service is available."],
        )
    session_data.update({
        "phase": "finished", "finished_at": datetime.now(timezone.utc),
        "candidate_name": _candidate_name(body.candidate_name, body.transcript),
        "transcript": body.transcript, "verbal_answer": body.verbal_answer,
        "verbal_evaluation": evaluation,
    })
    session_data["report"] = _build_report(session_id, session_data)
    QUESTION_BANK.update_attempt(session_id, {"finished_at": session_data["finished_at"].isoformat()})
    return DsaReportResponse(session_id=session_id, phase="finished", report=session_data["report"])


@router.get("/{session_id}/report", response_model=dict[str, Any])
def get_dsa_report(session_id: str):
    session_data = _get_session(session_id)
    if not session_data.get("report"):
        raise HTTPException(status_code=409, detail="The DSA report is not ready yet")
    return session_data["report"]


@router.post("/{session_id}/end", response_model=PhaseResponse)
def end_dsa_session(session_id: str):
    session_data = _get_session(session_id)
    session_data["phase"] = "ended"
    session_data["ended_at"] = datetime.now(timezone.utc)
    stop = getattr(session_data["agora_session"], "stop", None)
    if callable(stop):
        try:
            stop()
        except Exception as exc:
            print(f"[dsa session {session_id[:8]}] Agora stop failed: {exc}")
    return PhaseResponse(session_id=session_id, phase="ended")
