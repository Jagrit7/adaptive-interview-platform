import hmac
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app import supabase_rest
from app.orchestrator.report import build_report
from app.reports.store import persist_published_report
from app.routes.sessions import SESSIONS, StartSessionRequest, start_session
from app.schemas.panel import Panel
from app.schemas.report import InterviewReport


router = APIRouter(prefix="/published-panels", tags=["published-interviews"])


class StartPublishedPanelRequest(BaseModel):
    invite: str = Field(min_length=4, max_length=128)
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    candidate_name: str = Field(default="", max_length=120)
    candidate_ref: str = Field(default="", max_length=120)


class FinalizePublishedReportRequest(BaseModel):
    invite: str = Field(min_length=4, max_length=128)


class FinalizePublishedReportResponse(BaseModel):
    report_id: str | None            # null when the report was built but not stored
    stored: bool
    store_error: str | None = None
    report: InterviewReport


def _load_published_panel(panel_id: str, invite: str) -> Panel:
    rows: list[dict[str, Any]] = supabase_rest.select(
        "panels",
        {"select": "config", "id": f"eq.{panel_id}", "limit": "1"},
        "The published panel could not be loaded from Supabase.",
    )

    if not rows:
        raise HTTPException(status_code=404, detail="This interview invitation is invalid or no longer available.")
    config = rows[0].get("config") or {}
    enterprise = config.get("enterprise") or {}
    expected = str(enterprise.get("publicCode") or "")
    if enterprise.get("status") != "published" or not expected or not hmac.compare_digest(expected, invite):
        raise HTTPException(status_code=404, detail="This interview invitation is invalid or no longer available.")
    try:
        return Panel.model_validate(config)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The published panel configuration is invalid.") from exc


@router.get("/{panel_id}")
def published_panel_metadata(panel_id: str, invite: str = Query(min_length=4, max_length=128)):
    panel = _load_published_panel(panel_id, invite)
    # Do not send system prompts, scoring rules, or the question bank to the
    # candidate before the session. The invitation is a capability to start the
    # panel, not permission to download its private interview content.
    return {
        "projectName": panel.projectName,
        "language": panel.language,
        "role": "Candidate interview",
        "agents": [
            {
                "id": agent.id,
                "identity": agent.identity.model_dump(),
                "turnTaking": agent.turnTaking.model_dump(),
            }
            for agent in panel.agents
        ],
    }


@router.post("/{panel_id}/sessions/start")
def start_published_panel(panel_id: str, body: StartPublishedPanelRequest):
    panel = _load_published_panel(panel_id, body.invite)
    return start_session(StartSessionRequest(
        panel=panel,
        channel=body.channel,
        remote_uid=body.remote_uid,
        candidate_name=body.candidate_name,
        candidate_ref=body.candidate_ref,
    ))


@router.post("/{panel_id}/sessions/{session_id}/report", response_model=FinalizePublishedReportResponse)
def finalize_published_report(panel_id: str, session_id: str, body: FinalizePublishedReportRequest):
    """Build the candidate's report and store it against the panel's owner.

    The candidate is anonymous, so the browser cannot do this write: it has no
    Supabase session, and `interview_reports` is gated on `auth.uid() = user_id`.
    The invite is re-checked here rather than trusted from the start call, so a
    session id on its own is not enough to write a row.

    Storage failing does not fail the request. The session lives in this
    process's memory and is gone on the next restart, so a report that exists
    but could not be saved is still worth handing back - the candidate sees
    their result, and the response says plainly that it was not stored.
    """
    _load_published_panel(panel_id, body.invite)

    session_data = SESSIONS.get(session_id)
    if session_data is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Reports live in memory and are lost when the "
                   "backend restarts, so finalize the report before ending the session.",
        )

    report = build_report(session_data["state"], session_data["panel"])

    if not supabase_rest.is_configured():
        return FinalizePublishedReportResponse(
            report_id=None,
            stored=False,
            store_error="Supabase is not configured on the backend, so this report was not stored.",
            report=report,
        )

    try:
        report_id = persist_published_report(report, panel_id, role_name=None)
    except HTTPException as exc:
        return FinalizePublishedReportResponse(
            report_id=None, stored=False, store_error=str(exc.detail), report=report,
        )
    return FinalizePublishedReportResponse(report_id=report_id, stored=True, report=report)
