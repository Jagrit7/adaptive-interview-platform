from datetime import datetime, timedelta, timezone
import os
from typing import Any, Literal
import re
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.dsa.followups import followup_for, outcome_briefing, submission_trigger
from app.routes.sessions import BREAK_MAX_COUNT, BREAK_SECONDS
from app.dsa.code_runner import UnsafeCodeError, run_candidate_code
from app.dsa.evaluator import VerbalEvaluation, evaluate_verbal_answer
from app.dsa.preset import DSA_PANEL
from app.dsa.question_bank import (
    DEFAULT_FOLLOWUP,
    DEFAULT_FOLLOWUPS_BY_TRIGGER,
    QUESTION_BANK,
    public_question,
)
from app.orchestrator.agent_launcher import AGENT_UID, inject_followup, start_session_agent


router = APIRouter(prefix="/dsa/sessions", tags=["individual-dsa"])
DSA_SESSIONS: dict[str, dict] = {}

# Same lifetime problem as the panel store: nothing removed entries, so every
# coding round ever started stayed in memory with its question, tests and
# transcript for the life of the process.
DSA_SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "10800"))  # 3 hours


def _sweep_expired_dsa_sessions() -> None:
    cutoff = datetime.now(timezone.utc).timestamp() - DSA_SESSION_TTL_SECONDS
    for sid in [s for s, data in DSA_SESSIONS.items() if data.get("touched_at", 0) < cutoff]:
        data = DSA_SESSIONS.pop(sid, None)
        agora = (data or {}).get("agora_session")
        if agora is not None:
            try:
                agora.stop()
            except Exception:
                pass  # teardown is best-effort


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
    # The candidate said outright that they cannot answer. Distinct from an
    # empty submission, which might just be a candidate who ran out of time.
    gave_up: bool = False


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
    if session_data is not None:
        session_data["touched_at"] = datetime.now(timezone.utc).timestamp()
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
    if session_data.get("code_outcome") == "gave_up":
        # A declared skip scores zero across the board. Letting the verbal
        # component still earn marks would mean a candidate who says "I don't
        # know" and then talks well outscores one who attempted the problem and
        # partly solved it.
        code_score = 0.0
        evaluation = VerbalEvaluation(
            complexity_score=0.0, clarity_score=0.0,
            feedback="The candidate chose to skip this question.",
            strengths=[], improvements=["Attempt the problem, even partially, before moving on."],
        )
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
    _sweep_expired_dsa_sessions()
    DSA_SESSIONS[session_id] = {
        "touched_at": datetime.now(timezone.utc).timestamp(),
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
        "breaks_taken": 0,
        "break_until": None,
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
        recent = QUESTION_BANK.recent_question_ids(session_data.get("user_id"))
    except Exception as exc:
        # Avoiding a recently-seen question is a nicety; failing the interview
        # because the list could not be fetched is not. Worth noting that the
        # enclosing except below only catches ValueError, so this network error
        # used to escape it entirely.
        print(f"[dsa] recent-question lookup unavailable, allowing repeats: {exc}")
        recent = set()
    try:
        question, selection_metadata = QUESTION_BANK.select(
            session_id=session_id,
            recent_question_ids=recent,
            **session_data["selection_request"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    deadline = datetime.now(timezone.utc) + timedelta(seconds=question["duration_seconds"])
    session_data["phase"] = "coding"
    session_data["deadline"] = deadline
    session_data["question"] = question
    session_data["selection_metadata"] = selection_metadata
    # Deliberately not chosen here any more. The follow-up now depends on what
    # the candidate submits, which is not known until they submit; this is only
    # the fallback for a session that somehow reaches scoring without one.
    session_data["verbal_follow_up"] = followup_for(question, "always")
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
    question = session_data["question"]
    submission_trigger_key = submission_trigger(
        body.code, question.get("starter_code", ""), test_run, gave_up=body.gave_up,
    )
    follow_up = followup_for(question, submission_trigger_key)
    session_data.update({
        "code": body.code, "language": body.language, "trigger": trigger,
        "submitted_at": now, "phase": "follow_up", "test_run": test_run,
        "verbal_follow_up": follow_up, "code_outcome": submission_trigger_key,
    })
    # Best-effort: this is exposure bookkeeping, and losing it must not lose the
    # submission the candidate just made. The same applies at finish below.
    try:
        QUESTION_BANK.update_attempt(session_id, {
            "submitted_at": now.isoformat(), "submission_trigger": trigger,
            "test_summary": {"passed": test_run["passed"], "total": test_run["total"]},
        })
    except Exception as exc:
        print(f"[dsa {session_id[:8]}] attempt telemetry not recorded: {exc}")
    # Tell the agent what it is looking at. Without this it praised solutions
    # that failed every test, because the only thing it knew was the question.
    outcome = outcome_briefing(submission_trigger_key, test_run)

    inject_followup(
        session_data["agora_session"],
        "The coding period is over. " + outcome + " Ask exactly this one verbal follow-up. Listen "
        "to the candidate's complete answer, then acknowledge one correct point, correct one "
        "important issue if necessary, and thank them without asking another question: "
        f"{follow_up}",
    )
    return FollowUpResponse(
        session_id=session_id, phase="follow_up", trigger=trigger,
        follow_up=follow_up, test_run=TestRunResponse(**test_run),
    )


class DsaBreakRequest(BaseModel):
    action: Literal["start", "end"]


class DsaSilenceRequest(BaseModel):
    stage: Literal["nudge", "repeat"]


def _dsa_break_seconds_remaining(session_data: dict) -> int:
    """Seconds left on the current break; 0 when not on one."""
    until = session_data.get("break_until")
    if not until:
        return 0
    return max(0, int((until - datetime.now(timezone.utc)).total_seconds()))


@router.post("/{session_id}/break")
def dsa_break(session_id: str, body: DsaBreakRequest):
    """The same bounded pause the panel interview offers.

    Kept deliberately identical in limits and wording to the panel version in
    routes/sessions.py, because a candidate should not find that a practice
    interview and a real one behave differently.
    """
    session_data = _get_session(session_id)
    agora_session = session_data["agora_session"]
    if body.action == "start":
        if _dsa_break_seconds_remaining(session_data) > 0:
            raise HTTPException(status_code=409, detail="A break is already running.")
        if session_data["breaks_taken"] >= BREAK_MAX_COUNT:
            raise HTTPException(status_code=409, detail="You have used all your breaks.")
        session_data["breaks_taken"] += 1
        session_data["break_until"] = datetime.now(timezone.utc) + timedelta(seconds=BREAK_SECONDS)
        # A coding deadline must not keep running while the interview is paused,
        # or the break silently costs the candidate their remaining time.
        if session_data.get("deadline"):
            session_data["paused_deadline_left"] = max(
                0, (session_data["deadline"] - datetime.now(timezone.utc)).total_seconds())
        inject_followup(
            agora_session,
            f"The candidate is taking a short break of about {BREAK_SECONDS // 60} minutes. In one "
            "warm sentence tell them to take their time and that you will pick up exactly where "
            "you left off. Do not ask anything and do not continue the interview.",
            replace_pending=True,
        )
    else:
        if not session_data.get("break_until"):
            raise HTTPException(status_code=409, detail="No break is running.")
        session_data["break_until"] = None
        left = session_data.pop("paused_deadline_left", None)
        if left is not None:
            session_data["deadline"] = datetime.now(timezone.utc) + timedelta(seconds=left)
        inject_followup(
            agora_session,
            "The candidate is back from their break. Welcome them back in one short sentence and "
            "carry on from exactly where you left off.",
            replace_pending=True,
        )
    return {
        "breaks_remaining": BREAK_MAX_COUNT - session_data["breaks_taken"],
        "break_seconds_remaining": _dsa_break_seconds_remaining(session_data),
        "deadline": (session_data["deadline"].isoformat()
                     if session_data.get("deadline") else None),
    }


@router.post("/{session_id}/silence-prompt")
def dsa_silence_prompt(session_id: str, body: DsaSilenceRequest):
    """Say something when the candidate has gone quiet on a spoken question."""
    session_data = _get_session(session_id)
    if _dsa_break_seconds_remaining(session_data) > 0:
        raise HTTPException(status_code=409, detail="The interview is paused for a break.")
    if session_data["phase"] == "coding":
        # They are typing, not stalling. The coding round has its own clock.
        raise HTTPException(status_code=409, detail="The candidate is working on the task.")
    inject_followup(
        session_data["agora_session"],
        (
            "The candidate has gone quiet for a while and may not have caught the question. Ask it "
            "again, clearly and a little more slowly. You may rephrase for clarity but must not "
            "change what is being asked, add a hint, or reveal any part of the answer."
            if body.stage == "repeat" else
            "The candidate has been silent for a few seconds. In one short, warm sentence, let them "
            "know there is no rush and offer to repeat the question if it would help. Do not answer "
            "it, do not hint, and do not move on to anything else."
        ),
        replace_pending=True,
    )
    print(f"[silence {session_id[:8]}] dsa stage={body.stage}")
    return {"stage": body.stage}


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
    try:
        QUESTION_BANK.update_attempt(session_id, {"finished_at": session_data["finished_at"].isoformat()})
    except Exception as exc:
        print(f"[dsa {session_id[:8]}] finish telemetry not recorded: {exc}")
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
    # The report is fetched before /end, so nothing still needs this entry.
    DSA_SESSIONS.pop(session_id, None)
    return PhaseResponse(session_id=session_id, phase="ended")
