from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
from typing import Any, Literal
import uuid

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.dsa.followups import followup_for, outcome_briefing, submission_trigger
from app.dsa.code_runner import UnsafeCodeError, run_candidate_code
from app.dsa.question_bank import QUESTION_BANK, public_question
from app.job_panels.registry import get_job_panel, list_job_panels
from app.orchestrator.conversation import untrusted_quote
from app.orchestrator.agent_launcher import inject_followup, resolve_panel_voices, start_session_agent
from app.schemas.job_panel import JobPanelPreset, JobPanelSummary


router = APIRouter(prefix="/job-panels", tags=["by-job-panels"])
JOB_PANEL_SESSIONS: dict[str, dict[str, Any]] = {}

# All three interviewers are real RTC participants. They subscribe to this
# deliberately unused UID instead of directly reacting to candidate audio.
# Final candidate transcripts are relayed to only the agent holding the floor.
PANEL_RELAY_UID = "900000001"
PANEL_AGENT_UIDS = {
    "sde-dsa": "11",
    "sde-system-design": "12",
    "sde-hr": "13",
}


class StartJobPanelRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    candidate_name: str = Field(default="", max_length=120)
    difficulty_min: int = Field(default=2, ge=1, le=5)
    difficulty_max: int = Field(default=4, ge=1, le=5)


class PanelParticipant(BaseModel):
    agent_id: str
    agent_uid: str
    agora_agent_id: str
    name: str
    role: str
    color: str
    active: bool


class StartJobPanelResponse(BaseModel):
    session_id: str
    preset_slug: str
    preset_version: int
    phase: str
    active_agent_id: str | None
    participants: list[PanelParticipant]
    transcript_relay_required: bool = True


class CandidateUtteranceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class RunCodeRequest(BaseModel):
    code: str = Field(max_length=100_000)
    language: Literal["python"] = "python"


class SubmitCodeRequest(RunCodeRequest):
    trigger: Literal["submitted", "expired"] = "submitted"


@router.get("", response_model=list[JobPanelSummary])
def catalog_job_panels():
    return list_job_panels()


@router.get("/{slug}", response_model=JobPanelPreset)
def get_job_panel_detail(slug: str):
    preset = get_job_panel(slug)
    if preset is None:
        raise HTTPException(status_code=404, detail="Job panel preset not found")
    return preset


# The purpose-built job-panel session runtime that used to live here has been
# removed. Job panels run on the enterprise orchestrator - a preset's `panel`
# field is already a complete Panel, so `/sessions/*` runs it with the host,
# shared cross-role context, adaptive difficulty and the standard report. This
# module now only serves the catalogue.
