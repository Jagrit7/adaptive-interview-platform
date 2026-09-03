import hmac
import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.routes.sessions import StartSessionRequest, start_session
from app.schemas.panel import Panel


router = APIRouter(prefix="/published-panels", tags=["published-interviews"])


class StartPublishedPanelRequest(BaseModel):
    invite: str = Field(min_length=4, max_length=128)
    channel: str = Field(min_length=1, max_length=128)
    remote_uid: str = Field(min_length=1, max_length=64)
    candidate_name: str = Field(default="", max_length=120)
    candidate_ref: str = Field(default="", max_length=120)


def _service_credentials() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="Published interviews require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.",
        )
    return url, key


def _load_published_panel(panel_id: str, invite: str) -> Panel:
    url, key = _service_credentials()
    query = urlencode({"select": "config", "id": f"eq.{panel_id}", "limit": 1})
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    request = Request(f"{url}/rest/v1/panels?{query}", headers=headers)
    try:
        with urlopen(request, timeout=10) as response:
            rows: list[dict[str, Any]] = json.loads(response.read() or b"[]")
    except (HTTPError, URLError) as exc:
        raise HTTPException(status_code=502, detail="The published panel could not be loaded from Supabase.") from exc

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
