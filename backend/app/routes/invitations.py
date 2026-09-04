"""The candidate-facing side of a published interview.

Replaces the shared-code endpoints that used to live in `published_panels.py`.
Under those, one link and one 8-character code let anyone start the interview,
any number of times, under any name they typed. Here the link carries a token
issued to one specific candidate, and the address it was issued to has to be
confirmed before anything starts.

Four endpoints, in the order a candidate hits them:

    GET  /invitations/{token}                 what interview is this, and which
                                              address should I confirm
    POST /invitations/{token}/verify          confirm the address, receive the
                                              panel (no attempt consumed)
    POST /invitations/{token}/sessions/start  consume an attempt, start
    POST /invitations/{token}/report          finish, store, close the invite

Every one of them re-runs the full check. `verify` returning 200 is not a
credential the later calls trust: it exists only so a typo does not cost the
candidate an attempt.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import supabase_rest
from app.invitations import store as invitations
from app.orchestrator.report import build_report
from app.reports.store import persist_published_report
from app.panels_store import load_panel_config
from app.routes.sessions import SESSIONS, StartSessionRequest, start_session
from app.schemas.panel import Panel
from app.schemas.report import InterviewReport


router = APIRouter(prefix="/invitations", tags=["candidate-invitations"])


class VerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class StartInvitedSessionRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    candidate_ref: str = Field(default="", max_length=120)


class FinalizeInvitedReportRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class InvitationSummary(BaseModel):
    """What an unverified visitor is allowed to learn from a token alone."""
    panel_name: str
    role: str
    language: str
    candidate_name: str
    email_hint: str                 # masked; never the full address
    attempts_used: int
    attempts_allowed: int
    expires_at: str | None


class InvitationPanelView(BaseModel):
    panel_name: str
    role: str
    language: str
    candidate_name: str
    candidate_email: str
    agents: list[dict[str, Any]]


class FinalizeInvitedReportResponse(BaseModel):
    report_id: str | None
    stored: bool
    store_error: str | None = None
    report: InterviewReport


def _panel(invitation: dict[str, Any]) -> Panel:
    return load_panel_config(str(invitation["panel_id"]))


def _agent_views(panel: Panel) -> list[dict[str, Any]]:
    # System prompts, scoring rules, and the question bank stay on the server.
    # A confirmed invitation is permission to sit the interview, not permission
    # to download it beforehand.
    return [
        {
            "id": agent.id,
            "identity": agent.identity.model_dump(),
            "turnTaking": agent.turnTaking.model_dump(),
        }
        for agent in panel.agents
    ]


@router.get("/{token}", response_model=InvitationSummary)
def invitation_summary(token: str):
    """Enough to render the confirmation gate, and nothing more.

    Notably not the candidate's email address: someone holding a forwarded link
    must not be handed the second half of the credential by the page that asks
    them for it.
    """
    invitation = invitations.load_invitation(token)
    invitations.assert_usable(invitation)
    panel = _panel(invitation)
    return InvitationSummary(
        panel_name=panel.projectName,
        role="Candidate interview",
        language=panel.language,
        candidate_name=str(invitation.get("candidate_name") or ""),
        email_hint=invitations.mask_email(str(invitation.get("email") or "")),
        attempts_used=int(invitation.get("attempts") or 0),
        attempts_allowed=int(invitation.get("max_attempts") or 1),
        expires_at=invitation.get("expires_at"),
    )


@router.post("/{token}/verify", response_model=InvitationPanelView)
def verify_invitation(token: str, body: VerifyRequest):
    invitation = invitations.authorize(token, body.email)
    panel = _panel(invitation)
    return InvitationPanelView(
        panel_name=panel.projectName,
        role="Candidate interview",
        language=panel.language,
        candidate_name=str(invitation.get("candidate_name") or ""),
        candidate_email=str(invitation.get("email") or ""),
        agents=_agent_views(panel),
    )


@router.post("/{token}/sessions/start")
def start_invited_session(token: str, body: StartInvitedSessionRequest):
    invitation = invitations.authorize(token, body.email)
    panel = _panel(invitation)

    response = start_session(StartSessionRequest(
        panel=panel,
        channel=body.channel,
        remote_uid=body.remote_uid,
        # The name comes off the invitation, not from a field the candidate can
        # fill in. A report that says who the recruiter invited is worth more
        # than one that says whatever the person at the keyboard typed.
        candidate_name=str(invitation.get("candidate_name") or ""),
        candidate_ref=body.candidate_ref,
    ))

    invitations.mark_started(invitation, response.session_id)
    return response


@router.post("/{token}/report", response_model=FinalizeInvitedReportResponse)
def finalize_invited_report(token: str, body: FinalizeInvitedReportRequest):
    """Build the report, store it against the panel owner, close the invitation.

    Storage failing does not fail the request: the session lives in this
    process's memory and is gone on the next restart, so a report that exists
    but could not be saved is still worth handing back. The candidate sees their
    result and the response says plainly that it was not stored.
    """
    invitation = invitations.authorize(token, body.email)

    session_data = SESSIONS.get(invitation.get("session_id") or "")
    if session_data is None:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Reports live in memory and are lost when the "
                   "backend restarts, so finish the interview before the server cycles.",
        )

    report = build_report(session_data["state"], session_data["panel"])

    if not supabase_rest.is_configured():
        return FinalizeInvitedReportResponse(
            report_id=None, stored=False, report=report,
            store_error="Supabase is not configured on the backend, so this report was not stored.",
        )

    try:
        report_id = persist_published_report(
            report,
            str(invitation["panel_id"]),
            role_name=None,
            candidate_email=str(invitation.get("email") or ""),
        )
    except HTTPException as exc:
        return FinalizeInvitedReportResponse(
            report_id=None, stored=False, store_error=str(exc.detail), report=report,
        )

    invitations.mark_completed(str(invitation["id"]), report_id)
    return FinalizeInvitedReportResponse(report_id=report_id, stored=True, report=report)
